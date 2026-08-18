import { describe, expect, it } from 'vitest'
import {
  beginPluginMutation,
  completePluginMutation,
  createPluginPicker,
  failPluginMutation,
  movePluginSelection,
  selectedPlugin,
  setPluginQuery,
  visiblePlugins,
} from '../../src/runtime/plugin-picker.ts'

const plugins = [
  {
    entryId: 'include:sample',
    moduleName: '@cocode/sample-plugin',
    enabled: true,
    fiberPhase: 'active' as const,
  },
  {
    entryId: 'include:legacy',
    moduleName: '@deepseek-ai/dsh-legacy',
    enabled: false,
    fiberPhase: null,
  },
]

describe('plugin picker', () => {
  it('searches module names, entry ids, and enablement', () => {
    expect(
      visiblePlugins(setPluginQuery(createPluginPicker(plugins), 'sample')).map(
        (plugin) => plugin.entryId,
      ),
    ).toEqual(['include:sample'])
    expect(
      visiblePlugins(setPluginQuery(createPluginPicker(plugins), '禁用')).map(
        (plugin) => plugin.entryId,
      ),
    ).toEqual(['include:legacy'])
  })

  it('wraps selection over the filtered list', () => {
    const picker = movePluginSelection(createPluginPicker(plugins), -1)
    expect(selectedPlugin(picker)?.entryId).toBe('include:legacy')
  })

  it('keeps the picker open while updating one plugin', () => {
    const pending = beginPluginMutation(createPluginPicker(plugins), 'include:sample')
    expect(pending.pendingEntryId).toBe('include:sample')

    const updated = completePluginMutation(
      pending,
      { ...plugins[0], enabled: false, fiberPhase: null },
      'updated',
    )
    expect(updated.open).toBe(true)
    expect(updated.pendingEntryId).toBeUndefined()
    expect(updated.plugins[0]?.enabled).toBe(false)
    expect(updated.status).toEqual({ tone: 'info', message: 'updated' })

    expect(failPluginMutation(pending, 'failed').status).toEqual({
      tone: 'error',
      message: 'failed',
    })
  })
})
