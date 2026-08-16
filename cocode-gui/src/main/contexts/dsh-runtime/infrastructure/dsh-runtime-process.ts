import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { app, utilityProcess, type UtilityProcess } from "electron"
import type {
	DshRuntimeBootstrapDto,
	DshRuntimeRequestDto,
	DshRuntimeResponseDto,
} from "../../../../contracts/ipc/dsh-runtime.contract"
import { isDshHttpPath } from "../../../../contracts/dsh-runtime-path"
import { parseDshRuntimeBootstrap } from "../../../../contracts/schemas/dsh-runtime.schema"
import { extractDshBootManifest, extractDshThemePreference } from "./dsh-runtime-bootstrap"
import { createDshDesktopPatch } from "./dsh-desktop-patch"
import { resolveDshHome } from "./dsh-home"
import { quarantineCorruptDshSessions } from "./dsh-session-recovery"

const STARTUP_TIMEOUT_MS = 60_000
const STOP_TIMEOUT_MS = 10_000
const HTTP_READY_TIMEOUT_MS = 30_000
const HTTP_READY_POLL_MS = 100
const READY_LINE = /dsh web: (http:\/\/127\.0\.0\.1:(\d+))/
const FORWARDED_REQUEST_HEADERS = new Set(["accept", "content-type", "if-none-match", "range"])

export class DshRuntimeProcess {
	private child: UtilityProcess | null = null
	private closePromise: Promise<void> | null = null
	private runtimeUrl: string | null = null

	public async start(): Promise<string> {
		if (this.child) throw new Error("DSH runtime is already running.")

		const runtimeRoot = resolveRuntimeRoot()
		const entry = resolveRuntimeEntry(runtimeRoot)
		const home = resolveDshHome()
		quarantineCorruptDshSessions(home)
		const workspace = path.join(home, "workspaces", "default")
		mkdirSync(workspace, { recursive: true })
		const desktopPatch = path.join(app.getPath("userData"), "dsh-desktop.patch.yml")
		writeFileSync(desktopPatch, createDshDesktopPatch(pathToFileURL(resolveNoopHmr()).href))

		const child = utilityProcess.fork(
			resolveUtilityEntry(),
			[entry, "web", "--patch", desktopPatch, "--port", "0"],
			{
				cwd: workspace,
				env: {
					...process.env,
					DSH_HOME: home,
					PLAYWRIGHT_BROWSERS_PATH:
						process.env.PLAYWRIGHT_BROWSERS_PATH ??
						path.join(home, "browsers", "engines"),
				},
				execArgv: ["--expose-internals"],
				serviceName: "DeepSeek DSH",
				allowLoadingUnsignedLibraries: true,
				stdio: ["ignore", "pipe", "pipe"],
			},
		)
		this.child = child
		this.closePromise = new Promise<void>((resolve) => {
			child.once("exit", () => {
				if (this.child === child) this.child = null
				resolve()
			})
		})

		return new Promise<string>((resolve, reject) => {
			let settled = false
			let output = ""
			const timer = setTimeout(() => {
				finish(new Error(`Timed out waiting for the DSH runtime to listen.\n${output}`))
			}, STARTUP_TIMEOUT_MS)
			const finish = (error?: Error, url?: string): void => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				if (error) reject(error)
				else if (url) {
					this.runtimeUrl = url
					resolve(url)
				}
			}
			const inspect = (chunk: Buffer | string): void => {
				output += chunk.toString()
				const match = output.match(READY_LINE)
				if (match?.[1]) {
					void waitForHttpReady(match[1], HTTP_READY_TIMEOUT_MS).then(
						() => finish(undefined, match[1]),
						(error: unknown) =>
							finish(error instanceof Error ? error : new Error(String(error))),
					)
				}
			}
			child.stdout?.on("data", inspect)
			child.stderr?.on("data", (chunk: Buffer | string) => {
				const text = chunk.toString()
				output += text
				process.stderr.write(`[dsh] ${text}`)
			})
			child.once("error", (_type, _location, report) => {
				finish(new Error(`DSH utility process failed: ${report}`))
			})
			child.once("exit", (code) => {
				if (!settled) {
					finish(
						new Error(
							`DSH runtime exited before readiness (code=${String(
								code,
							)}).\n${output}`,
						),
					)
				}
			})
		})
	}

	public async getBootstrap(): Promise<DshRuntimeBootstrapDto> {
		const runtimeUrl = this.requireRuntimeUrl()

		const response = await fetch(runtimeUrl)
		if (!response.ok) {
			throw new Error(
				`DSH runtime bootstrap request failed with HTTP ${String(response.status)}.`,
			)
		}
		const html = await response.text()
		const boot = extractDshBootManifest(html)

		return parseDshRuntimeBootstrap({
			origin: new URL(runtimeUrl).origin,
			boot,
			themePreference: extractDshThemePreference(html),
		})
	}

	public async request(
		request: DshRuntimeRequestDto,
		signal: AbortSignal,
	): Promise<DshRuntimeResponseDto> {
		const runtimeUrl = this.requireRuntimeUrl()
		const target = new URL(request.path, runtimeUrl)
		if (target.origin !== new URL(runtimeUrl).origin || !isDshHttpPath(target.pathname)) {
			throw new Error("DSH runtime request escaped the allow-listed HTTP surface.")
		}

		const headers = new Headers()
		for (const [name, value] of request.headers) {
			if (FORWARDED_REQUEST_HEADERS.has(name.toLowerCase())) headers.append(name, value)
		}
		const response = await fetch(target, {
			method: request.method,
			headers,
			body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
			signal,
		})
		return {
			status: response.status,
			statusText: response.statusText,
			headers: [...response.headers.entries()],
			body: new Uint8Array(await response.arrayBuffer()),
		}
	}

	public async stop(): Promise<void> {
		const child = this.child
		const closePromise = this.closePromise
		if (!child || !closePromise) return

		child.kill()
		await Promise.race([
			closePromise,
			new Promise<void>((resolve) => setTimeout(resolve, STOP_TIMEOUT_MS)),
		])
		if (this.child === child) {
			child.kill()
			await closePromise
		}
		this.closePromise = null
		this.runtimeUrl = null
	}

	private requireRuntimeUrl(): string {
		if (this.runtimeUrl === null) throw new Error("DSH runtime is not ready.")
		return this.runtimeUrl
	}
}

