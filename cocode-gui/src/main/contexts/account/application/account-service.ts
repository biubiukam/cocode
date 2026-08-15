import { createHash, randomBytes } from "node:crypto"
import { shell } from "electron"
import type { AccountProfile, AccountSnapshot } from "../../../../contracts/ipc/account.contract"
import {
	DshCloudConfigUnavailableError,
	type DefaultSelection,
	type DshCloudConfigPort,
	type ModelGroup,
	type ProviderView,
	type SettingsNamespace,
} from "../infrastructure/dsh-cloud-config-port"
import {
	AgencyClient,
	AgencyHttpError,
	type AgencyModel,
	type TokenPair,
} from "../infrastructure/agency-client"
import { listenForCallback as createCallbackListener } from "../infrastructure/callback-server"
import { CleanupPendingStore, type CleanupPendingState } from "../infrastructure/cleanup-pending"
import { SecureVault } from "../infrastructure/secure-vault"

const CLOUD_PROVIDER = "cocode-cloud"
const CLOUD_NAMESPACE = "llm-pi-ai"
const CLOUD_PATH = ["providers", CLOUD_PROVIDER] as const
const CLOUD_CREDENTIAL = "COCODE_CLOUD_API_KEY"
const CLOUD_KEY_PATTERN = /^ck_[A-Za-z0-9_-]+$/

export type IdentityState = {
	readonly origin: string
	readonly accessToken: string
	readonly refreshToken: string
	readonly accessExpiresAt: number
	readonly profile?: AccountProfile
	readonly preLoginDefault?: DefaultSelection
	readonly managedRoute?: { readonly baseURL: string; readonly apiKeyEnv: string }
}

type Vault<T> = {
	read(): Promise<T | undefined>
	write(value: T): Promise<void>
	clear(): Promise<void>
}

type AccountAgency = {
	getOrigin(): string
	startAuthorization(input: {
		redirectUri: string
		state: string
		codeChallenge: string
	}): Promise<string>
	exchangeCode(input: { code: string; redirectUri: string; verifier: string }): Promise<TokenPair>
	refresh(refreshToken: string): Promise<TokenPair>
	profile(accessToken: string): Promise<AccountProfile>
	createDesktopKey(accessToken: string): Promise<string>
	models(apiKey: string): Promise<AgencyModel[]>
	revoke(refreshToken: string): Promise<void>
}

type AccountDshPort = Pick<
	DshCloudConfigPort,
	| "describeSettings"
	| "describeCredentials"
	| "providers"
	| "models"
	| "currentDefault"
	| "mutateSettings"
	| "setCredential"
	| "unsetCredential"
>

type CallbackListener = {
	readonly redirectUri: string
	wait(): Promise<URL>
	close(): void
}

export type AccountServiceDependencies = {
	readonly identity: Vault<IdentityState>
	readonly cloudKey: Vault<string>
	readonly cleanupPending: Pick<CleanupPendingStore, "read" | "write" | "clear">
	readonly listenForCallback: (pathname: string) => Promise<CallbackListener>
	readonly openExternal: (url: string) => Promise<unknown>
}

class CloudProviderConflictError extends Error {
	constructor(message = "cocode-cloud provider is already configured by another source") {
		super(message)
		this.name = "CloudProviderConflictError"
	}
}

class InvalidIdentityError extends Error {
	constructor() {
		super("Cocode session is no longer valid")
		this.name = "InvalidIdentityError"
	}
}

function emptySnapshot(): AccountSnapshot {
	return {
		phase: "signed-out",
		profile: null,
		cloud: { status: "absent", providerId: CLOUD_PROVIDER },
	}
}

function base64Url(value: Buffer): string {
	return value.toString("base64url")
}

export function createPkce(): { verifier: string; challenge: string } {
	const verifier = base64Url(randomBytes(32))
	const challenge = base64Url(createHash("sha256").update(verifier).digest())
	return { verifier, challenge }
}

function valueAt(root: unknown, path: readonly string[]): unknown {
	let current = root
	for (const key of path) {
		if (typeof current !== "object" || current === null || Array.isArray(current))
			return undefined
		current = (current as Record<string, unknown>)[key]
	}
	return current
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: undefined
}

