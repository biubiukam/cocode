import { app, safeStorage } from "electron"
import { readFile, unlink, writeFile } from "node:fs/promises"
import { join } from "pathe"

export class SecureVault<T> {
	private loaded = false
	private value: T | undefined

	constructor(private readonly filename: string) {}

	async read(): Promise<T | undefined> {
		if (this.loaded) return this.value
		this.loaded = true
		if (!safeStorage.isEncryptionAvailable()) return undefined
		try {
			const encrypted = await readFile(join(app.getPath("userData"), this.filename))
			this.value = JSON.parse(safeStorage.decryptString(encrypted)) as T
		} catch {
			this.value = undefined
		}
		return this.value
	}

	async write(value: T): Promise<void> {
		if (!safeStorage.isEncryptionAvailable()) throw new Error("secure storage is unavailable")
		this.value = value
		this.loaded = true
		await writeFile(
			join(app.getPath("userData"), this.filename),
			safeStorage.encryptString(JSON.stringify(value)),
			{ mode: 0o600 },
		)
	}

	async clear(): Promise<void> {
		this.value = undefined
		this.loaded = true
		try {
			await unlink(join(app.getPath("userData"), this.filename))
		} catch {
			// Idempotent cleanup.
		}
	}
}