async function waitForHttpReady(url: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		try {
			const response = await fetch(url, {
				signal: AbortSignal.timeout(Math.min(1_000, timeoutMs)),
			})
			if (response.ok) return
			await response.body?.cancel()
		} catch {
			// The URL is announced before the listener is necessarily accepting.
		}
		await new Promise<void>((resolve) => setTimeout(resolve, HTTP_READY_POLL_MS))
	}
	throw new Error(`DSH runtime did not serve HTTP at ${url} within ${timeoutMs}ms.`)
}

function resolveRuntimeRoot(): string {
	const explicit = process.env.DSH_RUNTIME_ROOT
	if (explicit) return explicit
	if (!app.isPackaged) {
		const sourceRoot =
			process.env.DSH_SOURCE_ROOT ?? path.resolve(__dirname, "../../..", "cocode-harness")
		if (existsSync(path.join(sourceRoot, "apps", "cli", "lib", "bin.js"))) return sourceRoot
	}
	const packagedCandidates = [
		path.join(process.resourcesPath, "dsh-runtime"),
		path.join(process.resourcesPath, "app", "resources", "dsh-runtime"),
		path.join(process.resourcesPath, "app.asar.unpacked", "resources", "dsh-runtime"),
		path.join(process.resourcesPath, "app.asar", "resources", "dsh-runtime"),
	]
	return (
		packagedCandidates.find((candidate) => existsSync(path.join(candidate, "lib", "bin.js"))) ??
		packagedCandidates[0]
	)
}

function resolveRuntimeEntry(root: string): string {
	const candidates = [
		path.join(root, "lib", "bin.js"),
		path.join(root, "apps", "cli", "lib", "bin.js"),
	]
	const entry = candidates.find((candidate) => existsSync(candidate))
	if (!entry) {
		throw new Error(
			`DSH runtime entry was not found under ${root}. Run pnpm run stage:dsh before packaging.`,
		)
	}
	return entry
}

function resolveUtilityEntry(): string {
	const candidates = app.isPackaged
		? [
				path.join(process.resourcesPath, "app", "resources", "dsh-utility-entry.mjs"),
				path.join(process.resourcesPath, "dsh-utility-entry.mjs"),
		  ]
		: [path.resolve(__dirname, "..", "..", "resources", "dsh-utility-entry.mjs")]
	const entry = candidates.find((candidate) => existsSync(candidate))
	if (!entry) throw new Error("DSH utility entry was not packaged.")
	return entry
}

function resolveNoopHmr(): string {
	const candidates = app.isPackaged
		? [
				path.join(process.resourcesPath, "app", "resources", "dsh-noop-hmr.mjs"),
				path.join(process.resourcesPath, "dsh-noop-hmr.mjs"),
		  ]
		: [path.resolve(__dirname, "..", "..", "resources", "dsh-noop-hmr.mjs")]
	const entry = candidates.find((candidate) => existsSync(candidate))
	if (!entry) throw new Error("DSH desktop HMR provider was not packaged.")
	return entry
}
