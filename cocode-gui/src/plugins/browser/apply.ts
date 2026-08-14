import type { Context } from '@deepseek-ai/cordis'
import { registerDefinedPanel } from '../../runtime/panels/registry.ts'
import { browserPanel } from '../../panels/browser/index.tsx'
import { registerBrowserLinkOpener } from '../../runtime/browser/link-open.ts'

export const name = 'browser'
export const inject = ['panels', 'slots', 'layout']

export function apply(ctx: Context) {
  registerDefinedPanel(ctx, browserPanel)

  ctx.effect(() => registerBrowserLinkOpener(url => {
    ctx.get('layout')?.store.getState().openPanel('browser', { target: url })
  }))

  ctx.slots.register({
    name: 'shell.palette',
    order: 44,
    inject: () => ({
      id: 'panel.browser',
      label: `打开 ${browserPanel.title}`,
      group: '面板',
      icon: 'browser',
      run: () => { ctx.get('layout')?.store.getState().openPanel('browser') },
    }),
  }, Empty)
}

function Empty() {
  return null
}
