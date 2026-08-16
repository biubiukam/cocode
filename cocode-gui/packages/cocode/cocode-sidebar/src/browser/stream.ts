/**
 * The viewport transport: JPEG frames down, input events up.
 *
 * Frames ride the binary channel with a small JSON header so the client can
 * size its canvas without a second message, and control traffic rides the
 * same socket as JSON text. One socket keeps frame delivery and the input
 * that caused it strictly ordered — a resize can never overtake the frame it
 * invalidates.
 *
 * The socket is a VIEW, not the owner: dropping it leaves the page alive for
 * the reconnect grace, so reloading the GUI does not lose the user's place.
 */
import type { IncomingMessage } from 'node:http'
import { WebSocket } from 'ws'
import type { BrowserEngine } from './engine.ts'
import type { BrowserRegistry } from './registry.ts'
import type { BrowserTab, TabListener } from './tab.ts'
import type {
  BrowserClientFrame,
  BrowserFrameHeader,
  BrowserServerFrame,
} from './protocol.ts'
import { BrowserError, isReconciledBrowserTabId } from './protocol.ts'
import type { SidebarHttpRequest } from '../context-types.ts'

/** Drop frames for a socket already this far behind (bytes). */
const BACKPRESSURE_LIMIT = 4 * 1024 * 1024

/**
 * Encode one screencast frame: a 4-byte big-endian header length, the UTF-8
 * JSON header, then the raw JPEG. Length-prefixing (rather than a second
 * message) keeps a frame atomic — the client can never pair a header with the
 * wrong payload.
 */
export function encodeFrame(header: BrowserFrameHeader, jpeg: Buffer): Buffer {
  const meta = Buffer.from(JSON.stringify(header), 'utf8')
  const prefix = Buffer.allocUnsafe(4)
  prefix.writeUInt32BE(meta.byteLength, 0)
  return Buffer.concat([prefix, meta, jpeg])
}

/**
 * The origin the GUI itself is served from, refused by the tab's navigation
 * policy. The browser's own `Origin` header is authoritative; the `Host`
 * header is the fallback for clients that omit it.
 */
export function selfOriginOf(req: SidebarHttpRequest): string | undefined {
  const origin = headerOf(req, 'origin')
  if (origin !== undefined && origin !== 'null') return origin
  const host = headerOf(req, 'host')
  return host === undefined ? undefined : `http://${host}`
}

function headerOf(req: SidebarHttpRequest, name: string): string | undefined {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] : value
}

/**
 * Serve one sidebar browser viewport.
 *
 * @param registry - The session tab book.
 * @param engine - Chromium lifecycle, for the install prompt.
 * @param ws - The upgraded socket.
 * @param req - The upgrade request (carries the scope query and the origin).
 */
export async function attachBrowserViewport(
  registry: BrowserRegistry,
  engine: BrowserEngine,
  ws: WebSocket,
  req: SidebarHttpRequest,
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://dsh.internal')
  const sessionId = url.searchParams.get('sessionId')
  const tabId = url.searchParams.get('tab')
  if (sessionId === null || tabId === null) {
    ws.close(1008, 'sessionId and tab are required')
    return
  }
  const selfOrigin = selfOriginOf(req)

  const send = (frame: BrowserServerFrame): void => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame))
  }
  const fail = (error: unknown): void => {
    const code = error instanceof BrowserError ? error.code : 'BROWSER_ERROR'
    send({ t: 'error', code, message: error instanceof Error ? error.message : String(error) })
  }

  const listener: TabListener = {
    frame: (header, jpeg) => {
      // A viewport that cannot keep up simply misses frames; blocking the
      // page for one slow socket would be worse than a dropped frame.
      if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < BACKPRESSURE_LIMIT) {
        ws.send(encodeFrame(header, jpeg))
      }
    },
    state: (state) => { send({ t: 'state', state }) },
    dialog: (dialog) => { send({ t: 'dialog', dialog }) },
    download: (name, path) => { send({ t: 'download', name, path }) },
    error: (code, message) => { send({ t: 'error', code, message }) },
  }

  send({ t: 'engine', status: await engine.probe() })
  const unwatchEngine = engine.watch((status) => { send({ t: 'engine', status }) })

  let tab: BrowserTab | undefined
  let detach: (() => void) | undefined
  // The page is created on the first frame that needs it, so a sidebar tab
  // the user never navigates costs no renderer process.
  const ensureTab = async (): Promise<BrowserTab> => {
    if (tab !== undefined) return tab
    tab = await registry.ensure(sessionId, tabId, { selfOrigin })
    detach = tab.subscribe(listener)
    send({ t: 'state', state: await tab.state() })
    return tab
  }

  const watch = async (on: boolean): Promise<void> => {
    const live = await ensureTab()
    if (on) {
      if (detach === undefined) {
        detach = live.subscribe(listener)
        send({ t: 'state', state: await live.state() })
      }
      return
    }
    detach?.()
    detach = undefined
  }

  ws.on('message', (data: Buffer) => {
    void handleClientFrame(data, ensureTab, send, watch, async () => {
      detach?.()
      detach = undefined
      tab = undefined
      await registry.close(sessionId, tabId)
    }).catch(fail)
  })
  ws.on('close', () => {
    detach?.()
    unwatchEngine()
    // The socket is a view: leave the page alive briefly so a GUI reload
    // reattaches to the same session instead of a blank tab.
    registry.scheduleClose(sessionId, tabId)
  })
}

