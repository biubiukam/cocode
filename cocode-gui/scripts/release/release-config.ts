import { existsSync, readFileSync } from "node:fs"
import * as path from "pathe"
import { loadEnvFile } from "node:process"
import type { MakerDMGConfig } from "@electron-forge/maker-dmg"
import type { MakerSquirrelConfig } from "@electron-forge/maker-squirrel"
import type { OsxSignOptions } from "@electron/packager"
import type { NotaryToolCredentials } from "@electron/notarize/lib/types"
import type { SignToolOptions as CjsSignToolOptions } from "@electron/windows-sign/dist/cjs/types"
import type { SignToolOptions } from "@electron/windows-sign/dist/esm/types"

export type ReleasePlatform = "darwin" | "win32"
export type ReleaseArchitecture = "x64" | "arm64"
export type WindowsSignMode = "service" | "pfx"

export interface WindowsSignServiceOptions {
	readonly serviceUrl: string
	readonly credentialTarget: string
	readonly description: string
	readonly website?: string
	readonly hashAlgorithm: "sha256"
	readonly timeoutMs: number
	readonly retryCount: number
}

export type MacSignOptions = OsxSignOptions & { readonly continueOnError?: boolean }

export interface ReleaseTarget {
	readonly platform: ReleasePlatform
	readonly arch: ReleaseArchitecture
}

export interface GitHubReleaseRepository {
	readonly owner: string
	readonly name: string
}

const RELEASE_ENV_FILE = ".env.release"
const RELEASE_KEYS = new Set([
	"ELECTRON_APP_ID",
	"RELEASE_COPYRIGHT",
	"RELEASE_DESCRIPTION",
	"RELEASE_HOMEPAGE",
	"ELECTRON_UPDATE_REPOSITORY",
	"ELECTRON_UPDATE_REPOSITORY_WIN32_ARM64",
	"ELECTRON_AUTO_UPDATE",
	"ELECTRON_UPDATE_INTERVAL",
	"MACOS_ICON_PATH",
	"WINDOWS_ICON_PATH",
	"DMG_ICON_PATH",
	"DMG_BACKGROUND_PATH",
	"DMG_FORMAT",
	"DMG_ICON_SIZE",
	"MAC_SIGNING_IDENTITY",
	"MAC_INSTALLER_SIGNING_IDENTITY",
	"MAC_INSTALLER_APP_IDENTIFIER",
	"MAC_INSTALLER_CLI_IDENTIFIER",
	"MAC_CLI_INSTALL_PATH",
	"MAC_SIGNING_KEYCHAIN",
	"MAC_ENTITLEMENTS_PATH",
	"MAC_PLUGIN_ENTITLEMENTS_PATH",
	"APPLE_API_KEY",
	"APPLE_API_KEY_ID",
	"APPLE_API_ISSUER",
	"APPLE_KEYCHAIN_PROFILE",
	"APPLE_KEYCHAIN",
	"APPLE_ID",
	"APPLE_APP_SPECIFIC_PASSWORD",
	"APPLE_TEAM_ID",
	"WINDOWS_CERTIFICATE_FILE",
	"WINDOWS_CERTIFICATE_PASSWORD",
	"SIGN_CERTIFICATE",
	"WINDOWS_TIMESTAMP_SERVER",
	"WINDOWS_SIGN_WITH_PARAMS",
	"WINDOWS_SIGN_MODE",
	"WINDOWS_SIGN_SERVICE_URL",
	"WINDOWS_SIGN_CREDENTIAL_TARGET",
	"WINDOWS_SIGN_DESCRIPTION",
	"WINDOWS_SIGN_WEBSITE",
	"WINDOWS_SIGN_TIMEOUT_MS",
	"WINDOWS_SIGN_RETRY_COUNT",
	"WINDOWS_SIGN_CERTIFICATE_SUBJECT",
	"WINDOWS_SIGN_CERTIFICATE_SHA1",
	"WINDOWS_SIGN_LEDGER_DIR",
	"RELEASE_ENV_FILE",
	"RELEASE_PLATFORM",
	"RELEASE_ARCH",
	"RELEASE_REQUIRE_SIGNING",
	"RELEASE_REQUIRE_NATIVE_ARCH_MATCH",
	"RELEASE_PUBLISH",
	"FORGE_OUT_DIR",
	"COCODE_RUNTIME_ARTIFACT_ROOT",
	"GITHUB_REPOSITORY",
	"GITHUB_TOKEN",
	"GITHUB_REF_TYPE",
	"GITHUB_REF_NAME",
])

