/** Pure state transitions for the runtime plugin manager. */

import type { TuiPluginEntry } from '@cocode/tui-connection'
import type { UiLocale } from './ui-locale.ts'

export type PluginPickerStatus = {
  tone: 'info' | 'error'
  message: string
}

export type PluginPickerState = {
  plugins: readonly TuiPluginEntry[]
  query: string
  selected: number
  open: boolean
  pendingEntryId?: string
  status?: PluginPickerStatus
}

export const PLUGIN_PICKER_WINDOW_SIZE = 8

export function pluginPhaseLabel(
  phase: TuiPluginEntry['fiberPhase'],
  locale: UiLocale,
): string {
  if (phase === null) return locale === 'zh' ? '未加载' : 'not loaded'
  if (locale === 'en') return phase
  return {
    pending: '等待加载',
    loading: '加载中',
    active: '运行中',
    failed: '失败',
    unloading: '卸载中',
  }[phase]
}

export function createPluginPicker(plugins: readonly TuiPluginEntry[]): PluginPickerState {
  return { plugins: [...plugins], query: '', selected: 0, open: true }
}

export function setPluginQuery(state: PluginPickerState, query: string): PluginPickerState {
  return { ...state, query, selected: 0 }
}

export function movePluginSelection(state: PluginPickerState, delta: number): PluginPickerState {
  const visible = visiblePlugins(state)
  if (visible.length === 0) return { ...state, selected: 0 }
  return {
    ...state,
    selected: (((state.selected + delta) % visible.length) + visible.length) % visible.length,
  }
}

export function selectedPlugin(state: PluginPickerState): TuiPluginEntry | undefined {
  return visiblePlugins(state)[state.selected]
}

export function closePluginPicker(state: PluginPickerState): PluginPickerState {
  return { ...state, open: false }
}

export function beginPluginMutation(
  state: PluginPickerState,
  entryId: string,
): PluginPickerState {
  return { ...state, pendingEntryId: entryId, status: undefined }
}

export function completePluginMutation(
  state: PluginPickerState,
  plugin: TuiPluginEntry,
  message: string,
): PluginPickerState {
  const plugins = state.plugins.map((entry) =>
    entry.entryId === plugin.entryId ? plugin : entry,
  )
  return clampPluginSelection({
    ...state,
    plugins,
    pendingEntryId: undefined,
    status: { tone: 'info', message },
  })
}

export function failPluginMutation(state: PluginPickerState, message: string): PluginPickerState {
  return {
    ...state,
    pendingEntryId: undefined,
    status: { tone: 'error', message },
  }
}

export function visiblePlugins(state: PluginPickerState): TuiPluginEntry[] {
  const query = state.query.trim().toLocaleLowerCase()
  if (query === '') return [...state.plugins]
  return state.plugins.filter((plugin) =>
    [
      plugin.moduleName,
      plugin.entryId,
      plugin.enabled ? 'enabled 启用' : 'disabled 禁用',
      plugin.fiberPhase ?? 'not loaded 未加载',
    ]
      .join(' ')
      .toLocaleLowerCase()
      .includes(query),
  )
}

function clampPluginSelection(state: PluginPickerState): PluginPickerState {
  const visible = visiblePlugins(state)
  return {
    ...state,
    selected: Math.max(0, Math.min(state.selected, Math.max(0, visible.length - 1))),
  }
}
