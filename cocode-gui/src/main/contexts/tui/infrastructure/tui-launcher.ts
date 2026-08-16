import { createHash } from "node:crypto"
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { spawn } from "node:child_process"
import path from "node:path"
import { app } from "electron"
import { resolveDshHome } from "../../dsh-runtime/infrastructure/dsh-home"
import type {
	TuiCommandLineToolResult,
	TuiCommandLineToolState,
	TuiCommandLineToolStatus,
} from "../../../../contracts/ipc/tui.contract"

const DESKTOP_SHIM_MARKER = "# cocode-desktop-cli-shim:v1"
const WINDOWS_DESKTOP_SHIM_MARKER = "REM cocode-desktop-cli-shim:v1"

export type TuiInvocation = {
	readonly executable: string
	readonly args: readonly string[]
	readonly env: NodeJS.ProcessEnv
	readonly cwd: string
}

export class TuiLauncher {
	public buildInvocation(args: readonly string[] = []): TuiInvocation {
		const resourcesRoot = resolveResourcesRoot()
		const executable =
			process.env.COCODE_NODE_EXECUTABLE?.trim() || path.join(resourcesRoot, "cocode-node")
		const entry = path.join(resourcesRoot, "tui", "cocode-tui.mjs")
		const supervisorEntry = path.join(
			resourcesRoot,
			"dsh-runtime",
			"packages",
			"host-supervisor",
			"lib",
			"bin.js",
		)
		if (!existsSync(entry)) throw new Error(`Packaged TUI entry is missing: ${entry}`)
		if (!existsSync(executable))
			throw new Error(`Packaged Node executable is missing: ${executable}`)
		if (!process.env.COCODE_SUPERVISOR_SERVICE_ENTRY?.trim() && !existsSync(supervisorEntry)) {
			throw new Error(`Packaged Supervisor service entry is missing: ${supervisorEntry}`)
		}
		const env: NodeJS.ProcessEnv = {
			...process.env,
			COCODE_NODE_EXECUTABLE: executable,
			COCODE_SUPERVISOR_SERVICE_ENTRY:
				process.env.COCODE_SUPERVISOR_SERVICE_ENTRY?.trim() || supervisorEntry,
			COCODE_TUI_CLIENT_KIND: "desktop-tui",
			DSH_HOME: process.env.DSH_HOME?.trim() || resolveDshHome(),
			DSH_PROFILE: process.env.DSH_PROFILE?.trim() || "web",
			COCODE_HOST_CONFIG_FINGERPRINT:
				process.env.COCODE_HOST_CONFIG_FINGERPRINT?.trim() || "cocode-web-jsonrpc-v1",
			COCODE_RUNTIME_CHANNEL: resolveRuntimeChannel(process.env.COCODE_RUNTIME_CHANNEL),
		}
		return {
			executable,
			args: [entry, ...args],
			env,
			cwd: process.cwd(),
		}
	}

	public async getCommandLineToolStatus(): Promise<TuiCommandLineToolStatus> {
		const shimPath = resolveShimPath()
		const directory = path.dirname(shimPath)
		const directoryOnPath = isDirectoryOnPath(directory)
		let existing: ExistingShim | undefined

		try {
			const file = await stat(shimPath)
			existing = {
				contents: await readFile(shimPath, "utf8"),
				executable: process.platform === "win32" || (file.mode & 0o111) !== 0,
			}
		} catch (error) {
			if (!isMissingFileError(error)) {
				return createStatus(
					shimPath,
					directory,
					directoryOnPath,
					"unavailable",
					false,
					false,
					`Unable to inspect the Desktop CLI shim: ${errorMessage(error)}`,
				)
			}
		}

		let expected: string
		try {
			const invocation = this.buildInvocation()
			expected =
				process.platform === "win32" ? windowsShim(invocation) : posixShim(invocation)
		} catch (error) {
			return createStatus(
				shimPath,
				directory,
				directoryOnPath,
				"unavailable",
				isManagedShim(existing?.contents),
				false,
				errorMessage(error),
			)
		}

		if (existing === undefined) {
			return createStatus(shimPath, directory, directoryOnPath, "missing", false, true)
		}

		if (!isManagedShim(existing.contents)) {
			return createStatus(
				shimPath,
				directory,
				directoryOnPath,
				"conflict",
				false,
				false,
				"An unmanaged executable already exists at the Cocode CLI path.",
			)
		}

		const installed = existing.contents === expected && existing.executable
		return createStatus(
			shimPath,
			directory,
			directoryOnPath,
			installed ? "installed" : "stale",
			true,
			true,
			installed ? undefined : "The Desktop CLI shim points to an older runtime.",
		)
	}

	public async ensureCommandLineTool(): Promise<TuiCommandLineToolResult> {
		const before = await this.getCommandLineToolStatus()
		if (before.state !== "missing" && before.state !== "stale") {
			return { changed: false, status: before }
		}

		await this.writeCommandLineTool()
		return {
			changed: true,
			status: await this.getCommandLineToolStatus(),
		}
	}

