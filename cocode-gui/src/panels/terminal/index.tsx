/**
 * Terminal: a real PTY in the workspace (RFC §3.5).
 *
 * Bytes never enter React. A Dock tab owns one harness PTY; hiding the bottom
 * dock or remounting xterm must not mint another session.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Globe, SquareTerminal } from 'lucide-react'
import { Badge, Button, EmptyState } from '@cocode/ui'
import type { HarnessTransport, TerminalView } from '@cocode/gui-connection'
import { definePanel, type PanelProps } from '../types.ts'
import { isLoopbackOrigin } from '../../host/bridge.ts'
import {
  useConnection,
  useConnectionService,
  useLayoutActions,
  useLayoutService,
  useSessionDirectory,
  useTerminals,
} from '../../shell/runtime-context.tsx'
import { getDockPrefs } from '../../runtime/prefs/dock-prefs.ts'
import {
  boundTerminalId,
  forgetTerminalBinding,
  openTerminalIds,
  rememberTerminalBinding,
} from '../../runtime/terminals/keepalive.ts'
import { useToast } from '../../shell/overlay/toast.tsx'

const LOCALHOST_RE = /https?:\/\/(?:localhost|127\.0\.0\.1):\d{2,5}\b/gi

/** One in-flight open per tab instance; Strict Mode and effect churn must not double-create. */
const opening = new Map<string, Promise<ResolvedTerminal>>()

function isAgentTarget(target: string | undefined): boolean {
  return typeof target === 'string' && target.startsWith('agent:')
}

function isTerminalTabOpen(instanceKey: string, tabs: readonly { panelId: string; instanceKey: string | null }[]): boolean {
  return tabs.some(tab => tab.panelId === 'terminal' && tab.instanceKey === instanceKey)
}

function TerminalPanel({ target }: PanelProps<string>) {
  const connectionService = useConnectionService()
  const terminals = useTerminals()
  const connection = useConnection()
  const directory = useSessionDirectory()
  const actions = useLayoutActions()
  const layout = useLayoutService()
  const toast = useToast()
  const workspaceId = directory.activeWorkspaceId
  const privileged = isLoopbackOrigin(connection.baseUrl)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [hostReady, setHostReady] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const [label, setLabel] = useState(isAgentTarget(target) ? 'Agent' : '终端')
  const [agent, setAgent] = useState(isAgentTarget(target))
  const [localhostUrl, setLocalhostUrl] = useState<string | undefined>(undefined)
  const scrollRef = useRef('')
  const agentTarget = isAgentTarget(target)
  const generation = connection.phase === 'ready' ? connection.generation : undefined

  const setHost = useCallback((node: HTMLDivElement | null) => {
    hostRef.current = node
    setHostReady(node !== null)
  }, [])

  useEffect(() => {
    if (!privileged || workspaceId === undefined || target === undefined) return
    if (generation === undefined || !hostReady || hostRef.current === null) return

    const transport = connectionService.activeTransport
    if (transport === undefined) return

    let cancelled = false
    let terminalId: string | undefined
    let term: XTerm | undefined
    let detach: (() => void) | undefined
    const controller = new AbortController()
    const keepAlive = () => getDockPrefs().terminalKeepAlive
    const { right, bottom } = layout.store.getState()
    const openIds = openTerminalIds(workspaceId, [...right.tabs, ...bottom.tabs])

    void (async () => {
      const resolved = agentTarget
        ? await attachById(transport, workspaceId, target, controller.signal)
        : await openUser(transport, workspaceId, target, openIds, controller.signal)
      if (cancelled) {
        if (resolved.ok && !agentTarget && !keepAlive()) {
          const { right: r, bottom: b } = layout.store.getState()
          if (!isTerminalTabOpen(target, [...r.tabs, ...b.tabs])) {
            void transport.call('terminal.close', { terminalId: resolved.view.terminalId })
          }
        }
        return
      }
      if (!resolved.ok) {
        setError(resolved.error)
        return
      }
      const view = resolved.view
      terminalId = view.terminalId
      if (!agentTarget) rememberTerminalBinding(workspaceId, target, terminalId)
      setError(undefined)
      setLabel(view.name)
      setAgent(view.kind === 'agent')
      const host = hostRef.current
      if (host === null) return
      const styles = getComputedStyle(host)
      const xterm = new XTerm({
        cursorBlink: view.writable,
        disableStdin: !view.writable,
        fontSize: 12,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        theme: {
          background: styles.backgroundColor,
          foreground: styles.color,
        },
      })
      const fit = new FitAddon()
      xterm.loadAddon(fit)
      xterm.open(host)
      fit.fit()
      term = xterm
      detach = terminals.buffer(terminalId).attach(data => {
        xterm.write(data)
        scrollRef.current = `${scrollRef.current}${data}`.slice(-32_768)
        const matches = scrollRef.current.match(LOCALHOST_RE)
        if (matches !== null && matches.length > 0) {
          setLocalhostUrl(matches[matches.length - 1])
        }
      })
      if (view.writable) {
        xterm.onData(data => {
          void transport.call('terminal.write', { terminalId: view.terminalId, data })
        })
      }
      const resize = () => {
        fit.fit()
        void transport.call('terminal.resize', {
          terminalId: view.terminalId,
          cols: xterm.cols,
          rows: xterm.rows,
        })
      }
      resize()
      const observer = new ResizeObserver(resize)
      observer.observe(host)
      controller.signal.addEventListener('abort', () => observer.disconnect())
    })()

    return () => {
      cancelled = true
      controller.abort()
      detach?.()
      term?.dispose()
      if (terminalId === undefined || agentTarget) return

      const { right: r, bottom: b } = layout.store.getState()
      if (isTerminalTabOpen(target, [...r.tabs, ...b.tabs])) return

      if (keepAlive()) return

      terminals.drop(terminalId)
      forgetTerminalBinding(workspaceId, target)
      void connectionService.activeTransport?.call('terminal.close', { terminalId })
    }
  }, [privileged, workspaceId, target, generation, hostReady, agentTarget, terminals, connectionService, layout])

  if (workspaceId === undefined) {
    return <EmptyState icon={SquareTerminal} title="没有选中的项目" description="从左侧选择一个项目后，可以在此打开终端。" className="m-4" />
  }
  if (!privileged) {
    return (
      <EmptyState
        icon={SquareTerminal}
        title="远程连接无法打开终端"
        description="PTY 被 harness 限定在 loopback 同源。改用本机运行或经隧道同源访问即可恢复。"
        className="m-4"
      />
    )
  }
  if (error !== undefined) {
    return <EmptyState icon={SquareTerminal} title="终端无法启动" description={error} className="m-4" />
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="flex min-h-[32px] shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="truncate text-[12px] font-semibold text-foreground">{label}</span>
        {agent ? <Badge tone="warning">Agent</Badge> : null}
        <span className="flex-1" />
        {localhostUrl === undefined
          ? null
          : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  actions.openPanel('browser', { target: localhostUrl })
                  toast.push('info', `已在浏览器面板打开 ${localhostUrl}`)
                }}
              >
                <Globe className="size-3.5" />
                打开 {localhostUrl.replace(/^https?:\/\//, '')}
              </Button>
            )}
      </div>
      <div ref={setHost} className="min-h-0 flex-1 bg-surface-sunken p-2" />
    </div>
  )
}

