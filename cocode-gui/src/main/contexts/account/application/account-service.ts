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
	type CreatedApiKey,
	type TokenPair,
} from "../infrastructure/agency-client"
import { listenForCallback as createCallbackListener } from "../infrastructure/callback-server"
import { CleanupPendingStore, type CleanupPendingState } from "../infrastructure/cleanup-pending"
import { SecureVault } from "../infrastructure/secure-vault"
import { SharedAccountStore } from "../infrastructure/shared-account-store"

const CLOUD_PROVIDER = "cocode-cloud"
const CLOUD_NAMESPACE = "llm-pi-ai"
const CLOUD_PATH = ["providers", CLOUD_PROVIDER] as const
const CLOUD_CREDENTIAL = "COCODE_CLOUD_API_KEY"
const CLOUD_API = "openai-responses"
const CLOUD_KEY_PATTERN = /^ck_[A-Za-z0-9_-]+$/
const CLOUD_READY_ATTEMPTS = 6
const CLOUD_READY_RETRY_MS = 100

type AccountStage =
	| "cleanup"
	| "callback-server"
	| "authorization"
	| "exchange-code"
	| "identity-refresh"
	| "profile"
	| "default-model"
	| "settings.describe"
	| "credentials.describe"
	| "providers"
	| "cloud-key"
	| "models"
	| "credentials.set"
	| "settings.mutate"
	| "cloud-verification"
	| "logout"

export type IdentityState = {
	readonly origin: string
	readonly accessToken: string
	readonly refreshToken: string
	readonly accessExpiresAt: number
	readonly profile?: AccountProfile
	readonly preLoginDefault?: DefaultSelection
	readonly managedRoute?: { readonly baseURL: string; readonly apiKeyEnv: string }
	readonly personalKeyId?: string
	readonly personalKeyName?: string
}

