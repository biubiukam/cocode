import type { Context } from '@deepseek-ai/cordis'
import { registerDefinedPanel } from '../../runtime/panels/registry.ts'
import { filesPanel } from '../../panels/files/index.tsx'

export const name = 'files'
export const inject = ['panels', 'slots']

export function apply(ctx: Context) {
  registerDefinedPanel(ctx, filesPanel)
  ctx.slots.register({
    name: 'shell.palette',
    order: 40,
    inject: () => ({
      id: 'panel.files',
      label: `打开 ${filesPanel.title}`,
      group: '面板',
      icon: 'file',
      run: () => { ctx.get('layout')?.store.getState().openPanel('files') },
    }),
  }, Empty)
}

function Empty() {
  return null
}