function routeOf(namespaces: readonly SettingsNamespace[]): Record<string, unknown> | undefined {
	const namespace = namespaces.find((item) => item.ns === CLOUD_NAMESPACE)
	return recordOf(valueAt(namespace?.value, CLOUD_PATH))
}

function routeMatches(
	route: Record<string, unknown> | undefined,
	managedRoute: { readonly baseURL: string; readonly apiKeyEnv: string } | undefined,
): boolean {
	return (
		managedRoute !== undefined &&
		route?.api === "openai-responses" &&
		route.baseURL === managedRoute.baseURL &&
		route.apiKeyEnv === managedRoute.apiKeyEnv
	)
}

function isExpectedCloudProvider(provider: ProviderView): boolean {
	return (
		provider.settingsNs === CLOUD_NAMESPACE &&
		provider.settingsPath.length === CLOUD_PATH.length &&
		provider.settingsPath.every((part, index) => part === CLOUD_PATH[index])
	)
}

function modelExists(groups: readonly ModelGroup[], selection: DefaultSelection): boolean {
	return groups.some(
		(group) =>
			group.id === selection.provider &&
			group.models.some((model) => model.id === selection.model),
	)
}

function cleanupStateOf(state: IdentityState): CleanupPendingState {
	return {
		pending: true,
		...(state.preLoginDefault === undefined ? {} : { previousDefault: state.preLoginDefault }),
		...(state.managedRoute === undefined ? {} : { managedRoute: state.managedRoute }),
	}
}

export class AccountService {
	private snapshotValue = emptySnapshot()
	private readonly listeners = new Set<(snapshot: AccountSnapshot) => void>()
	private readonly identity: Vault<IdentityState>
	private readonly cloudKey: Vault<string>
	private readonly cleanupPending: Pick<CleanupPendingStore, "read" | "write" | "clear">
	private readonly listenForCallback: AccountServiceDependencies["listenForCallback"]
	private readonly openExternal: AccountServiceDependencies["openExternal"]
	private readonly agency: AccountAgency
	private loaded = false
	private signInTask: Promise<AccountSnapshot> | undefined
	private refreshTask: Promise<void> | undefined

	constructor(
		private readonly dsh: AccountDshPort,
		agency: AccountAgency = new AgencyClient(),
		dependencies: Partial<AccountServiceDependencies> = {},
	) {
		this.agency = agency
		this.identity =
			dependencies.identity ?? new SecureVault<IdentityState>("cocode-account-identity.bin")
		this.cloudKey = dependencies.cloudKey ?? new SecureVault<string>("cocode-cloud-key.bin")
		this.cleanupPending = dependencies.cleanupPending ?? new CleanupPendingStore()
		this.listenForCallback = dependencies.listenForCallback ?? createCallbackListener
		this.openExternal = dependencies.openExternal ?? shell.openExternal
	}

	onChanged(listener: (snapshot: AccountSnapshot) => void): () => void {
		this.listeners.add(listener)
		return () => {
			this.listeners.delete(listener)
		}
	}

	async hydrate(): Promise<void> {
		await this.ensureLoaded()
		const pending = await this.cleanupPending.read()
		if (pending !== undefined) {
			try {
				await this.finishPendingCleanup(pending)
				await this.clearIdentity()
				await this.cloudKey.clear()
				this.publish(emptySnapshot())
			} catch (error) {
				this.publish({
					phase: "error",
					profile: null,
					cloud: { status: "error", providerId: CLOUD_PROVIDER },
					error: safeError(error, "cleanup-pending"),
				})
			}
			return
		}
		let state = await this.identity.read()
		if (state === undefined) {
			this.publish(emptySnapshot())
			return
		}
		try {
			this.assertIdentityOrigin(state)
			state = await this.ensureIdentityAccess(state)
			const profile = await this.loadIdentityProfile(state.accessToken)
			const next: IdentityState = { ...state, profile }
			await this.identity.write(next)
			this.publish({
				phase: "provisioning",
				profile,
				cloud: { status: "absent", providerId: CLOUD_PROVIDER },
			})
			await this.provision(next)
		} catch (error) {
			if (error instanceof InvalidIdentityError) {
				await this.handleInvalidIdentity(state)
				return
			}
			this.publish({
				phase: "error",
				profile: state.profile ?? null,
				cloud: {
					status: error instanceof CloudProviderConflictError ? "conflict" : "error",
					providerId: CLOUD_PROVIDER,
				},
				error: safeError(
					error,
					error instanceof CloudProviderConflictError
						? "cloud-provider-conflict"
						: "account-unavailable",
				),
			})
		}
	}

