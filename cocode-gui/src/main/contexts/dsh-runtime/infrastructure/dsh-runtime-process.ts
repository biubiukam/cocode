import { existsSync } from "node:fs"
import { randomUUID } from "node:crypto"
import * as path from "pathe"
import { app } from "electron"
import type {
	DshRuntimeBootstrapDto,
	DshRuntimeReboundDto,
	DshRuntimeRecoveryReason,
	DshRuntimeRecoveryStateDto,
	DshRuntimeRequestDto,
	DshRuntimeResponseDto,
} from "../../../../contracts/ipc/dsh-runtime.contract"
import { isDshHttpPath } from "../../../../contracts/dsh-runtime-path"
import { parseDshRuntimeBootstrap } from "../../../../contracts/schemas/dsh-runtime.schema"
import { extractDshBootManifest, extractDshThemePreference } from "./dsh-runtime-bootstrap"
import { assertRequiredCocodeWebEndpoints } from "./dsh-runtime-health"
import { resolveCocodeDshHome, resolveCocodeHome } from "./dsh-home"
import {
	createHostSupervisorClient,
	resolveHostRuntimeEnv,
	resolveCocodeHostScope,
	type HostLease,
} from "@cocode/host-supervisor"
import type { DesktopLogger } from "../../../shared/logging/desktop-logger"

const FORWARDED_REQUEST_HEADERS = new Set(["accept", "content-type", "if-none-match", "range"])
const RECOVERY_MAX_ATTEMPTS = 3
const RECOVERY_BACKOFF_MS = [500, 1_000, 2_000] as const

/**
 * Electron's Host adapter. It owns a Supervisor lease, never the DSH process.
 * The main/preload allow-list remains the only renderer-facing HTTP boundary.
 */
export class DshRuntimeProcess {
	private lease: HostLease | null = null
	private runtimeUrl: string | null = null
	private hostLogDirectoryValue: string | undefined
	private endpointGeneration = 0
	private recoveryPromise: Promise<DshRuntimeRecoveryStateDto> | null = null
	private recoveryAbortController: AbortController | null = null
	private closing = false
	private readonly recoveryEnabled = process.env.COCODE_DSH_RUNTIME_AUTO_RECOVERY !== "0"
	private readonly recoveryStateListeners = new Set<(state: DshRuntimeRecoveryStateDto) => void>()
	private readonly reboundListeners = new Set<(event: DshRuntimeReboundDto) => void>()

	public constructor(private readonly logger?: DesktopLogger) {}

	public get hostLogDirectory(): string | undefined {
		return this.hostLogDirectoryValue
	}

	public get hostPid(): number | undefined {
		return this.lease?.descriptor.hostPid
	}

	public get currentEndpointGeneration(): number {
		return this.endpointGeneration
	}

	public get isRecoveryEnabled(): boolean {
		return this.recoveryEnabled
	}

	public onRecoveryState(listener: (state: DshRuntimeRecoveryStateDto) => void): () => void {
		this.recoveryStateListeners.add(listener)
		return () => this.recoveryStateListeners.delete(listener)
	}

	public onRebound(listener: (event: DshRuntimeReboundDto) => void): () => void {
		this.reboundListeners.add(listener)
		return () => this.reboundListeners.delete(listener)
	}