type ResolvedTerminal =
  | { ok: true; view: TerminalView }
  | { ok: false; error: string }

async function attachById(
  transport: HarnessTransport,
  workspaceId: string,
  terminalId: string,
  signal: AbortSignal,
): Promise<ResolvedTerminal> {
  const listed = await transport.call('terminal.list', { workspaceId }, { signal })
  if (!listed.ok) return { ok: false, error: listed.error.message }
  const view = listed.value.items.find(item => item.terminalId === terminalId)
  if (view === undefined) return { ok: false, error: '终端已经结束。' }
  return { ok: true, view }
}

/** Attach an existing user PTY when possible; otherwise create. */
async function openUser(
  transport: HarnessTransport,
  workspaceId: string,
  target: string,
  openIds: Set<string>,
  signal: AbortSignal,
): Promise<ResolvedTerminal> {
  const inflightKey = `${workspaceId}:${target}`
  const pending = opening.get(inflightKey)
  if (pending !== undefined) return pending

  const promise = openUserOnce(transport, workspaceId, target, openIds, signal)
  opening.set(inflightKey, promise)
  try {
    return await promise
  }
  finally {
    opening.delete(inflightKey)
  }
}

async function openUserOnce(
  transport: HarnessTransport,
  workspaceId: string,
  target: string,
  openIds: Set<string>,
  signal: AbortSignal,
): Promise<ResolvedTerminal> {
  const listed = await transport.call('terminal.list', { workspaceId }, { signal })
  if (listed.ok) {
    const resolvedId = boundTerminalId(workspaceId, target) ?? target
    const exact = listed.value.items.find(item => item.terminalId === resolvedId && item.kind === 'user')
    if (exact !== undefined) return { ok: true, view: exact }
    if (getDockPrefs().terminalKeepAlive) {
      const orphan = listed.value.items.find(item => (
        item.kind === 'user' && item.writable && !openIds.has(item.terminalId)
      ))
      if (orphan !== undefined && orphan.terminalId !== target) {
        return { ok: true, view: orphan }
      }
    }
  }
  const created = await transport.call('terminal.create', { workspaceId }, { signal })
  if (!created.ok) return { ok: false, error: created.error.message }
  return { ok: true, view: created.value }
}

export const terminalPanel = definePanel<string>({
  id: 'terminal',
  title: '终端',
  icon: SquareTerminal,
  scope: 'workspace',
  multiInstance: true,
  preferredDock: 'bottom',
  describe: target => (isAgentTarget(target) ? 'Agent' : '终端'),
  toKey: target => target,
  fromKey: key => key,
  mintInstance: () => crypto.randomUUID(),
  render: props => <TerminalPanel {...props} />,
})