	async snapshot(): Promise<AccountSnapshot> {
		await this.ensureLoaded()
		return this.snapshotValue
	}

	async signIn(): Promise<AccountSnapshot> {
		if (this.signInTask !== undefined) return this.signInTask
		this.signInTask = this.performSignIn().finally(() => {
			this.signInTask = undefined
		})
		return this.signInTask
	}

	async signOut(): Promise<void> {
		await this.ensureLoaded()
		const state = await this.identity.read()
		const existingPending = await this.cleanupPending.read()
		const pending =
			state === undefined
				? existingPending ?? { pending: true as const }
				: cleanupStateOf(state)
		const defaultReady = await this.restoreDefaultOrQueue(pending)
		let cleanupError: unknown
		if (defaultReady) {
			try {
				await this.cleanupCloud(pending.managedRoute)
				await this.cleanupPending.clear()
			} catch (error) {
				cleanupError = error
				await this.writePendingBestEffort(pending)
			}
		} else {
			cleanupError = new DshCloudConfigUnavailableError()
		}
		// Never send a token to a different Agency origin after a development
		// environment switch. Local cleanup remains authoritative in that case.
		if (state !== undefined && state.origin === this.agency.getOrigin()) {
			try {
				await this.agency.revoke(state.refreshToken)
			} catch {
				// Remote revocation is best effort; local secret cleanup must continue.
			}
		}
		await this.clearIdentity()
		await this.cloudKey.clear()
		if (cleanupError !== undefined) {
			this.publish({
				phase: "error",
				profile: null,
				cloud: { status: "error", providerId: CLOUD_PROVIDER },
				error: safeError(cleanupError, "cleanup-pending"),
			})
			return
		}
		this.publish(emptySnapshot())
	}

	dispose(): void {
		this.listeners.clear()
	}

	private async performSignIn(): Promise<AccountSnapshot> {
		await this.ensureLoaded()
		this.publish({
			phase: "signing-in",
			profile: null,
			cloud: { status: "absent", providerId: CLOUD_PROVIDER },
		})
		try {
			const pending = await this.cleanupPending.read()
			if (pending !== undefined) {
				await this.finishPendingCleanup(pending)
				await this.clearIdentity()
				await this.cloudKey.clear()
			}
			let state = await this.identity.read()
			if (state === undefined) {
				const callback = await this.listenForCallback("/auth/callback")
				try {
					const { verifier, challenge } = createPkce()
					const stateValue = base64Url(randomBytes(24))
					const authorizationUrl = await this.agency.startAuthorization({
						redirectUri: callback.redirectUri,
						state: stateValue,
						codeChallenge: challenge,
					})
					await this.openExternal(authorizationUrl)
					const arrived = await callback.wait()
					if (arrived.searchParams.get("state") !== stateValue)
						throw new Error("login state mismatch")
					const code = arrived.searchParams.get("code")
					if (code === null || code === "") throw new Error("login was not approved")
					const token = await this.agency.exchangeCode({
						code,
						redirectUri: callback.redirectUri,
						verifier,
					})
					state = {
						origin: this.agency.getOrigin(),
						accessToken: token.access_token,
						refreshToken: token.refresh_token,
						accessExpiresAt: Date.now() + token.expires_in * 1000,
					}
					await this.identity.write(state)
				} finally {
					callback.close()
				}
			}
			this.assertIdentityOrigin(state)
			state = await this.ensureIdentityAccess(state)
			const profile = await this.loadIdentityProfile(state.accessToken)
			state = { ...state, profile }
			const currentDefault = await this.dsh.currentDefault()
			if (state.preLoginDefault === undefined)
				state = { ...state, preLoginDefault: currentDefault }
			await this.identity.write(state)
			this.publish({
				phase: "provisioning",
				profile,
				cloud: { status: "absent", providerId: CLOUD_PROVIDER },
			})
			return await this.provision(state)
		} catch (error) {
			if (error instanceof InvalidIdentityError) {
				const invalid = await this.identity.read()
				if (invalid !== undefined) {
					await this.handleInvalidIdentity(invalid)
					return this.snapshotValue
				}
			}
			const current = await this.identity.read()
			const snapshot: AccountSnapshot = {
				phase: "error",
				profile: current?.profile ?? null,
				cloud: {
					status: error instanceof CloudProviderConflictError ? "conflict" : "error",
					providerId: CLOUD_PROVIDER,
				},
				error: safeError(
					error,
					error instanceof CloudProviderConflictError
						? "cloud-provider-conflict"
						: "sign-in-failed",
				),
			}
			this.publish(snapshot)
			return snapshot
		}
	}

