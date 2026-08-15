import { EventEmitter } from 'node:events'
import { spawn } from 'node:child_process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { externalOpenCommand, openExternal } from '../../../src/runtime/auth/open-url.ts'

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}))

const spawnMock = vi.mocked(spawn)

describe('external browser command', () => {
  const url = 'https://cocode.agency/device?code=a&source=tui'

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('uses the native opener without shell interpolation', () => {
    expect(externalOpenCommand(url, 'darwin')).toEqual({ command: 'open', args: [url] })
    expect(externalOpenCommand(url, 'win32')).toEqual({
      command: 'explorer.exe',
      args: [url],
    })
    expect(externalOpenCommand(url, 'linux')).toEqual({ command: 'xdg-open', args: [url] })
  })

  it('reports failure after WSL opener candidates fail', () => {
    const first = Object.assign(new EventEmitter(), { unref: vi.fn() }) as unknown as ReturnType<
      typeof spawn
    >
    const second = Object.assign(new EventEmitter(), { unref: vi.fn() }) as unknown as ReturnType<
      typeof spawn
    >
    const onFailure = vi.fn()
    spawnMock.mockReturnValueOnce(first).mockReturnValueOnce(second)

    openExternal(url, {
      platform: 'linux',
      env: { WSL_DISTRO_NAME: 'Ubuntu' },
      onFailure,
    })
    first.emit('exit', 1)
    second.emit('error', new Error('xdg-open missing'))

    expect(spawnMock).toHaveBeenCalledTimes(2)
    expect(onFailure).toHaveBeenCalledOnce()
  })
})