	public async repairCommandLineTool(): Promise<TuiCommandLineToolResult> {
		const before = await this.getCommandLineToolStatus()
		if (before.state === "conflict" || before.state === "unavailable") {
			return { changed: false, status: before }
		}

		await this.writeCommandLineTool()
		return {
			changed: true,
			status: await this.getCommandLineToolStatus(),
		}
	}

	private async writeCommandLineTool(): Promise<void> {
		const directory = resolveShimDirectory()
		await mkdir(directory, { recursive: true, mode: 0o755 })
		const invocation = this.buildInvocation()
		const contents =
			process.platform === "win32" ? windowsShim(invocation) : posixShim(invocation)
		const shimPath = resolveShimPath()
		await writeFile(shimPath, contents, { mode: 0o755 })
		if (process.platform !== "win32") await chmod(shimPath, 0o755)
	}

	public async openInTerminal(): Promise<void> {
		const invocation = this.buildInvocation()
		if (process.platform === "darwin") {
			const command = shellCommand(invocation)
			await spawnAndWait(
				"/usr/bin/osascript",
				["-e", `tell application "Terminal" to do script ${appleScriptString(command)}`],
				{ ...process.env, ...invocation.env },
			)
			return
		}
		if (process.platform === "win32") {
			await spawnAndWait(
				"cmd.exe",
				["/c", "start", "", "cmd.exe", "/k", windowsCommand(invocation)],
				invocation.env,
			)
			return
		}
		const terminal = process.env.COCODE_TERMINAL?.trim() || process.env.TERMINAL?.trim()
		if (!terminal)
			throw new Error("No terminal executable configured. Set COCODE_TERMINAL or TERMINAL.")
		spawn(terminal, ["-e", invocation.executable, ...invocation.args], {
			cwd: invocation.cwd,
			env: invocation.env,
			stdio: "ignore",
			detached: true,
		}).unref()
	}

	public async readManifest(): Promise<Record<string, unknown> | null> {
		try {
			const resourcesRoot = resolveResourcesRoot()
			return JSON.parse(
				await readFile(path.join(resourcesRoot, "tui", "manifest.json"), "utf8"),
			)
		} catch {
			return null
		}
	}
}

function resolveResourcesRoot(): string {
	if (process.env.COCODE_TUI_RESOURCES_ROOT?.trim())
		return process.env.COCODE_TUI_RESOURCES_ROOT.trim()
	if (app.isPackaged && typeof process.resourcesPath === "string") return process.resourcesPath
	return path.resolve(app.getAppPath(), ".cache", "cocode")
}

function resolveShimDirectory(): string {
	if (process.env.COCODE_CLI_BIN_DIR?.trim())
		return path.resolve(process.env.COCODE_CLI_BIN_DIR.trim())
	return process.platform === "win32"
		? path.join(app.getPath("appData"), "Cocode", "bin")
		: path.join(app.getPath("home"), ".local", "bin")
}

function resolveShimPath(): string {
	return path.join(resolveShimDirectory(), process.platform === "win32" ? "cocode.cmd" : "cocode")
}

type ExistingShim = {
	readonly contents: string
	readonly executable: boolean
}

function createStatus(
	shimPath: string,
	directory: string,
	directoryOnPath: boolean,
	state: TuiCommandLineToolState,
	managedByDesktop: boolean,
	canRepair: boolean,
	detail?: string,
): TuiCommandLineToolStatus {
	return {
		state,
		path: shimPath,
		directory,
		managedByDesktop,
		directoryOnPath,
		canRepair,
		...(detail === undefined ? {} : { detail }),
	}
}

function isManagedShim(contents: string | undefined): boolean {
	if (contents === undefined) return false
	if (contents.includes(DESKTOP_SHIM_MARKER) || contents.includes(WINDOWS_DESKTOP_SHIM_MARKER))
		return true

	return (
		contents.includes("COCODE_TUI_CLIENT_KIND") &&
		contents.includes("desktop-tui") &&
		contents.includes("COCODE_NODE_EXECUTABLE") &&
		contents.includes("cocode-tui.mjs")
	)
}

function isDirectoryOnPath(directory: string): boolean {
	const configuredPath = process.env.PATH ?? process.env.Path ?? ""
	const normalizedDirectory = normalizePathForComparison(directory)
	return configuredPath
		.split(path.delimiter)
		.filter((entry) => entry.length > 0)
		.some((entry) => normalizePathForComparison(entry) === normalizedDirectory)
}

