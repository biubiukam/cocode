import { app } from "electron"
import { randomUUID } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { arch, platform } from "node:os"
import { SecureVault } from "./secure-vault"

export type CocodeClientIdentity = {
	readonly product: "cocode"
	readonly surface: "gui" | "tui"
	readonly version: string
	readonly build: string
	readonly os: "darwin" | "linux" | "windows"
	readonly arch: "arm64" | "x64"
	readonly installation_id: string
}

const installation = new SecureVault<string>("installation-id.bin")

export async function guiClientIdentity(): Promise<CocodeClientIdentity> {
	let installationId = await installation.read()
	if (installationId === undefined) {
		try {
			installationId = (
				await readFile(`${app.getPath("userData")}/installation-id.txt`, "utf8")
			).trim()
		} catch {
			installationId = undefined
		}
		if (installationId === undefined || installationId === "") {
			installationId = randomUUID()
			try {
				await installation.write(installationId)
			} catch {
				await writeFile(`${app.getPath("userData")}/installation-id.txt`, installationId, {
					mode: 0o600,
				})
			}
		}
	}
	const currentPlatform = platform()
	const currentArch = arch()
	return {
		product: "cocode",
		surface: "gui",
		version: app.getVersion() || "0.0.0-dev",
		build: process.env.COCODE_BUILD_ID?.trim().slice(0, 64) || "dev",
		os:
			currentPlatform === "win32"
				? "windows"
				: currentPlatform === "linux"
				? "linux"
				: "darwin",
		arch: currentArch === "arm64" ? "arm64" : "x64",
		installation_id: installationId,
	}
}

export function harnessClientIdentity(identity: CocodeClientIdentity): Record<string, string> {
	return {
		product: identity.product,
		surface: identity.surface,
		version: identity.version,
		build: identity.build,
		os: identity.os,
		arch: identity.arch,
		installationId: identity.installation_id,
	}
}