type Vault<T> = {
	read(): Promise<T | undefined>
	write(value: T): Promise<void>
	clear(): Promise<void>
	withLock?<R>(operation: () => Promise<R>): Promise<R>
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
	createDesktopKey(accessToken: string): Promise<CreatedApiKey>
	models(apiKey: string): Promise<AgencyModel[]>
	accountUsage(accessToken: string): Promise<{
		readonly plan: string
		readonly fiveHour: number
		readonly week: number
		readonly month: number
		readonly syncedAt: string
	}>
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

function isManagedCloudRoute(
	route: Record<string, unknown> | undefined,
	managedRoute: { readonly baseURL: string; readonly apiKeyEnv: string } | undefined,
): boolean {
	return (
		managedRoute !== undefined &&
		(route?.api === CLOUD_API || route?.api === "openai-completions") &&
		route.baseURL === managedRoute.baseURL &&
		route.apiKeyEnv === managedRoute.apiKeyEnv
	)
}

function routeIsCurrent(
	route: Record<string, unknown> | undefined,
	managedRoute: { readonly baseURL: string; readonly apiKeyEnv: string } | undefined,
): boolean {
	return isManagedCloudRoute(route, managedRoute) && route?.api === CLOUD_API
}

function cloudRouteValue(
	baseURL: string,
	models: readonly { readonly id: string; readonly name: string }[],
): Record<string, unknown> {
	return {
		displayName: "Cocode Cloud",
		api: CLOUD_API,
		baseURL,
		apiKeyEnv: CLOUD_CREDENTIAL,
		models: models.map((model) => ({ id: model.id, name: model.name })),
	}
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
	private stage: AccountStage | undefined

	constructor(
		private readonly dsh: AccountDshPort,
		agency: AccountAgency = new AgencyClient(),
		dependencies: Partial<AccountServiceDependencies> = {},
	) {
		this.agency = agency
		this.identity = dependencies.identity ?? new SharedAccountStore()
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
		this.stage = "cleanup"
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
			this.stage = "identity-refresh"
			this.assertIdentityOrigin(state)
			state = await this.ensureIdentityAccess(state)
			this.stage = "profile"
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
			this.logFailure("hydrate", error)
			if (isReauthenticationRequired(error)) {
				await this.handleInvalidIdentity(state, { clearCloudKey: false })
				return
			}
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
		if (this.snapshotValue.phase !== "signed-in") return this.snapshotValue
		const state = await this.identity.read()
		if (state === undefined) return this.snapshotValue
		try {
			this.assertIdentityOrigin(state)
			const current = await this.ensureIdentityAccess(state)
			const usage = await this.agency.accountUsage(current.accessToken)
			const snapshot = { ...this.snapshotValue, usage }
			this.publish(snapshot)
			return snapshot
		} catch (error) {
			const snapshot: AccountSnapshot = {
				...this.snapshotValue,
				usage: {
					...this.snapshotValue.usage,
					error: safeError(error, "usage-unavailable").message,
				},
			}
			this.publish(snapshot)
			return snapshot
		}
	}

	async signIn(): Promise<AccountSnapshot> {
		if (this.signInTask !== undefined) return this.signInTask
		this.signInTask = this.performSignIn().finally(() => {
			this.signInTask = undefined
		})
		return this.signInTask
	}

	async signOut(): Promise<void> {
		this.stage = "logout"
		await this.ensureLoaded()
		if (this.identity.withLock !== undefined) {
			await this.identity.withLock(() => this.performSignOut())
			return
		}
		await this.performSignOut()
	}

	private async performSignOut(): Promise<void> {
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
				this.stage = "cleanup"
				await this.cleanupCloud(pending.managedRoute)
				await this.cleanupPending.clear()
			} catch (error) {
				this.logFailure("sign-out cleanup", error)
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
				this.stage = "cleanup"
				await this.finishPendingCleanup(pending)
				await this.clearIdentity()
				await this.cloudKey.clear()
			}
			let state = await this.identity.read()
			if (state !== undefined) {
				try {
					this.stage = "identity-refresh"
					this.assertIdentityOrigin(state)
					state = await this.ensureIdentityAccess(state)
				} catch (error) {
					if (!(error instanceof InvalidIdentityError)) throw error
					// An explicit retry should be able to recover from a stale or rotated
					// identity in one click instead of returning a signed-out snapshot and
					// requiring the user to click the button a second time.
					await this.handleInvalidIdentity(state)
					state = undefined
				}
			}
			if (state === undefined) {
				this.stage = "callback-server"
				const callback = await this.listenForCallback("/auth/callback")
				try {
					const { verifier, challenge } = createPkce()
					const stateValue = base64Url(randomBytes(24))
					this.stage = "authorization"
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
					this.stage = "exchange-code"
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
			this.stage = "identity-refresh"
			this.assertIdentityOrigin(state)
			state = await this.ensureIdentityAccess(state)
			this.stage = "profile"
			const profile = await this.loadIdentityProfile(state.accessToken)
			state = { ...state, profile }
			this.stage = "default-model"
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
			this.logFailure("sign-in", error)
			if (isReauthenticationRequired(error)) {
				const invalid = await this.identity.read()
				return this.handleBrowserReauthentication(invalid)
			}
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
		if (this.identity.withLock !== undefined) {
			return this.identity.withLock(async () =>
				this.provisionLocked((await this.identity.read()) ?? state),
			)
		}
		return this.provisionLocked(state)
	}

	private async provisionLocked(state: IdentityState): Promise<AccountSnapshot> {
		const baseURL = `${this.agency.getOrigin()}/v1`
		this.stage = "settings.describe"
		const settings = await this.dsh.describeSettings()
		const cloudNamespace = settings.namespaces.find((item) => item.ns === CLOUD_NAMESPACE)
		if (!settings.writable || cloudNamespace === undefined)
			throw new Error("Cocode Cloud settings are not writable")
		const route = routeOf(settings.namespaces)
		const intendedRoute = { baseURL, apiKeyEnv: CLOUD_CREDENTIAL }
		this.stage = "credentials.describe"
		const credentials = await this.dsh.describeCredentials([CLOUD_CREDENTIAL])
		this.stage = "providers"
		const providersBefore = await this.dsh.providers()
		const existingCredential = credentials[CLOUD_CREDENTIAL]
		if (existingCredential?.writable === false)
			throw new Error("Cocode Cloud credential storage is not writable")
		const hasManagedMetadata =
			state.managedRoute?.baseURL === baseURL &&
			state.managedRoute.apiKeyEnv === CLOUD_CREDENTIAL
		const managed =
			route === undefined ? hasManagedMetadata : isManagedCloudRoute(route, intendedRoute)
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
		if (
			routeIsCurrent(route, intendedRoute) &&
			existingCredential?.configured === true &&
			existingProvider?.active === true
		) {
			const group = (await this.dsh.models()).find(
				(candidate) => candidate.id === CLOUD_PROVIDER,
			)
			if (group !== undefined && group.models.length > 0) {
				const next: IdentityState = { ...state, managedRoute: intendedRoute }
				await this.identity.write(next)
				const snapshot: AccountSnapshot = {
					phase: "signed-in",
					profile: next.profile ?? null,
					cloud: { status: "ready", providerId: CLOUD_PROVIDER },
				}
				this.publish(snapshot)
				return snapshot
			}
		}
		// COCODE_CLOUD_API_KEY is a reserved product slot. If another client (for
		// example TUI) left a value there, reconcile it to the current Agency
		// account instead of stopping with a conflict. Other provider routes still
		// fail closed above.
		const oldKey = await this.cloudKey.read()
		const hadExistingCredential = existingCredential?.configured === true && !hasManagedMetadata
		this.stage = "cloud-key"
		const key = await this.ensureCloudKey(state)
		this.stage = "models"
		const models = await this.agency.models(key.secret)
		if (models.length === 0) throw new Error("Cocode Cloud returned no available models")
		// Persist a newly minted key before the DSH saga starts. If settings
		// activation fails after the Agency has created the key, the next retry
		// must reuse it instead of minting another device key.
		await this.cloudKey.write(key.secret)
		const oldRoute = route === undefined ? undefined : { ...route }
		try {
			this.stage = "credentials.set"
			await this.dsh.setCredential(CLOUD_CREDENTIAL, key.secret)
			this.stage = "settings.mutate"
			await this.dsh.mutateSettings({
				ns: CLOUD_NAMESPACE,
				expectedRevision: cloudNamespace?.revision,
				ops: [
					{
						op: "set",
						path: CLOUD_PATH,
						value: cloudRouteValue(baseURL, models),
					},
				],
			})
			this.stage = "cloud-verification"
			const ready = await this.waitForCloudReady(models)
			if (!ready) throw new Error("Cocode Cloud provider did not become active")
			const next: IdentityState = {
				...state,
				...(key.id === undefined ? {} : { personalKeyId: key.id }),
				...(key.name === undefined ? {} : { personalKeyName: key.name }),
				managedRoute: { baseURL, apiKeyEnv: CLOUD_CREDENTIAL },
			}
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
			await this.rollbackProvision(oldRoute, oldKey, baseURL, hadExistingCredential)
			throw error
		}
	}

	private async rollbackProvision(
		oldRoute: Record<string, unknown> | undefined,
		oldKey: string | undefined,
		baseURL: string,
		preserveExistingCredential = false,
	): Promise<void> {
		try {
			const settings = await this.dsh.describeSettings()
			const namespace = settings.namespaces.find((item) => item.ns === CLOUD_NAMESPACE)
			const currentRoute = routeOf(settings.namespaces)
			const intendedRoute = { baseURL, apiKeyEnv: CLOUD_CREDENTIAL }
			const routeWasWritten = routeIsCurrent(currentRoute, intendedRoute)
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
				if (oldKey === undefined) {
					if (!preserveExistingCredential)
						await this.dsh.unsetCredential(CLOUD_CREDENTIAL)
				} else await this.dsh.setCredential(CLOUD_CREDENTIAL, oldKey)
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

	private async waitForCloudReady(models: readonly AgencyModel[]): Promise<boolean> {
		for (let attempt = 0; attempt < CLOUD_READY_ATTEMPTS; attempt += 1) {
			if (attempt > 0)
				await new Promise((resolve) => setTimeout(resolve, CLOUD_READY_RETRY_MS))
			if (await this.isCloudReady(models, await this.dsh.providers())) return true
		}
		return false
	}

	private async ensureCloudKey(
		state: IdentityState,
	): Promise<{ readonly secret: string; readonly id?: string; readonly name?: string }> {
		const existing = await this.cloudKey.read()
		if (existing !== undefined && CLOUD_KEY_PATTERN.test(existing)) {
			try {
				if ((await this.agency.models(existing)).length > 0) {
					return {
						secret: existing,
						...(state.personalKeyId === undefined ? {} : { id: state.personalKeyId }),
						...(state.personalKeyName === undefined
							? {}
							: { name: state.personalKeyName }),
					}
				}
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
		if (isManagedCloudRoute(route, managedRoute)) {
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

	private async handleInvalidIdentity(
		state: IdentityState,
		options: { readonly clearCloudKey?: boolean } = {},
	): Promise<void> {
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
		if (options.clearCloudKey !== false) await this.cloudKey.clear()
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

	private async handleBrowserReauthentication(
		state: IdentityState | undefined,
	): Promise<AccountSnapshot> {
		if (state !== undefined) {
			await this.handleInvalidIdentity(state, { clearCloudKey: false })
			if (this.snapshotValue.error?.code === "cleanup-pending") return this.snapshotValue
		}
		try {
			await this.openExternal(browserReauthenticationUrl(this.agency.getOrigin()))
		} catch {
			// The actionable state is still shown in the desktop UI if the browser
			// could not be launched.
		}
		const snapshot: AccountSnapshot = {
			phase: "error",
			profile: null,
			cloud: { status: "error", providerId: CLOUD_PROVIDER },
			error: {
				code: "reauthentication-required",
				message:
					"Cocode requires a recent browser reauthentication. Complete it in the browser, then retry.",
			},
		}
		this.publish(snapshot)
		return snapshot
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
			const refresh = async (): Promise<void> => {
				const current = (await this.identity.read()) ?? state
				if (Date.now() < current.accessExpiresAt - 30_000) return
				this.stage = "identity-refresh"
				const refreshed = await this.agency.refresh(current.refreshToken)
				await this.identity.write({
					...current,
					accessToken: refreshed.access_token,
					refreshToken: refreshed.refresh_token || current.refreshToken,
					accessExpiresAt: Date.now() + refreshed.expires_in * 1000,
				})
			}
			if (this.identity.withLock !== undefined) await this.identity.withLock(refresh)
			else await refresh()
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

	private logFailure(operation: string, error: unknown): void {
		const detail = safeError(error, "account-operation-failed")
		console.error("[cocode-account]", operation, {
			stage: this.stage ?? "unknown",
			code: detail.code,
			message: detail.message,
		})
	}
}

function isSessionFailure(error: unknown): boolean {
	return error instanceof AgencyHttpError
		? error.status === 401 || error.status === 403
		: error instanceof Error && /session expired|could not load account/.test(error.message)
}

function isReauthenticationRequired(error: unknown): boolean {
	return (
		error instanceof AgencyHttpError &&
		error.status === 403 &&
		/reauthentication[_\s-]*required|reauthenticate(?:d)?\s+(?:this\s+)?browser\s+session/i.test(
			error.message,
		)
	)
}

function browserReauthenticationUrl(origin: string): string {
	const url = new URL("/login", origin)
	url.searchParams.set("return_to", "/account")
	return url.href
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
