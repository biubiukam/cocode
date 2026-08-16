/**
 * Human transport: one bidirectional socket carrying binary frames down and
 * input events up.
 *
 * The existing workbench RPC route cannot carry this. Video over a text RPC
 * channel would starve everything else on it, and the frame path needs the
 * ack round-trip that gives us back-pressure for free.
 */
import type { IncomingMessage } from "node:http"
import type { Duplex } from "node:stream"
import { WebSocketServer, type WebSocket } from "ws"
import { isTrustedUpgrade } from "../upgrade-trust.ts"
import type { BrowserRuntime } from "./runtime.ts"
import type { BrowserTab } from "./tabs.ts"
import { applyInput, readSelection } from "./input.ts"
import type { Screencast } from "./screencast.ts"
import {
  BROWSER_STREAM_PATH,
  BrowserError,
  encodeFrame,
  type BrowserInputEvent,
  type BrowserStreamMessage,
} from "./protocol.ts"

interface StreamSession {
  tab?: BrowserTab
  cast?: Screencast
  sessionId?: string
}

export interface StreamOptions {
  readonly runtime: BrowserRuntime
  /** Resolve the workspace directory backing a session, for upload bounds. */
  readonly workspaceOf: (sessionId: string | undefined) => string | undefined
}

export function createBrowserStream(options: StreamOptions): {
  path: string
  handler: (request: IncomingMessage, socket: Duplex, head: Buffer) => void
  dispose: () => void
} {
  const server = new WebSocketServer({ noServer: true })
  const sessions = new Map<WebSocket, StreamSession>()

  const send = (socket: WebSocket, message: BrowserStreamMessage): void => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
  }

  const broadcast = (message: BrowserStreamMessage): void => {
    for (const socket of sessions.keys()) send(socket, message)
  }

  const unobserve = options.runtime.observe({
    onTabs: tabs => { broadcast({ kind: "tabs", tabs }) },
    onEngine: status => { broadcast({ kind: "engine", status }) },
    onDownloads: downloads => { broadcast({ kind: "downloads", downloads }) },
    onApproval: request => { broadcast({ kind: "approval", request }) },
    onApprovalResolved: id => { broadcast({ kind: "approvalResolved", id }) },
  })

  const fail = (socket: WebSocket, error: unknown): void => {
    const code = error instanceof BrowserError ? error.code : "BROWSER_CAPABILITY_UNAVAILABLE"
    send(socket, { kind: "error", code, message: error instanceof Error ? error.message : String(error) })
  }

  const attach = async (socket: WebSocket, session: StreamSession, tabId?: string): Promise<void> => {
    const status = await options.runtime.probe()
    send(socket, { kind: "engine", status })
    if (!status.ready) return
    const tab = tabId === undefined ? await options.runtime.humanTab() : options.runtime.tabs.require(tabId)
    session.tab = tab
    session.cast = options.runtime.screencast(tab, (header, payload) => {
      if (socket.readyState === socket.OPEN) socket.send(encodeFrame(header, payload))
    })
    send(socket, { kind: "attached", tabId: tab.id })
    send(socket, { kind: "tabs", tabs: options.runtime.list() })
  }

  const handle = async (socket: WebSocket, session: StreamSession, event: BrowserInputEvent): Promise<void> => {
    switch (event.kind) {
      case "attach": {
        session.sessionId = event.sessionId
        await options.runtime.releaseScreencast(session.tab?.id ?? "")
        await attach(socket, session, event.tabId)
        return
      }
      case "subscribe": {
        if (session.cast === undefined) return
        await (event.enabled ? session.cast.start() : session.cast.stop())
        return
      }
      case "ack": {
        session.cast?.ack(event.seq)
        return
      }
      case "viewport": {
        if (session.tab === undefined) return
        await options.runtime.resizeViewport(session.tab, event)
        return
      }
      case "mouse":
      case "key":
      case "text": {
        const tab = session.tab
        if (tab === undefined) return
        const significant = await applyInput(tab, event)
        // Any human input invalidates the agent's view of this page.
        if (significant) options.runtime.preempt(tab)
        return
      }
      case "copy": {
        if (session.tab === undefined) return
        send(socket, { kind: "clipboard", text: await readSelection(session.tab) })
        return
      }
      case "navigate": {
        const tab = session.tab
        if (tab === undefined) return
        options.runtime.preempt(tab)
        if (event.url !== undefined) await options.runtime.tabs.navigate(tab, event.url)
        else if (event.to === "back") await tab.page.goBack().catch(() => { /* no history */ })
        else if (event.to === "forward") await tab.page.goForward().catch(() => { /* no history */ })
        else await tab.page.reload().catch(() => { /* page gone */ })
        return
      }
      case "open": {
        const tab = await options.runtime.tabs.open({ owner: "human", url: event.url })
        await options.runtime.releaseScreencast(session.tab?.id ?? "")
        session.tab = tab
        session.cast = options.runtime.screencast(tab, (header, payload) => {
          if (socket.readyState === socket.OPEN) socket.send(encodeFrame(header, payload))
        })
        send(socket, { kind: "attached", tabId: tab.id })
        await session.cast.start()
        return
      }
      case "closeTab": {
        await options.runtime.releaseScreencast(event.tabId)
        await options.runtime.tabs.close(event.tabId)
        if (session.tab?.id === event.tabId) {
          session.tab = undefined
          session.cast = undefined
        }
        return
      }
      case "dialog": {
        session.tab?.settleDialog({ accept: event.accept, ...(event.text === undefined ? {} : { text: event.text }) })
        return
      }
      case "install": {
        await options.runtime.install()
        await attach(socket, session)
        return
      }
      case "cancelDownload": {
        options.runtime.tabs.cancelDownload(event.id)
        return
      }
      case "approve": {
        options.runtime.resolveApproval(event.id, event.granted)
        return
      }
      case "revoke": {
        options.runtime.preempt(options.runtime.tabs.require(event.tabId))
        return
      }
    }
  }

  server.on("connection", (socket: WebSocket) => {
    const session: StreamSession = {}
    sessions.set(socket, session)
    send(socket, { kind: "engine", status: options.runtime.status() })
    socket.on("message", (data: Buffer | string) => {
      let event: BrowserInputEvent
      try { event = JSON.parse(typeof data === "string" ? data : data.toString("utf8")) as BrowserInputEvent }
      catch { return }
      void handle(socket, session, event).catch(error => { fail(socket, error) })
    })
    socket.on("close", () => {
      sessions.delete(socket)
      // An invisible viewport must cost nothing: stop the screencast with it.
      const tabId = session.tab?.id
      if (tabId !== undefined) void options.runtime.releaseScreencast(tabId)
    })
    socket.on("error", () => { sessions.delete(socket) })
  })

  return {
    path: BROWSER_STREAM_PATH,
    handler: (request, socket, head) => {
      if (!isTrustedUpgrade(request)) {
        socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n")
        socket.destroy()
        return
      }
      server.handleUpgrade(request, socket, head, ws => { server.emit("connection", ws, request) })
    },
    dispose: () => {
      unobserve()
      for (const socket of sessions.keys()) socket.close()
      sessions.clear()
      server.close()
    },
  }
}
