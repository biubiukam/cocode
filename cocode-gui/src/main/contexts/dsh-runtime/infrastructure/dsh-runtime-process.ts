import { existsSync } from "node:fs"
import path from "node:path"
import type {
	DshRuntimeBootstrapDto,
	DshRuntimeRequestDto,
	DshRuntimeResponseDto,
} from "../../../../contracts/ipc/dsh-runtime.contract"
import { isDshHttpPath } from "../../../../contracts/dsh-runtime-path"
import { parseDshRuntimeBootstrap } from "../../../../contracts/schemas/dsh-runtime.schema"
import { extractDshBootManifest, extractDshThemePreference } from "./dsh-runtime-bootstrap"
import { assertRequiredCocodeWebEndpoints } from "./dsh-runtime-health"
import { resolveDshHome } from "./dsh-home"
import { createHostSupervisorClient, type HostLease, type HostScope } from "@cocode/host-supervisor"
import { quarantineCorruptDshSessions } from "./dsh-session-recovery"
import type { DesktopLogger } from "../../../shared/logging/desktop-logger"

const FORWARDED_REQUEST_HEADERS = new Set(["accept", "content-type", "if-none-match", "range"])

/**
 * Electron's Host adapter. It owns a Supervisor lease, never the DSH process.
 * The main/preload allow-list remains the only renderer-facing HTTP boundary.
 */
export class DshRuntimeProcess {
	private lease: HostLease | null = null
	private runtimeUrl: string | null = null
	private hostLogDirectoryValue: string | undefined

	public constructor(private readonly logger?: DesktopLogger) {}

	public get hostLogDirectory(): string | undefined {
		return this.hostLogDirectoryValue
	}

	public async start(): Promise<string> {
		if (this.lease !== null) throw new Error("DSH Host lease is already active.")
		quarantineCorruptDshSessions(resolveDshHome(), (file, destination) => {
			this.logger?.log("warn", "dsh.session.quarantined", {
				attributes: {
					sessionDirectory: path.basename(path.dirname(file)),
					destinationDirectory: path.basename(path.dirname(destination)),
				},
			})
		})
		const scope: HostScope = {
			dshHome: resolveDshHome(),
			profile: process.env.DSH_PROFILE?.trim() || "web",
			hostConfigFingerprint:
				process.env.COCODE_HOST_CONFIG_FINGERPRINT?.trim() || "cocode-web-jsonrpc-v1",
			runtimeChannel:
				process.env.COCODE_RUNTIME_CHANNEL === "preview" ||
				process.env.COCODE_RUNTIME_CHANNEL === "dev"
					? process.env.COCODE_RUNTIME_CHANNEL
					: "stable",
		}
		const lease = await createHostSupervisorClient({
			nodeExecutable: resolveBundledNode(),
			serviceEntry: resolveSupervisorServiceEntry(),
		}).acquire({
			scope,
			clientKind: "gui",
			requiredServices: ["web"],
			minProtocolRevision: "1.0",
		})
		const endpoint = lease.descriptor.services.find((service) => service.service === "web")
		if (endpoint === undefined) {
			await lease.release().catch(() => undefined)
			throw new Error("shared Host did not advertise its Web service")
		}
		this.lease = lease
		this.runtimeUrl = endpoint.endpoint
		this.hostLogDirectoryValue = lease.logDirectory
		return endpoint.endpoint
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
		const bootstrap = parseDshRuntimeBootstrap({
			origin: new URL(runtimeUrl).origin,
			boot: extractDshBootManifest(html),
			themePreference: extractDshThemePreference(html),
		})
		await assertRequiredCocodeWebEndpoints(bootstrap.origin, bootstrap.boot)
		return bootstrap
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
		const lease = this.lease
		this.lease = null
		this.runtimeUrl = null
		this.hostLogDirectoryValue = undefined
		await lease?.release().catch(() => undefined)
	}

	private requireRuntimeUrl(): string {
		if (this.runtimeUrl === null) throw new Error("DSH runtime is not ready.")
		return this.runtimeUrl
	}
}

function resolveSupervisorServiceEntry(): string | undefined {
	if (process.env.COCODE_SUPERVISOR_SERVICE_ENTRY?.trim()) {
		return process.env.COCODE_SUPERVISOR_SERVICE_ENTRY.trim()
	}
	if (typeof process.resourcesPath === "string") {
		const candidate = path.join(
			process.resourcesPath,
			"dsh-runtime",
			"packages",
			"host-supervisor",
			"lib",
			"bin.js",
		)
		if (existsSync(candidate)) return candidate
	}
	return undefined
}

function resolveBundledNode(): string | undefined {
	if (process.env.COCODE_NODE_EXECUTABLE?.trim()) return process.env.COCODE_NODE_EXECUTABLE.trim()
	if (typeof process.resourcesPath === "string") {
		const candidate = path.join(process.resourcesPath, "cocode-node")
		if (existsSync(candidate)) return candidate
	}
	return undefined
}