	public async start(): Promise<string> {
		if (this.closing) throw new Error("DSH runtime is shutting down.")
		if (this.lease !== null) throw new Error("DSH Host lease is already active.")
		const cocodeHome = resolveCocodeHome()
		const cocodeDshHome = resolveCocodeDshHome()
		const scope = resolveCocodeHostScope({
			...process.env,
			COCODE_HOME: cocodeHome,
			COCODE_DSH_HOME: cocodeDshHome,
		})
		// Derive the runtime environment from the same explicit shared DSH home
		// used for the scope so the newly spawned Host receives the same route.
		const runtimeEnv = resolveHostRuntimeEnv({
			...process.env,
			COCODE_HOME: cocodeHome,
			COCODE_DSH_HOME: cocodeDshHome,
		})
		this.logger?.log("info", "dsh.host.scope.resolved", {
			attributes: {
				dshHome: scope.dshHome,
				profile: scope.profile,
				hostConfigFingerprint: scope.hostConfigFingerprint,
				runtimeChannel: scope.runtimeChannel,
				hasRuntimeEnv: Object.keys(runtimeEnv).length > 0,
			},
		})
		const lease = await createHostSupervisorClient({
			nodeExecutable: resolveBundledNode(),
			serviceEntry: resolveSupervisorServiceEntry(),
		}).acquire({
			scope,
			clientKind: "gui",
			requiredServices: ["web"],
			minProtocolRevision: "1.0",
			runtimeEnv,
		})
		const endpoint = lease.descriptor.services.find((service) => service.service === "web")
		if (lease.descriptor.dshHome !== scope.dshHome || lease.descriptor.profile !== "cocode") {
			await lease.release().catch(() => undefined)
			throw new Error("Cocode Host descriptor escaped the shared DSH home/profile boundary")
		}
		if (endpoint === undefined) {
			await lease.release().catch(() => undefined)
			throw new Error("shared Host did not advertise its Web service")
		}
		this.logger?.log("info", "dsh.host.scope.acquired", {
			attributes: {
				hostKey: lease.descriptor.hostKey,
				dshHome: lease.descriptor.dshHome,
				profile: lease.descriptor.profile,
				hostConfigFingerprint: lease.descriptor.hostConfigFingerprint,
				runtimeChannel: scope.runtimeChannel,
				hostPid: lease.descriptor.hostPid,
			},
		})
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
		if (this.recoveryPromise !== null) {
			throw new Error(
				request.method === "POST"
					? "OUTCOME_UNKNOWN: DSH runtime recovery is in progress; the mutation was not replayed."
					: "RUNTIME_RECOVERING: DSH runtime recovery is in progress.",
			)
		}
		const runtimeUrl = this.requireRuntimeUrl()
		const target = new URL(request.path, runtimeUrl)
		if (target.origin !== new URL(runtimeUrl).origin || !isDshHttpPath(target.pathname)) {
			throw new Error("DSH runtime request escaped the allow-listed HTTP surface.")
		}
		const headers = new Headers()
		for (const [name, value] of request.headers) {
			if (FORWARDED_REQUEST_HEADERS.has(name.toLowerCase())) headers.append(name, value)
		}
		let response: Response
		try {
			response = await fetch(target, {
				method: request.method,
				headers,
				body:
					request.method === "GET" || request.method === "HEAD"
						? undefined
						: request.body,
				signal,
			})
		} catch (error) {
			if (request.method === "POST" && !signal.aborted) {
				throw new Error(
					`OUTCOME_UNKNOWN: DSH runtime did not confirm whether the mutation was accepted (${errorMessage(
						error,
					)}).`,
				)
			}
			throw error
		}
		return {
			status: response.status,
			statusText: response.statusText,
			headers: [...response.headers.entries()],
			body: new Uint8Array(await response.arrayBuffer()),
		}
	}

	public async recover(
		reason: DshRuntimeRecoveryReason,
		requestedGeneration: number,
	): Promise<DshRuntimeRecoveryStateDto> {
		if (!this.recoveryEnabled) {
			return {
				state: "failed",
				attempt: 0,
				maxAttempts: RECOVERY_MAX_ATTEMPTS,
				recoveryId: "recovery-disabled",
				endpointGeneration: this.endpointGeneration,
				error: {
					code: "RUNTIME_RECOVERY_DISABLED",
					message: "Automatic DSH runtime recovery is disabled.",
				},
			}
		}
		if (this.closing) {
			return {
				state: "failed",
				attempt: 0,
				maxAttempts: RECOVERY_MAX_ATTEMPTS,
				recoveryId: "application-shutting-down",
				endpointGeneration: this.endpointGeneration,
				error: {
					code: "RUNTIME_SHUTTING_DOWN",
					message: "The application is shutting down.",
				},
			}
		}
		if (requestedGeneration !== this.endpointGeneration && this.recoveryPromise === null) {
			return {
				state: "ready",
				attempt: 0,
				maxAttempts: RECOVERY_MAX_ATTEMPTS,
				recoveryId: "stale-request",
				endpointGeneration: this.endpointGeneration,
			}
		}
		if (this.recoveryPromise !== null) return this.recoveryPromise
		const recoveryId = randomUUID()
		const abortController = new AbortController()
		this.recoveryAbortController = abortController
		this.recoveryPromise = this.performRecovery(
			recoveryId,
			reason,
			abortController.signal,
		).finally(() => {
			if (this.recoveryAbortController === abortController)
				this.recoveryAbortController = null
			this.recoveryPromise = null
		})
		return this.recoveryPromise
	}

	public async stop(): Promise<void> {
		const lease = this.lease
		this.lease = null
		this.runtimeUrl = null
		this.hostLogDirectoryValue = undefined
		await lease?.release().catch(() => undefined)
	}

	/** Stop recovery before application teardown so shutdown cannot relaunch a Host. */
	public async shutdown(): Promise<void> {
		this.closing = true
		this.recoveryAbortController?.abort()
		await this.recoveryPromise?.catch(() => undefined)
		await this.stop()
	}

	private requireRuntimeUrl(): string {
		if (this.runtimeUrl === null) throw new Error("DSH runtime is not ready.")
		return this.runtimeUrl
	}

