import type { Context } from '@deepseek-ai/cordis'
import { registerDefinedPanel } from '../../runtime/panels/registry.ts'
import { trajectoryPanel } from '../../panels/trajectory/index.tsx'

export const name = 'trajectory'
export const inject = ['panels', 'slots']

export function apply(ctx: Context) {
  registerDefinedPanel(ctx, trajectoryPanel)
  ctx.slots.register({
    name: 'shell.palette',
    order: 45,
    inject: () => ({
      id: 'panel.trajectory',
      label: `打开 ${trajectoryPanel.title}`,
      group: '面板',
      icon: 'trajectory',
      run: () => { ctx.get('layout')?.store.getState().openPanel('trajectory') },
    }),
  }, Empty)
}

function Empty() {
  return null
}
