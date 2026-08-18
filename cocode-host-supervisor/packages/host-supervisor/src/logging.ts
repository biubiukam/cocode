import { createReadStream, createWriteStream, existsSync, mkdirSync, openSync, readdirSync, statSync, unlinkSync, closeSync, writeSync, renameSync, fsyncSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createGzip } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { join } from 'node:path'
import pino, { type Logger as PinoLogger } from 'pino'
import { Writable } from 'node:stream'
import { hostKey, type HostScope } from './protocol.js'
import { resolveCocodeLogLayout } from './observability.js'

const MAX_BYTES = 20 * 1024 * 1024
const MAX_FILES = 5
const MAX_TOTAL_BYTES = 100 * 1024 * 1024

class HostFileSink extends Writable {
  private readonly directory: string
  private readonly currentPath: string
  private fd: number | null = null
  private bytes = 0
  private openedDate = ''
  private available = true

  constructor(directory: string) {
    super()
    this.directory = directory
    this.currentPath = join(directory, 'current.jsonl')
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 })
      this.open()
      this.prune()
    } catch (error) {
      this.available = false
      try { process.stderr.write(`[cocode-host-log] ${String(error)}\n`) } catch { /* best effort */ }
    }
  }

  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (!this.available) { callback(); return }
    try {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      this.rotateIfNeeded(value.length)
      if (this.fd === null) this.open()
      writeSync(this.fd!, value)
      this.bytes += value.length
      callback()
    } catch (error) {
      this.available = false
      try { process.stderr.write(`[cocode-host-log] ${String(error)}\n`) } catch { /* best effort */ }
      callback()
    }
  }

  flush(): void {
    // The Supervisor logger is intentionally synchronous; there is no buffered transport to drain.
    if (!this.available || this.fd === null) return
    try { fsyncSync(this.fd) } catch (error) {
      this.available = false
      try { process.stderr.write(`[cocode-host-log] ${String(error)}\n`) } catch { /* best effort */ }
    }
  }

  close(): void {
    if (this.fd === null) return
    try { fsyncSync(this.fd) } catch { /* best effort */ }
    closeSync(this.fd)
    this.fd = null
  }

  private open(): void {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    this.fd = openSync(this.currentPath, 'a', 0o600)
    const existing = existsSync(this.currentPath) ? statSync(this.currentPath) : undefined
    this.bytes = existing?.size ?? 0
    this.openedDate = existing === undefined || existing.size === 0
      ? new Date().toISOString().slice(0, 10)
      : new Date(existing.mtimeMs).toISOString().slice(0, 10)
  }

  private rotateIfNeeded(incomingBytes: number): void {
    const today = new Date().toISOString().slice(0, 10)
    if (this.bytes === 0 || (this.bytes + incomingBytes <= MAX_BYTES && this.openedDate === today)) return
    this.close()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const rotated = join(this.directory, `host-${stamp}.jsonl`)
    if (!renameCurrent(this.currentPath, rotated)) {
      try { this.open() } catch { this.available = false }
      return
    }
    try { this.open() } catch { this.available = false; return }
    void this.compress(rotated)
    this.prune()
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

  private prune(): void {
    const files = readdirSync(this.directory)
      .filter((file) => file.startsWith('host-') && (file.endsWith('.jsonl') || file.endsWith('.jsonl.gz')))
      .map((file) => ({ file, stat: statSync(join(this.directory, file)) }))
      .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
    let total = files.reduce((sum, entry) => sum + entry.stat.size, 0)
    const now = Date.now()
    for (const [index, entry] of files.entries()) {
      const expired = now - entry.stat.mtimeMs > 7 * 24 * 60 * 60 * 1000
      if (!expired && index < MAX_FILES && total <= MAX_TOTAL_BYTES) continue
      try {
        unlinkSync(join(this.directory, entry.file))
        total -= entry.stat.size
      } catch {
        // A failed cleanup must not affect Host availability.
      }
    }
  }
}

export interface HostLoggerOptions {
  readonly stateDirectory: string
  readonly scope?: HostScope
  readonly logDirectory?: string
  readonly runtimeVersion?: string
}

export class HostLogger {
  readonly logDirectory: string
  private readonly sink: HostFileSink
  private readonly logger: PinoLogger
  private readonly appRunId = randomUUID()
  private readonly supervisorRunId = randomUUID()
  private readonly hostKeyValue: string | undefined
  private sequence = 0