	private async performRecovery(
		recoveryId: string,
		reason: DshRuntimeRecoveryReason,
		signal: AbortSignal,
	): Promise<DshRuntimeRecoveryStateDto> {
		for (let attempt = 1; attempt <= RECOVERY_MAX_ATTEMPTS; attempt += 1) {
			if (signal.aborted || this.closing) throw new Error("DSH runtime recovery cancelled.")
			const startedAt = Date.now()
			const oldOrigin = this.runtimeUrl === null ? undefined : safeOrigin(this.runtimeUrl)
			this.emitRecoveryState({
				state: "recovering",
				attempt,
				maxAttempts: RECOVERY_MAX_ATTEMPTS,
				reason,
				recoveryId,
				endpointGeneration: this.endpointGeneration,
			})
			await this.stop()
			try {
				if (signal.aborted || this.closing)
					throw new Error("DSH runtime recovery cancelled.")
				await this.start()
				const bootstrap = await this.getBootstrap()
				if (signal.aborted || this.closing)
					throw new Error("DSH runtime recovery cancelled.")
				this.endpointGeneration += 1
				const ready: DshRuntimeRecoveryStateDto = {
					state: "ready",
					attempt,
					maxAttempts: RECOVERY_MAX_ATTEMPTS,
					reason,
					recoveryId,
					endpointGeneration: this.endpointGeneration,
				}
				this.emitRecoveryState(ready)
				this.logger?.log("info", "dsh.runtime.recovery.completed", {
					outcome: "success",
					durationMs: Date.now() - startedAt,
					attributes: {
						recoveryId,
						attempt,
						reason,
						oldOrigin,
						newOrigin: safeOrigin(bootstrap.origin),
						endpointGeneration: this.endpointGeneration,
					},
				})
				const rebound: DshRuntimeReboundDto = {
					endpointGeneration: this.endpointGeneration,
					bootstrap,
				}
				for (const listener of [...this.reboundListeners]) {
					try {
						listener(rebound)
					} catch (listenerError) {
						this.logger?.log("error", "dsh.runtime.rebound.listener.failed", {
							error: listenerError,
						})
					}
				}
				return ready
			} catch (error) {
				if (signal.aborted || this.closing) throw error
				this.logger?.log("warn", "dsh.runtime.recovery.attempt.failed", {
					error,
					durationMs: Date.now() - startedAt,
					attributes: { recoveryId, attempt, reason, oldOrigin },
				})
				await this.stop()
				if (attempt === RECOVERY_MAX_ATTEMPTS) {
					const failed: DshRuntimeRecoveryStateDto = {
						state: "failed",
						attempt,
						maxAttempts: RECOVERY_MAX_ATTEMPTS,
						reason,
						recoveryId,
						endpointGeneration: this.endpointGeneration,
						error: { code: "RUNTIME_UNAVAILABLE", message: errorMessage(error) },
					}
					this.emitRecoveryState(failed)
					return failed
				}
				const backoff =
					RECOVERY_BACKOFF_MS[attempt - 1] ??
					RECOVERY_BACKOFF_MS[RECOVERY_BACKOFF_MS.length - 1]
				await delay(backoff / 2 + Math.random() * (backoff / 2), signal)
			}
		}
		throw new Error("DSH runtime recovery loop exited unexpectedly")
	}

	private emitRecoveryState(state: DshRuntimeRecoveryStateDto): void {
		for (const listener of [...this.recoveryStateListeners]) {
			try {
				listener(state)
			} catch (listenerError) {
				this.logger?.log("error", "dsh.runtime.recovery.listener.failed", {
					error: listenerError,
				})
			}
		}
	}
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const timer = setTimeout(done, milliseconds)
		signal.addEventListener("abort", done, { once: true })
		function done(): void {
			clearTimeout(timer)
			signal.removeEventListener("abort", done)
			resolve()
		}
	})
}

function safeOrigin(value: string): string {
	try {
		return new URL(value).origin
	} catch {
		return "<invalid-origin>"
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
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
	if (app.isPackaged) {
		throw new Error(
			`Packaged DSH runtime is missing its supervisor entry under ${process.resourcesPath}.`,
		)
	}
	return undefined
}

function resolveBundledNode(): string | undefined {
	if (process.env.COCODE_NODE_EXECUTABLE?.trim()) return process.env.COCODE_NODE_EXECUTABLE.trim()
	if (typeof process.resourcesPath === "string") {
		const candidate = path.join(process.resourcesPath, "cocode-node")
		if (existsSync(candidate)) return candidate
	}
	if (app.isPackaged) {
		throw new Error(
			`Packaged DSH runtime is missing its Node executable under ${process.resourcesPath}.`,
		)
	}
	return undefined
}
