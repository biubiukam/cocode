import { describe, expect, it } from 'vitest'
import { externalOpenCommand } from '../../../src/runtime/auth/open-url.ts'

describe('external browser command', () => {
  const url = 'https://cocode.agency/device?code=a&source=tui'

  it('uses the native opener without shell interpolation', () => {
    expect(externalOpenCommand(url, 'darwin')).toEqual({ command: 'open', args: [url] })
    expect(externalOpenCommand(url, 'win32')).toEqual({
      command: 'explorer.exe',
      args: [url],
    })
    expect(externalOpenCommand(url, 'linux')).toEqual({ command: 'xdg-open', args: [url] })
  })
})
