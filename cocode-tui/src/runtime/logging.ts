import { randomUUID } from 'node:crypto'
import { closeSync, createReadStream, createWriteStream, existsSync, fsyncSync, mkdirSync, openSync, readdirSync, renameSync, statSync, unlinkSync, writeSync } from 'node:fs'
import { join } from 'node:path'
import { resolveCocodeLogLayout } from '@cocode/host-supervisor'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'

const MAX_BYTES = 10 * 1024 * 1024
const MAX_FILES = 7
const MAX_TOTAL_BYTES = 70 * 1024 * 1024
const MAX_STRING = 4_096

export type TuiLogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal'
export type TuiLogAttribute = string | number | boolean | null

export interface TuiLoggerOptions {
  readonly root?: string
  readonly version?: string
}

export class TuiLogger {
  readonly logDirectory: string
  readonly appRunId = randomUUID()
  private readonly currentPath: string
  private fd: number | undefined
  private bytes = 0
  private sequence = 0

  constructor(options: TuiLoggerOptions = {}) {
    const layout = resolveCocodeLogLayout(
      options.root === undefined ? process.env : { ...process.env, COCODE_LOG_ROOT: options.root },
    )
    this.logDirectory = layout.tui
    this.currentPath = join(this.logDirectory, 'current.jsonl')
    this.version = options.version ?? process.env.COCODE_BUILD_ID ?? 'unknown'
    try {
      this.open()
      this.prune()
    } catch (error) {
      try { process.stderr.write(`[cocode-tui-log] ${String(error)}\n`) } catch { /* best effort */ }
      this.fd = undefined
    }
  }

  private readonly version: string

  log(level: TuiLogLevel, eventName: string, attributes?: Readonly<Record<string, TuiLogAttribute>>): void {
    const record = {
      timestamp: new Date().toISOString(),
      severityText: level.toUpperCase(),
      eventId: randomUUID(),
      sequence: ++this.sequence,
      source: 'tui' as const,
      eventName: clean(eventName, 128),
      serviceName: 'cocode-tui' as const,
      serviceVersion: clean(this.version, 128),
      appRunId: this.appRunId,
      processType: 'tui' as const,
      component: 'cocode-tui',
      ...(attributes === undefined ? {} : { attributes: sanitizeAttributes(attributes) }),
    }
    try {
      const line = `${JSON.stringify(record)}\n`
      this.rotateIfNeeded(Buffer.byteLength(line))
      this.ensureOpen()
      if (this.fd === undefined) return
      writeSync(this.fd, line)
      this.bytes += Buffer.byteLength(line)
    } catch (error) {
      try { process.stderr.write(`[cocode-tui-log] ${String(error)}\n`) } catch { /* best effort */ }
    }
  }

  debug(eventName: string, attributes?: Readonly<Record<string, TuiLogAttribute>>): void { this.log('debug', eventName, attributes) }
  info(eventName: string, attributes?: Readonly<Record<string, TuiLogAttribute>>): void { this.log('info', eventName, attributes) }
  warn(eventName: string, attributes?: Readonly<Record<string, TuiLogAttribute>>): void { this.log('warn', eventName, attributes) }
  error(eventName: string, attributes?: Readonly<Record<string, TuiLogAttribute>>): void { this.log('error', eventName, attributes) }
  fatal(eventName: string, attributes?: Readonly<Record<string, TuiLogAttribute>>): void { this.log('fatal', eventName, attributes) }

  flush(): void {
    if (this.fd === undefined) return
    try { fsyncSync(this.fd) } catch { /* best effort */ }
  }

  close(): void {
    if (this.fd === undefined) return
    this.flush()
    closeSync(this.fd)
    this.fd = undefined
  }

  private open(): void {
    mkdirSync(this.logDirectory, { recursive: true, mode: 0o700 })
    this.fd = openSync(this.currentPath, 'a', 0o600)
    this.bytes = existsSync(this.currentPath) ? statSync(this.currentPath).size : 0
  }

  private ensureOpen(): void {
    if (this.fd === undefined) this.open()
  }

  private rotateIfNeeded(incomingBytes: number): void {
    if (this.bytes === 0 || this.bytes + incomingBytes <= MAX_BYTES) return
    this.close()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    try {
      const rotated = join(this.logDirectory, `tui-${stamp}.jsonl`)
      renameSync(this.currentPath, rotated)
      this.open()
      void this.compress(rotated)
      this.prune()
    } catch {
      this.open()
    }
  }

  private prune(): void {
    if (!existsSync(this.logDirectory)) return
    const files = readdirSync(this.logDirectory)
      .filter((file) => file.startsWith('tui-') && (file.endsWith('.jsonl') || file.endsWith('.jsonl.gz')))
      .map((file) => ({ file, stat: statSync(join(this.logDirectory, file)) }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    let total = files.reduce((sum, item) => sum + item.stat.size, 0)
    for (const [index, item] of files.entries()) {
      if (index < MAX_FILES && total <= MAX_TOTAL_BYTES) continue
      try {
        unlinkSync(join(this.logDirectory, item.file))
        total -= item.stat.size
      } catch { /* best effort */ }
    }
  }

  private async compress(file: string): Promise<void> {
    const compressed = `${file}.gz`
    try {
      await pipeline(createReadStream(file), createGzip({ level: 6 }), createWriteStream(compressed, { mode: 0o600 }))
      unlinkSync(file)
    } catch {
      try { unlinkSync(compressed) } catch { /* best effort */ }
    }
  }
}

function sanitizeAttributes(attributes: Readonly<Record<string, TuiLogAttribute>>): Record<string, TuiLogAttribute> {
  const sensitive = /(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|credential|oauth|prompt|completion|response|body|headers?|args?|output|clipboard|env)/i
  const result: Record<string, TuiLogAttribute> = {}
  for (const [key, value] of Object.entries(attributes).slice(0, 64)) {
    result[key] = sensitive.test(key) || (typeof value === 'string' && sensitiveContent.test(value))
      ? '[REDACTED]'
      : typeof value === 'string'
        ? clean(value, MAX_STRING)
        : value
  }
  return result
}

const sensitiveContent = /\b(?:prompt|completion|assistant\s+(?:message|response)|model\s+(?:response|output)|tool\s+(?:input|output|arguments?)|clipboard\s+contents?|password|token|api[-_]?key)\b/i

function clean(value: string, max: number): string {
  return value.replace(/[\r\n]/g, ' ').replaceAll(String.fromCharCode(0), ' ').slice(0, max)
}