	private async provision(state: IdentityState): Promise<AccountSnapshot> {
		const baseURL = `${this.agency.getOrigin()}/v1`
		const settings = await this.dsh.describeSettings()
		const cloudNamespace = settings.namespaces.find((item) => item.ns === CLOUD_NAMESPACE)
		if (!settings.writable || cloudNamespace === undefined)
			throw new Error("Cocode Cloud settings are not writable")
		const route = routeOf(settings.namespaces)
		const credentials = await this.dsh.describeCredentials([CLOUD_CREDENTIAL])
		const providersBefore = await this.dsh.providers()
		const existingCredential = credentials[CLOUD_CREDENTIAL]
		if (existingCredential?.writable === false)
			throw new Error("Cocode Cloud credential storage is not writable")
		const hasManagedMetadata =
			state.managedRoute?.baseURL === baseURL &&
			state.managedRoute.apiKeyEnv === CLOUD_CREDENTIAL
		const managed =
			hasManagedMetadata && (route === undefined || routeMatches(route, state.managedRoute))
		if (route !== undefined && !managed) throw new CloudProviderConflictError()
		const existingProvider = providersBefore.find(
			(provider) => provider.provider === CLOUD_PROVIDER,
		)
		if (
			existingProvider !== undefined &&
			(!isExpectedCloudProvider(existingProvider) ||
				(existingProvider.active && route === undefined && !managed))
		)
			throw new CloudProviderConflictError()
		if (existingCredential?.configured === true && !hasManagedMetadata)
			throw new CloudProviderConflictError(
				"COCODE_CLOUD_API_KEY is already configured by another source",
			)
		const oldKey = await this.cloudKey.read()
		const key = await this.ensureCloudKey(state)
		const models = await this.agency.models(key)
		if (models.length === 0) throw new Error("Cocode Cloud returned no available models")
		const oldRoute = route === undefined ? undefined : { ...route }
		try {
			await this.dsh.setCredential(CLOUD_CREDENTIAL, key)
			await this.dsh.mutateSettings({
				ns: CLOUD_NAMESPACE,
				expectedRevision: cloudNamespace?.revision,
				ops: [
					{
						op: "set",
						path: CLOUD_PATH,
						value: {
							displayName: "Cocode Cloud",
							api: "openai-responses",
							baseURL,
							apiKeyEnv: CLOUD_CREDENTIAL,
							models: models.map((model) => ({ id: model.id, name: model.name })),
						},
					},
				],
			})
			const ready = await this.isCloudReady(models, await this.dsh.providers())
			if (!ready) throw new Error("Cocode Cloud provider did not become active")
			const next: IdentityState = {
				...state,
				managedRoute: { baseURL, apiKeyEnv: CLOUD_CREDENTIAL },
			}
			await this.cloudKey.write(key)
			await this.identity.write(next)
			const profile = next.profile ?? null
			const snapshot: AccountSnapshot = {
				phase: "signed-in",
				profile,
				cloud: { status: "ready", providerId: CLOUD_PROVIDER },
			}
			this.publish(snapshot)
			return snapshot
		} catch (error) {
			await this.rollbackProvision(oldRoute, oldKey, baseURL)
			throw error
		}
	}

