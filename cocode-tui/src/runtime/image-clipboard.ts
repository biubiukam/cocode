/** Read raster image bytes from the native clipboard without changing it. */

import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { isAbsolute, resolve } from 'node:path'
import type { TuiImageInput, TuiImageMediaType } from '@cocode/tui-connection'

export const MAX_CLIPBOARD_IMAGE_BYTES = 5 * 1024 * 1024

type ClipboardImageCommand = {
  command: string
  args: readonly string[]
  output: 'base64' | 'binary'
  mediaType?: TuiImageMediaType
}

export type ClipboardImageRunner = (
  command: string,
  args: readonly string[],
  maxOutputBytes: number,
) => Promise<Buffer>

export class ClipboardImageError extends Error {
  constructor(readonly code: 'unavailable' | 'empty' | 'too-large' | 'unsupported') {
    super(code)
    this.name = 'ClipboardImageError'
  }
}

export async function readClipboardImage(options: {
  platform?: NodeJS.Platform
  run?: ClipboardImageRunner
} = {}): Promise<TuiImageInput> {
  const platform = options.platform ?? process.platform
  const commands = clipboardImageCommands(platform)
  if (commands.length === 0) throw new ClipboardImageError('unavailable')
  const run = options.run ?? runClipboardImageCommand
  let commandAvailable = false
  let unsupported = false

  for (const candidate of commands) {
    try {
      const encodedLimit = candidate.output === 'base64'
        ? Math.ceil(MAX_CLIPBOARD_IMAGE_BYTES / 3) * 4 + 1024
        : MAX_CLIPBOARD_IMAGE_BYTES + 1
      const output = await run(candidate.command, candidate.args, encodedLimit)
      commandAvailable = true
      if (output.length === 0) continue
      const image = candidate.output === 'base64'
        ? decodeBase64Output(output)
        : decodeBinaryOutput(output, candidate.mediaType)
      if (image.data.byteLength > MAX_CLIPBOARD_IMAGE_BYTES) {
        throw new ClipboardImageError('too-large')
      }
      return image
    } catch (error) {
      if (error instanceof ClipboardImageError) {
        if (error.code === 'too-large') throw error
        unsupported ||= error.code === 'unsupported'
        continue
      }
      if (!isMissingCommand(error)) commandAvailable = true
    }
  }

  if (!commandAvailable) throw new ClipboardImageError('unavailable')
  throw new ClipboardImageError(unsupported ? 'unsupported' : 'empty')
}

export async function readImageFile(path: string): Promise<TuiImageInput> {
  const data = await readFile(path)
  if (data.length > MAX_CLIPBOARD_IMAGE_BYTES) {
    throw new ClipboardImageError('too-large')
  }
  return imageInput(data)
}

export function pastedImagePath(input: string, cwd = process.cwd()): string | undefined {
  let value = input
    .replace(/^\u001b\[200~/u, '')
    .replace(/\u001b\[201~$/u, '')
    .trim()
  if (value === '') return undefined

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  if (value.startsWith('file://')) {
    try {
      value = fileURLToPath(value)
    } catch {
      return undefined
    }
  } else {
    value = value.replace(/\\ /gu, ' ')
  }
  if (!isAbsolute(value)) value = resolve(cwd, value)
  if (!/\.(?:png|jpe?g|webp|gif)$/iu.test(value)) return undefined
  return value
}

export function clipboardImageCommands(platform: NodeJS.Platform): readonly ClipboardImageCommand[] {
  if (platform === 'darwin') {
    return [{ command: 'osascript', args: ['-l', 'JavaScript', '-e', MACOS_CLIPBOARD_SCRIPT], output: 'base64' }]
  }
  if (platform === 'win32') {
    return [
      { command: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-STA', '-Command', WINDOWS_CLIPBOARD_SCRIPT], output: 'base64' },
      { command: 'pwsh', args: ['-NoProfile', '-NonInteractive', '-STA', '-Command', WINDOWS_CLIPBOARD_SCRIPT], output: 'base64' },
    ]
  }
  if (platform === 'linux') {
    return IMAGE_MEDIA_TYPES.flatMap((mediaType) => [
      { command: 'wl-paste', args: ['--no-newline', '--type', mediaType], output: 'binary' as const, mediaType },
      { command: 'xclip', args: ['-selection', 'clipboard', '-t', mediaType, '-o'], output: 'binary' as const, mediaType },
      { command: 'xsel', args: ['--clipboard', '--output'], output: 'binary' as const, mediaType },
    ])
  }
  return []
}

export function detectImageMediaType(data: Uint8Array): TuiImageMediaType | undefined {
  if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(data, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (
    startsWith(data, [0x52, 0x49, 0x46, 0x46]) &&
    data.length >= 12 &&
    String.fromCharCode(...data.slice(8, 12)) === 'WEBP'
  ) return 'image/webp'
  if (startsWith(data, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) || startsWith(data, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])) {
    return 'image/gif'
  }
  return undefined
}

function decodeBase64Output(output: Buffer): TuiImageInput {
  const split = output.toString('utf8').trim().split(/\r?\n/, 2)
  const declared = split[0]
  const encoded = split[1]
  if (!isImageMediaType(declared) || encoded === undefined || !BASE64_PATTERN.test(encoded)) {
    throw new ClipboardImageError('unsupported')
  }
  const data = Buffer.from(encoded, 'base64')
  if (data.length === 0 || data.toString('base64') !== encoded) {
    throw new ClipboardImageError('unsupported')
  }
  return imageInput(data, declared)
}

function decodeBinaryOutput(output: Buffer, declared?: TuiImageMediaType): TuiImageInput {
  if (output.length === 0) throw new ClipboardImageError('empty')
  return imageInput(output, declared)
}

function imageInput(data: Uint8Array, declared?: TuiImageMediaType): TuiImageInput {
  const detected = detectImageMediaType(data)
  if (detected === undefined || (declared !== undefined && declared !== detected)) {
    throw new ClipboardImageError('unsupported')
  }
  return { data: new Uint8Array(data), mediaType: detected }
}

function startsWith(data: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => data[index] === byte)
}

function isImageMediaType(value: unknown): value is TuiImageMediaType {
  return IMAGE_MEDIA_TYPES.includes(value as TuiImageMediaType)
}

function isMissingCommand(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function runClipboardImageCommand(
  command: string,
  args: readonly string[],
  maxOutputBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
    const chunks: Buffer[] = []
    let bytes = 0
    let settled = false
    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length
      if (bytes > maxOutputBytes) {
        child.kill()
        if (!settled) {
          settled = true
          reject(new ClipboardImageError('too-large'))
        }
        return
      }
      chunks.push(chunk)
    })
    child.once('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
    child.once('close', (code) => {
      if (settled) return
      settled = true
      if (code === 0) resolve(Buffer.concat(chunks))
      else reject(new Error(`${command} exited with code ${String(code)}`))
    })
  })
}

const IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

const MACOS_CLIPBOARD_SCRIPT = String.raw`
ObjC.import('AppKit')
ObjC.import('Foundation')
const pasteboard = $.NSPasteboard.generalPasteboard

function writeOutput(text) {
  const data = $.NSString.stringWithString(text).dataUsingEncoding($.NSUTF8StringEncoding)
  $.NSFileHandle.fileHandleWithStandardOutput.writeData(data)
}

function printImage(mediaType, data) {
  if (!data) return false
  const normalized = $.NSData.dataWithData(data)
  const encoded = ObjC.unwrap(normalized.base64EncodedStringWithOptions(0))
  if (!encoded) return false
  writeOutput(mediaType + '\n' + encoded)
  return true
}

function convertToPng(data) {
  if (!data) return null
  const image = $.NSImage.alloc.initWithData(data)
  if (!image) return null
  const tiff = image.TIFFRepresentation
  if (!tiff) return null
  const bitmap = $.NSBitmapImageRep.imageRepWithData(tiff)
  if (!bitmap) return null
  const png = bitmap.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({}))
  if (!png) return null
  const normalized = $.NSData.dataWithData(png)
  return ObjC.unwrap(normalized.base64EncodedStringWithOptions(0))
}

const formats = [
  ['public.png', 'image/png'],
  ['public.jpeg', 'image/jpeg'],
  ['public.webp', 'image/webp'],
  ['com.compuserve.gif', 'image/gif'],
]
let emitted = false
for (const [type, mediaType] of formats) {
  const value = pasteboard.dataForType(type)
  if (!value) continue
  emitted = printImage(mediaType, value)
  if (emitted) break
}

if (!emitted) {
  const tiff = pasteboard.dataForType('public.tiff')
  const encoded = convertToPng(tiff)
  if (encoded) {
    writeOutput('image/png' + '\n' + encoded)
    emitted = true
  }
}

const fileUrlValue = emitted ? null : pasteboard.stringForType('public.file-url')
if (!emitted && fileUrlValue) {
  const fileUrl = $.NSURL.URLWithString(fileUrlValue)
  if (fileUrl && fileUrl.isFileURL) {
    const fileData = $.NSData.dataWithContentsOfURL(fileUrl)
    const encoded = convertToPng(fileData)
    if (encoded) writeOutput('image/png' + '\n' + encoded)
  }
}
`

const WINDOWS_CLIPBOARD_SCRIPT = String.raw`
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$image = [Windows.Forms.Clipboard]::GetImage()
if ($null -ne $image) {
  $stream = New-Object IO.MemoryStream
  try {
    $image.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
    [Console]::Out.Write("image/png" + [char]10 + [Convert]::ToBase64String($stream.ToArray()))
  } finally {
    $stream.Dispose()
    $image.Dispose()
  }
}
`
