import type { Context } from '@deepseek-ai/cordis'
import { isLoopbackOrigin } from '../../host/bridge.ts'
import { PluginsPage } from '../../shell/center/plugins-page.tsx'
import { ManagementLink } from '../../shell/sidebar/management-link.tsx'

export const name = 'plugin-page'
export const inject = ['slots']

function privileged(ctx: Context): boolean {
  return isLoopbackOrigin(ctx.get('connection')?.state.get().baseUrl ?? '')
}

export function apply(ctx: Context) {
  ctx.slots.register({ name: 'center.view', key: 'plugins' }, PluginsPage)
  ctx.slots.register({
    name: 'sidebar.management',
    order: 20,
    inject: () => ({
      view: 'plugins',
      label: '插件',
      icon: 'puzzle',
      loopbackOnly: true,
    }),
  }, ManagementLink)
  ctx.slots.register({
    name: 'shell.palette',
    order: 21,
    inject: () => ({
      id: 'center.plugins',
      label: '打开插件',
      group: '导航',
      icon: 'puzzle',
      disabled: !privileged(ctx),
      hint: privileged(ctx) ? undefined : '需要本机连接',
      run: () => { ctx.get('layout')?.store.getState().setCenterView('plugins') },
    }),
  }, Empty)
}

function Empty() {
  return null
}