	private async rollbackProvision(
		oldRoute: Record<string, unknown> | undefined,
		oldKey: string | undefined,
		baseURL: string,
	): Promise<void> {
		try {
			const settings = await this.dsh.describeSettings()
			const namespace = settings.namespaces.find((item) => item.ns === CLOUD_NAMESPACE)
			const currentRoute = routeOf(settings.namespaces)
			const intendedRoute = { baseURL, apiKeyEnv: CLOUD_CREDENTIAL }
			const routeWasWritten = routeMatches(currentRoute, intendedRoute)
			const credentialWasWrittenWithoutRoute =
				currentRoute === undefined && oldRoute === undefined
			if (!routeWasWritten && !credentialWasWrittenWithoutRoute) return
			if (routeWasWritten) {
				try {
					await this.dsh.mutateSettings({
						ns: CLOUD_NAMESPACE,
						expectedRevision: namespace?.revision,
						ops:
							oldRoute === undefined
								? [{ op: "unset", path: CLOUD_PATH }]
								: [{ op: "set", path: CLOUD_PATH, value: oldRoute }],
					})
				} catch {
					// Continue to credential rollback even when the settings revision
					// has changed underneath this saga.
				}
			}
			try {
				if (oldKey === undefined) await this.dsh.unsetCredential(CLOUD_CREDENTIAL)
				else await this.dsh.setCredential(CLOUD_CREDENTIAL, oldKey)
			} catch {
				// A later hydrate or cleanup-pending pass can retry without touching a
				// route that no longer matches the Cocode-managed shape.
			}
		} catch {
			// A later hydrate or cleanup-pending pass can retry without touching a
			// route that no longer matches the Cocode-managed shape.
		}
	}

	private async isCloudReady(
		models: readonly AgencyModel[],
		providers: readonly ProviderView[],
	): Promise<boolean> {
		const cloud = providers.find((provider) => provider.provider === CLOUD_PROVIDER)
		if (cloud?.active !== true) return false
		const groups = await this.dsh.models()
		const group = groups.find((candidate) => candidate.id === CLOUD_PROVIDER)
		return (
			group !== undefined &&
			models.some((model) => group.models.some((candidate) => candidate.id === model.id))
		)
	}

	private async ensureCloudKey(state: IdentityState): Promise<string> {
		const existing = await this.cloudKey.read()
		if (existing !== undefined && CLOUD_KEY_PATTERN.test(existing)) {
			try {
				if ((await this.agency.models(existing)).length > 0) return existing
			} catch (error) {
				if (
					!(error instanceof AgencyHttpError) ||
					(error.status !== 401 && error.status !== 403)
				)
					throw error
			}
		}
		if (existing !== undefined && !CLOUD_KEY_PATTERN.test(existing)) await this.cloudKey.clear()
		return this.agency.createDesktopKey(state.accessToken)
	}

	private async cleanupCloud(
		managedRoute: IdentityState["managedRoute"] = undefined,
	): Promise<void> {
		const settings = await this.dsh.describeSettings()
		const namespace = settings.namespaces.find((item) => item.ns === CLOUD_NAMESPACE)
		const route = routeOf(settings.namespaces)
		if (routeMatches(route, managedRoute)) {
			await this.dsh.mutateSettings({
				ns: CLOUD_NAMESPACE,
				expectedRevision: namespace?.revision,
				ops: [{ op: "unset", path: CLOUD_PATH }],
			})
			await this.dsh.unsetCredential(CLOUD_CREDENTIAL)
			return
		}
		if (managedRoute !== undefined && route === undefined)
			await this.dsh.unsetCredential(CLOUD_CREDENTIAL)
	}

	private async restoreDefaultOrQueue(pending: CleanupPendingState): Promise<boolean> {
		try {
			await this.restoreDefaultIfNeeded(pending.previousDefault)
			return true
		} catch (error) {
			if (!isDshUnavailable(error)) throw error
			await this.writePendingBestEffort(pending)
			return false
		}
	}

	private async finishPendingCleanup(pending: CleanupPendingState): Promise<void> {
		await this.restoreDefaultIfNeeded(pending.previousDefault)
		await this.cleanupCloud(pending.managedRoute)
		await this.cleanupPending.clear()
	}

	private async handleInvalidIdentity(state: IdentityState): Promise<void> {
		const pending = cleanupStateOf(state)
		let cleanupError: unknown
		try {
			await this.restoreDefaultIfNeeded(pending.previousDefault)
			await this.cleanupCloud(pending.managedRoute)
			await this.cleanupPending.clear()
		} catch (error) {
			cleanupError = error
			await this.writePendingBestEffort(pending)
		}
		await this.clearIdentity()
		await this.cloudKey.clear()
		if (cleanupError === undefined) {
			this.publish(emptySnapshot())
			return
		}
		this.publish({
			phase: "error",
			profile: null,
			cloud: { status: "error", providerId: CLOUD_PROVIDER },
			error: safeError(cleanupError, "cleanup-pending"),
		})
	}

