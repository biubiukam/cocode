import { afterEach, describe, expect, it } from 'vitest'
import { desktopRuntimeUrl } from '../src/client/desktop-runtime.ts'

const marker = '__DSH_DESKTOP_RUNTIME_ORIGIN__'

afterEach(() => {
  delete (globalThis as Record<string, unknown>)[marker]
})

describe('desktopRuntimeUrl', () => {
  it('keeps ordinary dsh web URLs relative', () => {
    expect(desktopRuntimeUrl('/sidebar/file')).toBe('/sidebar/file')
  })

  it('targets the Electron sidecar when the desktop boot marker is present', () => {
    ;(globalThis as Record<string, unknown>)[marker] = 'http://127.0.0.1:43127'
    expect(desktopRuntimeUrl('/sidebar/file?id=1')).toBe(
      'http://127.0.0.1:43127/sidebar/file?id=1',
    )
  })
})