/** Decode and apply one client frame. */
async function handleClientFrame(
  data: Buffer,
  ensureTab: () => Promise<BrowserTab>,
  send: (frame: BrowserServerFrame) => void,
  watch: (on: boolean) => Promise<void>,
  closeTab: () => Promise<void>,
): Promise<void> {
  let frame: BrowserClientFrame
  try {
    frame = JSON.parse(data.toString('utf8')) as BrowserClientFrame
  } catch {
    return
  }
  const tab = await ensureTab()
  switch (frame.t) {
    case 'open':
      await tab.open(frame.url)
      return
    case 'nav':
      await tab.navigate(frame.to)
      return
    case 'viewport':
      await tab.resize(frame.width, frame.height)
      return
    case 'mouse':
      await tab.input('Input.dispatchMouseEvent', {
        type: mouseTypeOf(frame.kind),
        x: frame.x,
        y: frame.y,
        button: frame.button,
        buttons: frame.buttons,
        modifiers: frame.modifiers,
        clickCount: frame.clickCount ?? 0,
        ...(frame.kind === 'wheel' ? { deltaX: frame.deltaX ?? 0, deltaY: frame.deltaY ?? 0 } : {}),
      })
      return
    case 'key':
      await tab.input('Input.dispatchKeyEvent', {
        type: frame.kind === 'down' ? (frame.text === undefined ? 'rawKeyDown' : 'keyDown') : 'keyUp',
        key: frame.key,
        code: frame.code,
        windowsVirtualKeyCode: frame.keyCode,
        nativeVirtualKeyCode: frame.keyCode,
        modifiers: frame.modifiers,
        ...(frame.text === undefined ? {} : { text: frame.text, unmodifiedText: frame.text }),
      })
      return
    case 'insert':
      await tab.input('Input.insertText', { text: frame.text })
      return
    case 'copy':
      send({ t: 'copy', text: await tab.readSelection() })
      return
    case 'dialog':
      await tab.answerDialog(frame.accept, frame.text)
      return
    case 'watch':
      await watch(frame.on)
      return
    case 'download-cancel':
      await tab.cancelDownload()
      return
    case 'permission':
      await tab.setPermission(frame.name, frame.grant)
      return
    case 'close':
      // An explicit close is the user discarding the tab, so the page goes
      // now rather than after the reconnect grace.
      await closeTab()
      return
  }
}

/** Map the viewport's mouse vocabulary onto CDP's. */
function mouseTypeOf(kind: 'move' | 'down' | 'up' | 'wheel'): string {
  if (kind === 'move') return 'mouseMoved'
  if (kind === 'down') return 'mousePressed'
  if (kind === 'up') return 'mouseReleased'
  return 'mouseWheel'
}

/**
 * Push one session's live browser tab list, so tabs the MODEL opened appear
 * in the sidebar on their own — the same reconcile contract the agent
 * terminals use.
 */
export function attachBrowserTabList(
  registry: BrowserRegistry,
  ws: WebSocket,
  req: SidebarHttpRequest,
): void {
  const url = new URL(req.url ?? '/', 'http://dsh.internal')
  const sessionId = url.searchParams.get('sessionId')
  if (sessionId === null) {
    ws.close(1008, 'sessionId is required')
    return
  }
  const push = (): void => {
    if (ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify(registry.list(sessionId).filter(tab => isReconciledBrowserTabId(tab.tabId))))
  }
  push()
  const unsubscribe = registry.subscribe(sessionId, push)
  ws.on('close', unsubscribe)
}

/** Cast the structural upgrade request to the `ws` package's expected type. */
export type UpgradeRequest = IncomingMessage