export function loadReleaseEnvironment(environment = process.env): string | undefined {
	const explicit = environment.RELEASE_ENV_FILE?.trim()
	const selected = explicit ? path.resolve(explicit) : resolveImplicitReleaseEnvFile()
	if (!selected) return undefined
	if (!existsSync(selected))
		throw new Error(`Release environment file does not exist: ${selected}`)
	validateReleaseEnvFile(selected)
	loadEnvFile(selected)
	return selected
}

export function resolveImplicitReleaseEnvFile(): string | undefined {
	const selected = path.resolve(RELEASE_ENV_FILE)
	return existsSync(selected) ? selected : undefined
}

export function validateReleaseEnvFile(file: string): void {
	const text = readFileSync(file, "utf8")
	for (const [index, line] of text.split(/\r?\n/).entries()) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith("#")) continue
		const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
		if (!match) throw new Error(`${file}:${index + 1} must use KEY=value syntax.`)
		if (!RELEASE_KEYS.has(match[1]))
			throw new Error(`${file}:${index + 1} uses unknown key ${match[1]}.`)
	}
}

export function resolveReleaseTarget(environment = process.env): ReleaseTarget {
	const platform = environment.RELEASE_PLATFORM ?? process.platform
	const arch = environment.RELEASE_ARCH ?? process.arch
	if (platform !== "darwin" && platform !== "win32") {
		throw new Error(`Unsupported release platform: ${platform}.`)
	}
	if (arch !== "x64" && arch !== "arm64") {
		throw new Error(`Unsupported release architecture: ${arch}.`)
	}
	return { platform, arch }
}

export function resolveGitHubReleaseRepository(
	environment = process.env,
	target?: ReleaseTarget,
): GitHubReleaseRepository {
	const repository =
		target?.platform === "win32" && target.arch === "arm64"
			? resolveWindowsArm64UpdateRepository(environment)
			: environment.GITHUB_REPOSITORY?.trim() || "cocode-agency/cocode"
	return parseGitHubReleaseRepository(repository, "GitHub release repository")
}

export function resolveWindowsArm64UpdateRepository(environment = process.env): string {
	const repository = environment.ELECTRON_UPDATE_REPOSITORY_WIN32_ARM64?.trim()
	if (!repository) {
		throw new Error(
			"ELECTRON_UPDATE_REPOSITORY_WIN32_ARM64 is required for Windows ARM64 releases.",
		)
	}
	parseGitHubReleaseRepository(repository, "ELECTRON_UPDATE_REPOSITORY_WIN32_ARM64")
	return repository
}

function parseGitHubReleaseRepository(repository: string, label: string): GitHubReleaseRepository {
	const [owner, name, ...rest] = repository.split("/")
	if (!owner || !name || rest.length > 0 || /\s/.test(repository)) {
		throw new Error(`${label} must use the owner/name format: ${repository}`)
	}
	return { owner, name }
}

export function isReleaseSigningRequired(environment = process.env): boolean {
	return (
		environment.RELEASE_REQUIRE_SIGNING === "1" ||
		environment.RELEASE_REQUIRE_SIGNING === "true"
	)
}

export function resolveReleasePath(value: string | undefined, label: string): string | undefined {
	const trimmed = value?.trim()
	if (!trimmed) return undefined
	const resolved = path.resolve(trimmed)
	if (!existsSync(resolved)) throw new Error(`${label} does not exist: ${resolved}`)
	return resolved
}

export function createMacSignOptions(environment = process.env): MacSignOptions | undefined {
	const identity = environment.MAC_SIGNING_IDENTITY?.trim()
	if (!identity) return undefined
	const entitlements = resolveReleasePath(
		environment.MAC_ENTITLEMENTS_PATH ?? "resources/entitlements.mac.plist",
		"MAC_ENTITLEMENTS_PATH",
	)
	const pluginEntitlements = resolveReleasePath(
		environment.MAC_PLUGIN_ENTITLEMENTS_PATH ?? "resources/entitlements.mac.plugin.plist",
		"MAC_PLUGIN_ENTITLEMENTS_PATH",
	)
	return {
		identity,
		keychain: environment.MAC_SIGNING_KEYCHAIN?.trim() || undefined,
		preAutoEntitlements: true,
		strictVerify: true,
		continueOnError: false,
		optionsForFile: (filePath) => ({
			entitlements:
				filePath.includes("Helper (Plugin).app") || filePath.includes("node-pty")
					? pluginEntitlements
					: entitlements,
			hardenedRuntime: true,
		}),
	}
}

export function resolveMacInstallerSigningIdentity(environment = process.env): string | undefined {
	return environment.MAC_INSTALLER_SIGNING_IDENTITY?.trim() || undefined
}

export function resolveMacCliInstallPath(environment = process.env): string {
	return environment.MAC_CLI_INSTALL_PATH?.trim() || "/usr/local/bin/cocode"
}

