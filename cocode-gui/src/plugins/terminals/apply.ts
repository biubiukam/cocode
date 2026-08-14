import type { Context } from '@deepseek-ai/cordis'
import type { MuxFrame } from '@cocode/gui-connection'
import { isTerminalMuxFrame, TerminalStore } from '../../runtime/terminals/store.ts'

export const name = 'terminals'
export const inject = ['connection', 'sessions', 'layout']

const AGENT_TERMINAL_POLL_MS = 2_000

export function apply(ctx: Context) {
  const terminals = new TerminalStore()
  ctx.reflect.provide('terminals', terminals)

  ctx.sessions.route('terminal/output', ({ frame }) => {
    const mux = frame as MuxFrame
    if (isTerminalMuxFrame(mux)) terminals.applyFrame(mux)
  })
  ctx.sessions.route('terminal/exit', ({ frame }) => {
    const mux = frame as MuxFrame
    if (isTerminalMuxFrame(mux)) terminals.applyFrame(mux)
  })

  const seen = new Set<string>()
  let timer: ReturnType<typeof setInterval> | undefined

  const tick = (): void => {
    const transport = ctx.get('connection')?.activeTransport
    if (transport === undefined) return
    void transport.call('terminal.list', {}).then((result) => {
      if (!result.ok) return
      for (const item of result.value.items) {
        if (item.kind !== 'agent') continue
        if (seen.has(item.terminalId)) continue
        seen.add(item.terminalId)
        ctx.get('layout')?.store.getState().openPanel('terminal', {
          target: item.terminalId,
          dock: 'bottom',
          focus: false,
        })
      }
    })
  }

  ctx.on('connection/ready', () => {
    seen.clear()
    if (timer !== undefined) clearInterval(timer)
    tick()
    timer = setInterval(tick, AGENT_TERMINAL_POLL_MS)
  })
  ctx.on('connection/lost', () => {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
    seen.clear()
  })
  ctx.effect(() => () => {
    if (timer !== undefined) clearInterval(timer)
  }, 'terminals.watch')
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    terminals: import('../../runtime/terminals/store.ts').TerminalStore
  }
}
