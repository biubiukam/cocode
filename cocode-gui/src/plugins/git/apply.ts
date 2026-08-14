import type { Context } from '@deepseek-ai/cordis'
import { registerDefinedPanel } from '../../runtime/panels/registry.ts'
import { gitPanel } from '../../panels/git/index.tsx'

export const name = 'git'
export const inject = ['panels', 'slots']

export function apply(ctx: Context) {
  registerDefinedPanel(ctx, gitPanel)
  ctx.slots.register({
    name: 'shell.palette',
    order: 41,
    inject: () => ({
      id: 'panel.git',
      label: `打开 ${gitPanel.title}`,
      group: '面板',
      icon: 'git',
      run: () => { ctx.get('layout')?.store.getState().openPanel('git') },
    }),
  }, Empty)
}

function Empty() {
  return null
}