export function createMacNotarizeOptions(
	environment = process.env,
): NotaryToolCredentials | undefined {
	const apiValues = [
		environment.APPLE_API_KEY?.trim(),
		environment.APPLE_API_KEY_ID?.trim(),
		environment.APPLE_API_ISSUER?.trim(),
	]
	if (apiValues.some(Boolean)) {
		if (!apiValues.every(Boolean))
			throw new Error(
				"APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER must be provided together.",
			)
		return {
			appleApiKey: apiValues[0] as string,
			appleApiKeyId: apiValues[1] as string,
			appleApiIssuer: apiValues[2] as string,
		}
	}
	const profile = environment.APPLE_KEYCHAIN_PROFILE?.trim()
	const keychain = environment.APPLE_KEYCHAIN?.trim() || undefined
	if (profile) return { keychainProfile: profile, keychain }
	if (keychain) throw new Error("APPLE_KEYCHAIN requires APPLE_KEYCHAIN_PROFILE.")
	const passwordValues = [
		environment.APPLE_ID?.trim(),
		environment.APPLE_APP_SPECIFIC_PASSWORD?.trim(),
		environment.APPLE_TEAM_ID?.trim(),
	]
	if (passwordValues.some(Boolean)) {
		if (!passwordValues.every(Boolean))
			throw new Error(
				"APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and APPLE_TEAM_ID must be provided together.",
			)
		return {
			appleId: passwordValues[0] as string,
			appleIdPassword: passwordValues[1] as string,
			teamId: passwordValues[2] as string,
		}
	}
	return undefined
}

export function resolveWindowsSignMode(environment = process.env): WindowsSignMode | undefined {
	const configuredMode = environment.WINDOWS_SIGN_MODE?.trim()
	if (configuredMode && configuredMode !== "service" && configuredMode !== "pfx") {
		throw new Error(`Unsupported WINDOWS_SIGN_MODE: ${configuredMode}.`)
	}
	if (configuredMode) return configuredMode as WindowsSignMode
	if (isReleaseSigningRequired(environment)) return "service"
	const configuredFile = environment.WINDOWS_CERTIFICATE_FILE?.trim()
	const configuredPassword = environment.WINDOWS_CERTIFICATE_PASSWORD
	const configuredParams = environment.WINDOWS_SIGN_WITH_PARAMS?.trim()
	return configuredFile || configuredPassword !== undefined || configuredParams
		? "pfx"
		: undefined
}

function parsePositiveEnvironmentInteger(
	value: string | undefined,
	defaultValue: number,
	label: string,
): number {
	if (!value?.trim()) return defaultValue
	const parsed = Number(value)
	if (!Number.isInteger(parsed) || parsed <= 0)
		throw new Error(`${label} must be a positive integer.`)
	return parsed
}

export function resolveWindowsSignServiceOptions(
	environment = process.env,
): WindowsSignServiceOptions {
	const serviceUrl = environment.WINDOWS_SIGN_SERVICE_URL?.trim()
	if (!serviceUrl) throw new Error("WINDOWS_SIGN_SERVICE_URL is required for service signing.")
	try {
		const url = new URL(serviceUrl)
		if (url.protocol !== "http:" && url.protocol !== "https:")
			throw new Error("unsupported protocol")
	} catch {
		throw new Error(`WINDOWS_SIGN_SERVICE_URL is invalid: ${serviceUrl}`)
	}
	const website = environment.WINDOWS_SIGN_WEBSITE?.trim() || environment.RELEASE_HOMEPAGE?.trim()
	return {
		serviceUrl: serviceUrl.replace(/\/$/, ""),
		credentialTarget:
			environment.WINDOWS_SIGN_CREDENTIAL_TARGET?.trim() || "cocode/windows-sign",
		description:
			environment.WINDOWS_SIGN_DESCRIPTION?.trim() ||
			environment.RELEASE_DESCRIPTION?.trim() ||
			"Cocode Desktop",
		...(website ? { website } : {}),
		hashAlgorithm: "sha256",
		timeoutMs: parsePositiveEnvironmentInteger(
			environment.WINDOWS_SIGN_TIMEOUT_MS,
			30_000,
			"WINDOWS_SIGN_TIMEOUT_MS",
		),
		retryCount: parsePositiveEnvironmentInteger(
			environment.WINDOWS_SIGN_RETRY_COUNT,
			2,
			"WINDOWS_SIGN_RETRY_COUNT",
		),
	}
}

export function resolveWindowsSignLedgerDir(environment = process.env): string {
	return path.resolve(
		environment.WINDOWS_SIGN_LEDGER_DIR?.trim() ||
			path.join(".cache", "cocode", "windows-sign-ledger"),
	)
}

