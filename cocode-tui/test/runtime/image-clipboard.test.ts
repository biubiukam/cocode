import { describe, expect, it } from 'vitest'
import {
  ClipboardImageError,
  clipboardImageCommands,
  detectImageMediaType,
  pastedImagePath,
  readClipboardImage,
} from '../../src/runtime/image-clipboard.ts'

const PNG = Buffer.from('iVBORw0KGgo=', 'base64')

describe('image clipboard', () => {
  it('detects supported raster signatures', () => {
    expect(detectImageMediaType(PNG)).toBe('image/png')
    expect(detectImageMediaType(Uint8Array.of(0xff, 0xd8, 0xff, 0x00))).toBe('image/jpeg')
    expect(detectImageMediaType(Buffer.from('GIF89a'))).toBe('image/gif')
    expect(detectImageMediaType(Buffer.from('not-an-image'))).toBeUndefined()
  })

  it('decodes the macOS base64 clipboard contract', async () => {
    const image = await readClipboardImage({
      platform: 'darwin',
      run: async () => Buffer.from(`image/png\n${PNG.toString('base64')}`),
    })
    expect(image.mediaType).toBe('image/png')
    expect(Buffer.from(image.data)).toEqual(PNG)
  })

  it('falls through Linux clipboard commands until an image is found', async () => {
    const calls: string[] = []
    const image = await readClipboardImage({
      platform: 'linux',
      run: async (command, args) => {
        calls.push(`${command} ${args.join(' ')}`)
        if (args.includes('image/png') && command === 'xclip') return PNG
        throw new Error('clipboard target unavailable')
      },
    })
    expect(image.mediaType).toBe('image/png')
    expect(calls).toHaveLength(2)
  })

  it('recognizes image paths pasted by terminal image integrations', () => {
    expect(pastedImagePath('/tmp/screenshot.png', '/tmp')).toBe('/tmp/screenshot.png')
    expect(pastedImagePath('"/tmp/screenshot one.jpg"', '/tmp')).toBe('/tmp/screenshot one.jpg')
    expect(pastedImagePath('notes.txt', '/tmp')).toBeUndefined()
    expect(pastedImagePath('/tmp/missing.png\n', '/tmp')).toBe('/tmp/missing.png')
  })

  it('reports an unavailable clipboard implementation', async () => {
    await expect(readClipboardImage({
      platform: 'freebsd',
      run: async () => Buffer.alloc(0),
    })).rejects.toMatchObject<Partial<ClipboardImageError>>({ code: 'unavailable' })
  })

  it('defines native readers for macOS, Windows, and Linux', () => {
    const macos = clipboardImageCommands('darwin')[0]
    expect(macos?.command).toBe('osascript')
    expect(macos?.args.join('\n')).toContain('public.tiff')
    expect(macos?.args.join('\n')).toContain('public.file-url')
    expect(macos?.args.join('\n')).toContain('fileHandleWithStandardOutput.writeData')
    expect(clipboardImageCommands('win32').map((entry) => entry.command)).toEqual([
      'powershell.exe',
      'pwsh',
    ])
    expect(clipboardImageCommands('linux').some((entry) => entry.command === 'wl-paste')).toBe(true)
  })
})
