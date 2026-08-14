import type { Context } from '@deepseek-ai/cordis'
import { registerDefinedPanel } from '../../runtime/panels/registry.ts'
import { jobsPanel } from '../../panels/jobs/index.tsx'

export const name = 'jobs'
export const inject = ['panels', 'slots']

export function apply(ctx: Context) {
  registerDefinedPanel(ctx, jobsPanel)
  ctx.slots.register({
    name: 'shell.palette',
    order: 46,
    inject: () => ({
      id: 'panel.jobs',
      label: `打开 ${jobsPanel.title}`,
      group: '面板',
      icon: 'jobs',
      run: () => { ctx.get('layout')?.store.getState().openPanel('jobs') },
    }),
  }, Empty)
}

function Empty() {
  return null
}
