import type { Context } from '@deepseek-ai/cordis'
import { registerDefinedPanel } from '../../runtime/panels/registry.ts'
import { terminalPanel } from '../../panels/terminal/index.tsx'
import { getDockPrefs } from '../../runtime/prefs/dock-prefs.ts'
import { openTerminalIds } from '../../runtime/terminals/keepalive.ts'

export const name = 'terminal'
export const inject = ['panels', 'slots', 'shortcuts', 'layout', 'connection', 'sessions']

function countUserTerminals(ctx: Context): number {
  const state = ctx.get('layout')?.store.getState()
  if (state === undefined) return 0
  let count = 0
  for (const tab of [...state.right.tabs, ...state.bottom.tabs]) {
    if (tab.panelId !== 'terminal') continue
    if (tab.instanceKey === null || tab.instanceKey.startsWith('agent:')) continue
    count += 1
  }
  return count
}

async function openTerminal(ctx: Context): Promise<boolean> {
  const limit = getDockPrefs().terminalLimit
  if (countUserTerminals(ctx) >= limit) return false

  const layout = ctx.get('layout')?.store.getState()
  const connection = ctx.get('connection')
  const sessions = ctx.get('sessions')
  const transport = connection?.activeTransport
  const workspaceId = sessions?.getSnapshot().activeWorkspaceId

  if (layout !== undefined && transport !== undefined && workspaceId !== undefined && getDockPrefs().terminalKeepAlive) {
    const listed = await transport.call('terminal.list', { workspaceId })
    if (listed.ok) {
      const open = openTerminalIds(workspaceId, [...layout.right.tabs, ...layout.bottom.tabs])
      const orphan = listed.value.items.find(item => (
        item.kind === 'user' && item.writable && !open.has(item.terminalId)
      ))
      if (orphan !== undefined) {
        layout.openPanel('terminal', { target: orphan.terminalId })
        return true
      }
    }
  }

  if (transport !== undefined && workspaceId !== undefined) {
    const created = await transport.call('terminal.create', { workspaceId })
    if (created.ok) {
      ctx.get('layout')?.store.getState().openPanel('terminal', { target: created.value.terminalId })
      return true
    }
  }

  ctx.get('layout')?.store.getState().openPanel('terminal')
  return true
}

export function apply(ctx: Context) {
  registerDefinedPanel(ctx, terminalPanel)
  ctx.slots.register({
    name: 'shell.palette',
    order: 42,
    inject: () => ({
      id: 'panel.terminal',
      label: `打开 ${terminalPanel.title}`,
      group: '面板',
      icon: 'terminal',
      run: () => { void openTerminal(ctx) },
    }),
  }, Empty)
  ctx.shortcuts.register({
    id: 'terminal.new',
    description: '新建终端实例',
    combo: { key: '`', control: true },
    allowInTextEntry: false,
    run: () => {
      void openTerminal(ctx)
      return true
    },
  })
}

function Empty() {
  return null
}