export function createWindowsSignOptions(environment = process.env): SignToolOptions | undefined {
	const mode = resolveWindowsSignMode(environment)
	if (!mode) return undefined
	if (mode === "service") {
		const service = resolveWindowsSignServiceOptions(environment)
		const hookModulePath = path.resolve("scripts/release/windows-sign-hook.cjs")
		if (!existsSync(hookModulePath))
			throw new Error(`Windows signing hook does not exist: ${hookModulePath}`)
		return {
			hookModulePath,
			hashes: ["sha256"] as unknown as NonNullable<SignToolOptions["hashes"]>,
			description: service.description,
			website: service.website,
			debug: false,
		}
	}
	const configuredFile = environment.WINDOWS_CERTIFICATE_FILE?.trim()
	const certificatePassword = environment.WINDOWS_CERTIFICATE_PASSWORD
	const signWithParams = environment.WINDOWS_SIGN_WITH_PARAMS?.trim()
	const hasPasswordValue = Boolean(certificatePassword)
	if (!configuredFile && hasPasswordValue) {
		throw new Error(
			"WINDOWS_CERTIFICATE_FILE and WINDOWS_CERTIFICATE_PASSWORD must be provided together.",
		)
	}
	if (configuredFile && certificatePassword === undefined) {
		throw new Error(
			"WINDOWS_CERTIFICATE_FILE and WINDOWS_CERTIFICATE_PASSWORD must be provided together.",
		)
	}
	if (!configuredFile && !signWithParams) return undefined
	const certificateFile = resolveReleasePath(configuredFile, "WINDOWS_CERTIFICATE_FILE")
	return {
		certificateFile,
		certificatePassword,
		timestampServer:
			environment.WINDOWS_TIMESTAMP_SERVER?.trim() || "http://timestamp.digicert.com",
		description: environment.RELEASE_DESCRIPTION?.trim() || "Cocode Desktop",
		website: environment.RELEASE_HOMEPAGE?.trim() || undefined,
		signWithParams: signWithParams || undefined,
	}
}

export function requireReleaseCredentials(target: ReleaseTarget, environment = process.env): void {
	if (!isReleaseSigningRequired(environment)) return
	if (target.platform === "darwin") {
		if (!createMacSignOptions(environment))
			throw new Error("MAC_SIGNING_IDENTITY is required for a signed macOS release.")
		if (!resolveMacInstallerSigningIdentity(environment))
			throw new Error(
				"MAC_INSTALLER_SIGNING_IDENTITY (Developer ID Installer) is required for a signed macOS PKG release.",
			)
		if (!createMacNotarizeOptions(environment))
			throw new Error(
				"Apple notarization credentials are required for a signed macOS release.",
			)
		return
	}
	if (resolveWindowsSignMode(environment) !== "service")
		throw new Error(
			"Signed Windows releases must use WINDOWS_SIGN_MODE=service and the team signing service.",
		)
	if (!createWindowsSignOptions(environment))
		throw new Error("Windows signing credentials are required for a signed Windows release.")
}

export function requireReleaseUpdateRepository(
	target: ReleaseTarget,
	environment = process.env,
): void {
	if (target.platform === "win32" && target.arch === "arm64") {
		resolveWindowsArm64UpdateRepository(environment)
	}
}

export function createDmgConfig(environment = process.env): MakerDMGConfig {
	return {
		format: (environment.DMG_FORMAT?.trim() as MakerDMGConfig["format"]) || "UDZO",
		icon: resolveReleasePath(
			environment.DMG_ICON_PATH?.trim() || "resources/icons/cocode.icns",
			"DMG_ICON_PATH",
		),
		background: resolveReleasePath(environment.DMG_BACKGROUND_PATH, "DMG_BACKGROUND_PATH"),
		iconSize: parsePositiveInteger(environment.DMG_ICON_SIZE, 96),
	}
}

export function createSquirrelConfig(
	packageVersion: string,
	environment = process.env,
	windowsSignOptions?: ReturnType<typeof createWindowsSignOptions>,
): MakerSquirrelConfig {
	const arch = environment.RELEASE_ARCH ?? process.arch
	if (arch !== "x64" && arch !== "arm64")
		throw new Error(`Unsupported Squirrel architecture: ${arch}.`)
	const segment = arch === "x64" ? "win32-x64" : "win32-arm64"
	const artifactRoot = `Cocode-Desktop-${packageVersion}-${segment}`
	return {
		noMsi: false,
		noDelta: false,
		setupIcon: resolveReleasePath(
			environment.WINDOWS_ICON_PATH?.trim() || "resources/icons/cocode.ico",
			"WINDOWS_ICON_PATH",
		),
		setupExe: `${artifactRoot}-Setup.exe`,
		setupMsi: `${artifactRoot}-Setup.msi`,
		windowsSign: windowsSignOptions as unknown as CjsSignToolOptions | undefined,
	}
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
	const parsed = Number(value)
	return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}