function normalizePathForComparison(value: string): string {
	const normalized = path.normalize(path.resolve(value))
	return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

function isMissingFileError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

function resolveRuntimeChannel(value: string | undefined): "stable" | "preview" | "dev" {
	return value === "preview" || value === "dev" ? value : "stable"
}

function posixShim(invocation: TuiInvocation): string {
	const env = invocation.env
	return [
		"#!/bin/sh",
		DESKTOP_SHIM_MARKER,
		"set -eu",
		`if [ -z "\${DSH_HOME:-}" ]; then export DSH_HOME=${shellQuote(env.DSH_HOME ?? "")}; fi`,
		`export COCODE_NODE_EXECUTABLE=${shellQuote(
			env.COCODE_NODE_EXECUTABLE ?? invocation.executable,
		)}`,
		`export COCODE_SUPERVISOR_SERVICE_ENTRY=${shellQuote(
			env.COCODE_SUPERVISOR_SERVICE_ENTRY ?? "",
		)}`,
		`export COCODE_TUI_CLIENT_KIND=${shellQuote(env.COCODE_TUI_CLIENT_KIND ?? "desktop-tui")}`,
		`export DSH_PROFILE=${shellQuote(env.DSH_PROFILE ?? "web")}`,
		`export COCODE_HOST_CONFIG_FINGERPRINT=${shellQuote(
			env.COCODE_HOST_CONFIG_FINGERPRINT ?? "cocode-web-jsonrpc-v1",
		)}`,
		`export COCODE_RUNTIME_CHANNEL=${shellQuote(env.COCODE_RUNTIME_CHANNEL ?? "stable")}`,
		`exec ${shellQuote(invocation.executable)} ${shellQuote(invocation.args[0] ?? "")} "$@"`,
		"",
	].join("\n")
}

function windowsShim(invocation: TuiInvocation): string {
	const env = invocation.env
	return [
		"@echo off",
		WINDOWS_DESKTOP_SHIM_MARKER,
		`if not defined DSH_HOME set "DSH_HOME=${env.DSH_HOME ?? ""}"`,
		`set "COCODE_NODE_EXECUTABLE=${env.COCODE_NODE_EXECUTABLE ?? invocation.executable}"`,
		`set "COCODE_SUPERVISOR_SERVICE_ENTRY=${env.COCODE_SUPERVISOR_SERVICE_ENTRY ?? ""}"`,
		`set "COCODE_TUI_CLIENT_KIND=${env.COCODE_TUI_CLIENT_KIND ?? "desktop-tui"}"`,
		`set "DSH_PROFILE=${env.DSH_PROFILE ?? "web"}"`,
		`set "COCODE_HOST_CONFIG_FINGERPRINT=${
			env.COCODE_HOST_CONFIG_FINGERPRINT ?? "cocode-web-jsonrpc-v1"
		}"`,
		`set "COCODE_RUNTIME_CHANNEL=${env.COCODE_RUNTIME_CHANNEL ?? "stable"}"`,
		`"${invocation.executable}" "${invocation.args[0] ?? ""}" %*`,
		"",
	].join("\r\n")
}

function shellCommand(invocation: TuiInvocation): string {
	const exported = [
		"COCODE_NODE_EXECUTABLE",
		"COCODE_SUPERVISOR_SERVICE_ENTRY",
		"COCODE_TUI_CLIENT_KIND",
		"DSH_HOME",
		"DSH_PROFILE",
		"COCODE_HOST_CONFIG_FINGERPRINT",
		"COCODE_RUNTIME_CHANNEL",
	]
		.filter((key) => invocation.env[key] !== undefined)
		.map((key) => `export ${key}=${shellQuote(invocation.env[key] ?? "")}`)
	return [
		...exported,
		["exec", shellQuote(invocation.executable), ...invocation.args.map(shellQuote)].join(" "),
	].join(" ")
}

function windowsCommand(invocation: TuiInvocation): string {
	const exported = [
		"COCODE_NODE_EXECUTABLE",
		"COCODE_SUPERVISOR_SERVICE_ENTRY",
		"COCODE_TUI_CLIENT_KIND",
		"DSH_HOME",
		"DSH_PROFILE",
		"COCODE_HOST_CONFIG_FINGERPRINT",
		"COCODE_RUNTIME_CHANNEL",
	]
		.filter((key) => invocation.env[key] !== undefined)
		.map((key) => `set "${key}=${cmdValue(invocation.env[key] ?? "")}"`)
	return [
		...exported,
		`"${cmdValue(invocation.executable)}" "${cmdValue(invocation.args[0] ?? "")}"`,
	].join(" && ")
}

function shellQuote(value: string): string {
	return `'${value.replaceAll("'", "'\\''")}'`
}

function appleScriptString(value: string): string {
	return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

function cmdValue(value: string): string {
	return value.replaceAll('"', '""')
}

function spawnAndWait(
	command: string,
	args: readonly string[],
	env: NodeJS.ProcessEnv,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { env, stdio: "ignore" })
		child.once("error", reject)
		child.once("exit", (code) =>
			code === 0
				? resolve()
				: reject(new Error(`${command} exited with code ${String(code)}`)),
		)
	})
}

export function tuiManifestFingerprint(manifest: Record<string, unknown>): string {
	return createHash("sha256").update(JSON.stringify(manifest)).digest("hex")
}
