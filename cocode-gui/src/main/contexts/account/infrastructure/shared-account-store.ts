import { constants } from "node:fs"
import { chmod, lstat, mkdir, open, rename, rm, stat, unlink } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "pathe"
import { parse, stringify } from "yaml"
import type { IdentityState } from "../application/account-service"
import { SecureVault } from "./secure-vault"

type AccountYaml = {
	origin?: unknown
	access_token?: unknown
	refresh_token?: unknown
	access_expires_at?: unknown
	personal_key_id?: unknown
	personal_key_name?: unknown
	profile?: unknown
	pre_login_default?: unknown
	managed_route?: unknown
}

type LegacyVault = {
	read(): Promise<IdentityState | undefined>
	clear(): Promise<void>
}

function accountHome(): string {
	const configured = process.env.COCODE_HOME?.trim()
	return resolve(
		configured === undefined || configured === "" ? join(homedir(), ".cocode") : configured,
	)
}

function accountPath(home: string): string {
	return join(home, "account.yaml")
}

function nonempty(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() !== "" ? value : undefined
}

function asIdentity(value: unknown): IdentityState | undefined {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined
	const row = value as AccountYaml
	const origin = nonempty(row.origin)
	const accessToken = nonempty(row.access_token)
	const refreshToken = nonempty(row.refresh_token)
	const expires = row.access_expires_at
	if (origin === undefined || accessToken === undefined || refreshToken === undefined)
		return undefined
	if (typeof expires !== "number" || !Number.isFinite(expires)) return undefined
	return {
		origin,
		accessToken,
		refreshToken,
		accessExpiresAt: expires,
		...(row.profile !== undefined ? { profile: row.profile as IdentityState["profile"] } : {}),
		...(row.pre_login_default !== undefined
			? { preLoginDefault: row.pre_login_default as IdentityState["preLoginDefault"] }
			: {}),
		...(row.managed_route !== undefined
			? { managedRoute: row.managed_route as IdentityState["managedRoute"] }
			: {}),
		...(nonempty(row.personal_key_id) === undefined
			? {}
			: { personalKeyId: nonempty(row.personal_key_id) }),
		...(nonempty(row.personal_key_name) === undefined
			? {}
			: { personalKeyName: nonempty(row.personal_key_name) }),
	}
}

function toYaml(value: IdentityState): AccountYaml {
	return {
		origin: value.origin,
		access_token: value.accessToken,
		refresh_token: value.refreshToken,
		access_expires_at: value.accessExpiresAt,
		...(value.personalKeyId === undefined ? {} : { personal_key_id: value.personalKeyId }),
		...(value.personalKeyName === undefined
			? {}
			: { personal_key_name: value.personalKeyName }),
		...(value.profile === undefined ? {} : { profile: value.profile }),
		...(value.preLoginDefault === undefined
			? {}
			: { pre_login_default: value.preLoginDefault }),
		...(value.managedRoute === undefined ? {} : { managed_route: value.managedRoute }),
	}
}

export class SharedAccountStore {
	constructor(
		private readonly home = accountHome(),
		private readonly legacy: LegacyVault = new SecureVault<IdentityState>(
			"cocode-account-identity.bin",
		),
	) {}

	async read(): Promise<IdentityState | undefined> {
		let value: IdentityState | undefined
		try {
			const path = accountPath(this.home)
			const metadata = await lstat(path)
			if (metadata.isSymbolicLink() || !metadata.isFile()) return undefined
			if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) return undefined
			const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
			let text: string
			try {
				text = await handle.readFile("utf8")
			} finally {
				await handle.close()
			}
			value = asIdentity(parse(text))
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") value = undefined
		}
		if (value === undefined) {
			const legacy = await this.legacy.read()
			if (legacy !== undefined) {
				value = legacy
				await this.write(legacy)
			}
		}
		return value
	}

	async write(value: IdentityState): Promise<void> {
		const path = accountPath(this.home)
		const directory = dirname(path)
		await mkdir(directory, { recursive: true, mode: 0o700 })
		if (process.platform !== "win32") await chmod(directory, 0o700)
		const temporary = join(directory, `.account-${process.pid}-${Date.now()}.tmp`)
		const handle = await open(temporary, "wx", 0o600)
		try {
			await handle.writeFile(stringify(toYaml(value)), "utf8")
			if (process.platform !== "win32") await handle.chmod(0o600)
			await handle.close()
			await rename(temporary, path)
			if (process.platform !== "win32") await chmod(path, 0o600)
		} catch (error) {
			await handle.close().catch(() => undefined)
			await unlink(temporary).catch(() => undefined)
			throw error
		}
	}

	async clear(): Promise<void> {
		await unlink(accountPath(this.home)).catch((error) => {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
		})
		await this.legacy.clear()
	}

	async withLock<T>(operation: () => Promise<T>): Promise<T> {
		await mkdir(this.home, { recursive: true, mode: 0o700 })
		const lock = `${accountPath(this.home)}.lock`
		const deadline = Date.now() + 10_000
		for (;;) {
			try {
				await mkdir(lock, { mode: 0o700 })
				break
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
				try {
					const age = Date.now() - (await stat(lock)).mtimeMs
					if (age > 120_000) {
						await rm(lock, { recursive: true, force: true })
						continue
					}
				} catch (metadataError) {
					if ((metadataError as NodeJS.ErrnoException).code === "ENOENT") continue
					throw metadataError
				}
				if (Date.now() >= deadline)
					throw new Error("Cocode account is busy in another client")
				await new Promise((resolve) => setTimeout(resolve, 50))
			}
		}
		try {
			return await operation()
		} finally {
			await rm(lock, { recursive: true, force: true })
		}
	}
}
