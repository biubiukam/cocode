import type { Context } from '@deepseek-ai/cordis'
import { AppFrame } from '../../shell/app-frame.tsx'
import { AppearanceSettings, ConnectionSettings, ConfigSettings, ShortcutsSettings } from './ui/settings-sections.tsx'

export const name = 'shell'
export const inject = ['slots', 'layout', 'shortcuts', 'focus']

export function apply(ctx: Context) {
  ctx.slots.register({
    name: 'root',
    children: {
      'sidebar.management': { kind: 'list', scope: 'root' },
      'center.view': { kind: 'keyed', scope: 'root' },
      'settings.section': { kind: 'list', scope: 'root' },
      'shell.palette': { kind: 'list', scope: 'root' },
      'shell.overlay': { kind: 'list', scope: 'root' },
      'conversation.chat.node': { kind: 'keyed', scope: 'session' },
      'conversation.tool.view': { kind: 'keyed', scope: 'session' },
      'conversation.utilities': { kind: 'list', scope: 'session' },
      'conversation.composer': { kind: 'list', scope: 'session' },
      'conversation.composer.leading': { kind: 'list', scope: 'session' },
      'conversation.composer.trailing': { kind: 'list', scope: 'session' },
      'conversation.header.actions': { kind: 'list', scope: 'session' },
    },
  }, AppFrame)

  const layout = () => ctx.get('layout')?.store.getState()

  ctx.shortcuts.register({
    id: 'sidebar.toggle',
    description: '开合左侧任务列表',
    combo: { key: 'b', primary: true },
    run: () => {
      layout()?.toggleSidebar()
      return true
    },
  })
  ctx.shortcuts.register({
    id: 'dock.right.toggle',
    description: '开合右侧 Dock',
    combo: { key: 'b', primary: true, alt: true },
    run: () => {
      layout()?.toggleDock('right')
      return true
    },
  })
  ctx.shortcuts.register({
    id: 'dock.bottom.toggle',
    description: '开合底部 Dock',
    combo: { key: 'j', primary: true },
    run: () => {
      layout()?.toggleDock('bottom')
      return true
    },
  })
  ctx.shortcuts.register({
    id: 'command-palette.open',
    description: '打开命令面板',
    combo: { key: 'p', primary: true },
    aliases: [{ key: 'k', primary: true }],
    browserCombo: { key: 'k', primary: true },
    run: () => {
      ctx.emit('shell/open-palette')
      return true
    },
  })
  ctx.shortcuts.register({
    id: 'settings.open',
    description: '打开设置',
    combo: { key: ',', primary: true },
    run: () => {
      ctx.emit('shell/open-settings')
      return true
    },
  })
  ctx.shortcuts.register({
    id: 'dock.tab.close',
    description: '关闭当前 Dock 的活跃标签',
    combo: { key: 'w', primary: true },
    browserCombo: { key: 'w', alt: true },
    run: () => {
      const dock = ctx.get('focus')?.activeDock()
      if (dock === undefined) return false
      layout()?.closeActiveTab(dock)
      return true
    },
  })

  ctx.slots.register({
    name: 'shell.palette',
    order: 11,
    inject: () => ({
      id: 'settings.open',
      label: '打开设置',
      group: '动作',
      icon: 'settings',
      hint: ctx.get('shortcuts')?.list().find(row => row.definition.id === 'settings.open')?.label,
      run: () => { ctx.emit('shell/open-settings') },
    }),
  }, Empty)
  ctx.slots.register({
    name: 'shell.palette',
    order: 30,
    inject: () => ({
      id: 'sidebar.toggle',
      label: '开合左侧任务列表',
      group: '动作',
      icon: 'sidebar',
      hint: ctx.get('shortcuts')?.list().find(row => row.definition.id === 'sidebar.toggle')?.label,
      run: () => { layout()?.toggleSidebar() },
    }),
  }, Empty)
  ctx.slots.register({
    name: 'shell.palette',
    order: 31,
    inject: () => ({
      id: 'dock.right.toggle',
      label: '开合右侧 Dock',
      group: '动作',
      icon: 'dock-right',
      hint: ctx.get('shortcuts')?.list().find(row => row.definition.id === 'dock.right.toggle')?.label,
      run: () => { layout()?.toggleDock('right') },
    }),
  }, Empty)
  ctx.slots.register({
    name: 'shell.palette',
    order: 32,
    inject: () => ({
      id: 'dock.bottom.toggle',
      label: '开合底部 Dock',
      group: '动作',
      icon: 'dock-bottom',
      hint: ctx.get('shortcuts')?.list().find(row => row.definition.id === 'dock.bottom.toggle')?.label,
      run: () => { layout()?.toggleDock('bottom') },
    }),
  }, Empty)

  ctx.slots.register({
    name: 'settings.section',
    order: 10,
    inject: () => ({
      id: 'appearance',
      group: '个人',
      label: '外观',
      description: '主题与界面偏好。',
      icon: 'palette',
    }),
  }, AppearanceSettings)
  ctx.slots.register({
    name: 'settings.section',
    order: 11,
    inject: () => ({
      id: 'shortcuts',
      group: '个人',
      label: '快捷键',
      description: '当前生效的键盘组合。',
      icon: 'keyboard',
    }),
  }, ShortcutsSettings)
  ctx.slots.register({
    name: 'settings.section',
    order: 20,
    inject: () => ({
      id: 'connection',
      group: '系统',
      label: '连接',
      description: '载体与 harness 连接状态。',
      icon: 'link',
    }),
  }, ConnectionSettings)
  ctx.slots.register({
    name: 'settings.section',
    order: 21,
    inject: () => ({
      id: 'config',
      group: '系统',
      label: '配置与凭证',
      description: '打开 harness 配置文件。',
      icon: 'settings',
    }),
  }, ConfigSettings)
}

function Empty() {
  return null
}
