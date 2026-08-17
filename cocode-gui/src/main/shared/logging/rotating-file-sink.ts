import { createGzip } from "node:zlib"
import {
	createReadStream,
	createWriteStream,
	existsSync,
	mkdirSync,
	openSync,
	readdirSync,
	renameSync,
	statSync,
	unlinkSync,
	closeSync,
	writeSync,
	fsyncSync,
} from "node:fs"
import * as path from "pathe"
import { Writable } from "node:stream"
import { pipeline } from "node:stream/promises"

export interface RotationPolicy {
	readonly maxBytes: number
	readonly maxFiles: number
	readonly maxAgeMs: number
	readonly maxTotalBytes: number
}

export interface RotatingFileSinkOptions {
	readonly directory: string
	readonly filename: string
	readonly policy: RotationPolicy
	readonly onError?: (error: unknown) => void
}

export class RotatingFileSink extends Writable {
	private readonly directory: string
	private readonly currentPath: string
	private readonly policy: RotationPolicy
	private readonly onError: (error: unknown) => void
	private fileDescriptor: number | null = null
	private bytes = 0
	private openedDate = ""
	private available = true

	public constructor(options: RotatingFileSinkOptions) {
		super()
		this.directory = options.directory
		this.currentPath = path.join(options.directory, options.filename)
		this.policy = options.policy
		this.onError = options.onError ?? (() => undefined)
		try {
			mkdirSync(this.directory, { recursive: true, mode: 0o700 })
			this.openCurrent()
			this.prune()
		} catch (error) {
			this.available = false
			this.onError(error)
		}
	}

	public override _write(
		chunk: Buffer | string,
		_encoding: BufferEncoding,
		callback: (error?: Error | null) => void,
	): void {
		if (!this.available) {
			callback()
			return
		}
		try {
			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
			this.rotateIfNeeded(buffer.length)
			if (!this.ensureOpen()) {
				callback()
				return
			}
			const descriptor = this.fileDescriptor
			if (descriptor === null) throw new Error("log sink is not open")
			writeSync(descriptor, buffer)
			this.bytes += buffer.length
			callback()
		} catch (error) {
			this.available = false
			this.onError(error)
			callback()
		}
	}

	public override _final(callback: (error?: Error | null) => void): void {
		try {
			this.flush()
			callback()
		} catch (error) {
			callback(error instanceof Error ? error : new Error(String(error)))
		}
	}

	public flush(): void {
		if (!this.available || this.fileDescriptor === null) return
		try {
			fsyncSync(this.fileDescriptor)
		} catch (error) {
			this.available = false
			this.onError(error)
		}
	}

	public close(): void {
		if (this.fileDescriptor === null) return
		try {
			fsyncSync(this.fileDescriptor)
		} catch {
			/* best effort during shutdown */
		}
		closeSync(this.fileDescriptor)
		this.fileDescriptor = null
	}

	public clear(): void {
		if (!this.ensureOpen()) return
		this.close()
		try {
			const descriptor = openSync(this.currentPath, "w", 0o600)
			closeSync(descriptor)
			this.openCurrent()
			this.prune()
		} catch (error) {
			this.available = false
			this.onError(error)
		}
	}

	public get currentBytes(): number {
		return this.bytes
	}

	private ensureOpen(): boolean {
		if (!this.available) return false
		if (this.fileDescriptor !== null) return true
		try {
			this.openCurrent()
			return true
		} catch (error) {
			this.available = false
			this.onError(error)
			return false
		}
	}

	private openCurrent(): void {
		mkdirSync(this.directory, { recursive: true, mode: 0o700 })
		this.fileDescriptor = openSync(this.currentPath, "a", 0o600)
		const existing = existsSync(this.currentPath) ? statSync(this.currentPath) : undefined
		this.bytes = existing?.size ?? 0
		this.openedDate =
			existing === undefined || existing.size === 0
				? new Date().toISOString().slice(0, 10)
				: new Date(existing.mtimeMs).toISOString().slice(0, 10)
	}

	private rotateIfNeeded(incomingBytes: number): void {
		const today = new Date().toISOString().slice(0, 10)
		if (
			this.bytes === 0 ||
			(this.bytes + incomingBytes <= this.policy.maxBytes && today === this.openedDate)
		)
			return
		this.close()
		const stamp = new Date().toISOString().replace(/[:.]/g, "-")
		const rotated = path.join(
			this.directory,
			`${path.basename(this.currentPath, ".jsonl")}-${stamp}.jsonl`,
		)
		try {
			renameSync(this.currentPath, rotated)
		} catch (error) {
			this.onError(error)
			this.ensureOpen()
			return
		}
		if (!this.ensureOpen()) return
		void this.compress(rotated)
		this.prune()
	}

	private async compress(file: string): Promise<void> {
		const compressed = `${file}.gz`
		try {
			await pipeline(
				createReadStream(file),
				createGzip({ level: 6 }),
				createWriteStream(compressed, { mode: 0o600 }),
			)
			unlinkSync(file)
		} catch (error) {
			this.onError(error)
			try {
				unlinkSync(compressed)
			} catch {
				/* best effort */
			}
		}
	}

	private prune(): void {
		const now = Date.now()
		const files = readdirSync(this.directory)
			.filter((file) => file.endsWith(".jsonl") || file.endsWith(".jsonl.gz"))
			.filter((file) => file !== path.basename(this.currentPath))
			.map((file) => {
				const fullPath = path.join(this.directory, file)
				return { file, fullPath, stat: statSync(fullPath) }
			})
			.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)

		let totalBytes = files.reduce((total, entry) => total + entry.stat.size, 0)
		for (const [index, entry] of files.entries()) {
			const expired = now - entry.stat.mtimeMs > this.policy.maxAgeMs
			const overCount = index >= this.policy.maxFiles
			const overBytes = totalBytes > this.policy.maxTotalBytes
			if (!expired && !overCount && !overBytes) continue
			try {
				unlinkSync(entry.fullPath)
				totalBytes -= entry.stat.size
			} catch (error) {
				this.onError(error)
			}
		}
	}
}

export function readLogDirectoryBytes(directory: string): number {
	if (!existsSync(directory)) return 0
	return readdirSync(directory).reduce((total, file) => {
		const fullPath = path.join(directory, file)
		try {
			return total + statSync(fullPath).size
		} catch {
			return total
		}
	}, 0)
}