  constructor(options: HostLoggerOptions) {
    this.hostKeyValue = options.scope === undefined ? undefined : hostKey(options.scope)
    this.logDirectory = options.logDirectory
      ?? (this.hostKeyValue === undefined
        ? join(options.stateDirectory, 'logs', 'host')
        : join(resolveCocodeLogLayout().host, this.hostKeyValue))
    this.sink = new HostFileSink(this.logDirectory)
    this.logger = pino({
      base: null,
      level: 'info',
      timestamp: false,
      formatters: { level: (label) => ({ severityText: label.toUpperCase() }) },
      mixin: () => ({
        timestamp: new Date().toISOString(),
        serviceName: 'cocode-host-supervisor',
        serviceVersion: options.runtimeVersion ?? 'unknown',
        appRunId: this.appRunId,
      }),
    }, this.sink)
  }

  log(level: 'debug' | 'info' | 'warn' | 'error' | 'fatal', eventName: string, attributes?: Record<string, string | number | boolean | null>): void {
    const method = this.logger[level] as (value: unknown, message?: string) => void
    method.call(this.logger, {
      eventId: randomUUID(),
      sequence: ++this.sequence,
      source: 'host',
      eventName: safeText(eventName, 128),
      processType: 'supervisor',
      component: 'host-supervisor',
      supervisorRunId: this.supervisorRunId,
      ...(this.hostKeyValue === undefined ? {} : { hostKey: this.hostKeyValue }),
      ...(attributes === undefined ? {} : { attributes: sanitizeAttributes(attributes) }),
    })
  }

  hostLine(stream: 'stdout' | 'stderr', line: string): void {
    const safe = sanitizeHostLine(line)
    this.logger.info({
      eventId: randomUUID(),
      sequence: ++this.sequence,
      source: 'host',
      eventName: stream === 'stderr' ? 'dsh.host.stderr' : 'dsh.host.stdout',
      processType: 'dsh-host',
      component: 'dsh-host',
      supervisorRunId: this.supervisorRunId,
      ...(this.hostKeyValue === undefined ? {} : { hostKey: this.hostKeyValue }),
      attributes: { stream, line: safe.text, truncated: safe.truncated },
    })
  }

  flush(): void {
    try { this.logger.flush() } catch { /* pino flush is best effort for sync sinks */ }
    this.sink.flush()
  }

  close(): void {
    this.flush()
    this.sink.close()
  }
}

function renameCurrent(current: string, rotated: string): boolean {
  try {
    renameSync(current, rotated)
    return true
  } catch {
    // If rotation fails, reopen the existing current file and continue logging.
    return false
  }
}

function safeText(value: string, maxLength: number): string {
  return value.replace(/[\r\n]/g, ' ').replaceAll(String.fromCharCode(0), ' ').slice(0, maxLength)
}

function sanitizeAttributes(attributes: Record<string, string | number | boolean | null>): Record<string, string | number | boolean | null> {
  const sensitive = /(?:authorization|cookie|password|passwd|secret|token|api[-_]?key|credential|oauth|prompt|completion|response|body|headers?|args?|output|clipboard|env)/i
  const result: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(attributes).slice(0, 64)) {
    result[key] = sensitive.test(key)
      ? '[REDACTED]'
      : typeof value === 'string'
        ? redactText(value)
        : value
  }
  return result
}

function sanitizeHostLine(value: string): { text: string; truncated: boolean } {
  const redacted = redactText(value)
  const text = redacted.slice(0, 32_768)
  return { text, truncated: redacted.length > text.length }
}

function redactText(value: string): string {
  const safe = safeText(value, 65_536)
  if (/\b(?:prompt|completion|assistant\s+(?:message|response)|model\s+(?:response|output)|tool\s+(?:input|output|arguments?)|clipboard\s+contents?|password|token|api[-_]?key)\b/i.test(safe)) return '[REDACTED]'
  return safe
    .replace(/((?:https?|wss?):\/\/[^\s?#]+)(?:\?[^\s#]*)?(?:#[^\s]*)?/gi, '$1')
    .replace(/("(?:prompt|content|arguments|tool(?:_name)?|output|token|secret|password|api[-_]?key)"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"')
    .replace(/\b(?:prompt|content|arguments|tool(?:_name)?|output|token|secret|password|api[-_]?key)\s*[:=]\s*[^\s,;]+/gi, '[REDACTED]')
    .replace(/\b(?:Bearer\s+)?(?:sk-|token[-_ ]?|password\s*[=:])[^\s,;]+/gi, '[REDACTED]')
}