	private async writePendingBestEffort(pending: CleanupPendingState): Promise<void> {
		try {
			await this.cleanupPending.write(pending)
		} catch {
			// Local identity cleanup remains authoritative even if the non-secret
			// retry marker cannot be persisted.
		}
	}

	private async restoreDefaultIfNeeded(previous: DefaultSelection | undefined): Promise<void> {
		const current = await this.dsh.currentDefault()
		if (current.provider !== CLOUD_PROVIDER) return
		if (previous === undefined)
			throw new Error("choose another default model before signing out")
		const groups = await this.dsh.models()
		if (!modelExists(groups, previous))
			throw new Error("the previous default model is no longer available")
		const settings = await this.dsh.describeSettings()
		const namespace = settings.namespaces.find((item) => item.ns === "agent-default-model")
		if (namespace === undefined) throw new Error("default model settings are unavailable")
		await this.dsh.mutateSettings({
			ns: "agent-default-model",
			expectedRevision: namespace.revision,
			ops: [
				{ op: "set", path: ["provider"], value: previous.provider },
				{ op: "set", path: ["model"], value: previous.model },
				...(previous.reasoningEffort === undefined
					? [{ op: "unset" as const, path: ["reasoningEffort"] }]
					: [
							{
								op: "set" as const,
								path: ["reasoningEffort"],
								value: previous.reasoningEffort,
							},
					  ]),
			],
		})
	}

	private async ensureAccess(state: IdentityState): Promise<IdentityState> {
		if (Date.now() < state.accessExpiresAt - 30_000) return state
		if (this.refreshTask !== undefined) {
			await this.refreshTask
			return (await this.identity.read()) ?? state
		}
		this.refreshTask = (async () => {
			const refreshed = await this.agency.refresh(state.refreshToken)
			await this.identity.write({
				...state,
				accessToken: refreshed.access_token,
				refreshToken: refreshed.refresh_token || state.refreshToken,
				accessExpiresAt: Date.now() + refreshed.expires_in * 1000,
			})
		})().finally(() => {
			this.refreshTask = undefined
		})
		await this.refreshTask
		return (await this.identity.read()) ?? state
	}

	private async ensureIdentityAccess(state: IdentityState): Promise<IdentityState> {
		try {
			return await this.ensureAccess(state)
		} catch (error) {
			if (isSessionFailure(error)) throw new InvalidIdentityError()
			throw error
		}
	}

	private async loadIdentityProfile(accessToken: string): Promise<AccountProfile> {
		try {
			return await this.agency.profile(accessToken)
		} catch (error) {
			if (isSessionFailure(error)) throw new InvalidIdentityError()
			throw error
		}
	}

	private assertIdentityOrigin(state: IdentityState): void {
		if (state.origin !== this.agency.getOrigin())
			throw new Error("Cocode account origin changed; sign in again")
	}

	private async clearIdentity(): Promise<void> {
		await this.identity.clear()
		this.snapshotValue = emptySnapshot()
	}

	private async ensureLoaded(): Promise<void> {
		if (this.loaded) return
		this.loaded = true
		await this.identity.read()
		await this.cloudKey.read()
	}

	private publish(snapshot: AccountSnapshot): void {
		this.snapshotValue = snapshot
		for (const listener of [...this.listeners]) listener(snapshot)
	}
}

function isSessionFailure(error: unknown): boolean {
	return error instanceof AgencyHttpError
		? error.status === 401 || error.status === 403
		: error instanceof Error && /session expired|could not load account/.test(error.message)
}

function isDshUnavailable(error: unknown): boolean {
	return (
		error instanceof DshCloudConfigUnavailableError ||
		(error instanceof Error &&
			/DSH runtime is not ready|configuration service is unavailable|fetch failed|ECONNREFUSED|network/i.test(
				error.message,
			))
	)
}

function safeError(error: unknown, code: string): { code: string; message: string } {
	const message = error instanceof Error ? error.message : String(error)
	return {
		code,
		message: message
			.replace(/ck_[A-Za-z0-9_-]+/g, "[redacted]")
			.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
			.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[redacted-token]"),
	}
}
