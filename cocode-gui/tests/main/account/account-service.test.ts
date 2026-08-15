import assert from "node:assert/strict"
import test from "node:test"
import {
	AccountService,
	type AccountServiceDependencies,
	type IdentityState,
} from "../../../src/main/contexts/account/application/account-service"
import { AgencyHttpError } from "../../../src/main/contexts/account/infrastructure/agency-client"
import type { CleanupPendingState } from "../../../src/main/contexts/account/infrastructure/cleanup-pending"
import {
	DshCloudConfigUnavailableError,
	type DefaultSelection,
	type ModelGroup,
	type ProviderView,
	type SettingsNamespace,
} from "../../../src/main/contexts/account/infrastructure/dsh-cloud-config-port"

class MemoryVault<T> {
	clearCount = 0
	writes: T[] = []

	constructor(public value: T | undefined) {}

	async read(): Promise<T | undefined> {
		return this.value
	}
	async write(value: T): Promise<void> {
		this.value = value
		this.writes.push(value)
	}
	async clear(): Promise<void> {
		this.value = undefined
		this.clearCount += 1
	}
}

class MemoryPending {
	clearCount = 0
	writes: CleanupPendingState[] = []

	constructor(public value: CleanupPendingState | undefined = undefined) {}

	async read(): Promise<CleanupPendingState | undefined> {
		return this.value
	}
	async write(value: CleanupPendingState): Promise<void> {
		this.value = value
		this.writes.push(value)
	}
	async clear(): Promise<void> {
		this.value = undefined
		this.clearCount += 1
	}
}

function validIdentity(overrides: Partial<IdentityState> = {}): IdentityState {
	return {
		origin: "https://cocode.agency",
		accessToken: "identity-access",
		refreshToken: "identity-refresh",
		accessExpiresAt: Date.now() + 60_000,
		...overrides,
	}
}

function agency(overrides: Record<string, unknown> = {}): {
	client: never
	createdKeys: string[]
	revoked: string[]
} {
	const createdKeys: string[] = []
	const revoked: string[] = []
	return {
		client: {
			getOrigin: () => "https://cocode.agency",
			startAuthorization: async () => "https://cocode.agency/authorize",
			exchangeCode: async () => ({
				access_token: "identity-access",
				refresh_token: "identity-refresh",
				expires_in: 3600,
			}),
			refresh: async () => ({
				access_token: "identity-access",
				refresh_token: "identity-refresh",
				expires_in: 3600,
			}),
			profile: async () => ({ displayName: "Cocode User" }),
			createDesktopKey: async () => {
				createdKeys.push("ck_test")
				return "ck_test"
			},
			models: async () => [{ id: "cloud-model", name: "Cloud Model" }],
			revoke: async (token: string) => {
				revoked.push(token)
			},
			...overrides,
		} as never,
		createdKeys,
		revoked,
	}
}

function dependencies(
	identity: MemoryVault<IdentityState>,
	cloudKey = new MemoryVault<string>(undefined),
	pending = new MemoryPending(),
): {
	deps: Partial<AccountServiceDependencies>
	cloudKey: MemoryVault<string>
	pending: MemoryPending
} {
	return {
		deps: {
			identity,
			cloudKey,
			cleanupPending: pending,
			listenForCallback: async () => {
				throw new Error("browser login was not expected")
			},
			openExternal: async () => undefined,
		},
		cloudKey,
		pending,
	}
}

test("provider conflicts are reported before a cloud key or DSH write", async () => {
	const identity = new MemoryVault(validIdentity())
	const { client, createdKeys } = agency()
	let writes = 0
	const dsh = {
		currentDefault: async () => ({ provider: "deepseek-official", model: "deepseek-v4-flash" }),
		describeSettings: async () => ({
			writable: true,
			namespaces: [
				{
					ns: "llm-pi-ai",
					revision: 4,
					value: {
						providers: {
							"cocode-cloud": {
								api: "openai-responses",
								baseURL: "https://other.example/v1",
								apiKeyEnv: "OTHER_KEY",
							},
						},
					},
				},
			],
		}),
		describeCredentials: async () => ({
			COCODE_CLOUD_API_KEY: { configured: false, writable: true },
		}),
		providers: async (): Promise<ProviderView[]> => [],
		models: async (): Promise<ModelGroup[]> => [],
		mutateSettings: async () => {
			writes += 1
		},
		setCredential: async () => {
			writes += 1
		},
		unsetCredential: async () => {
			writes += 1
		},
	} as never
	const { deps } = dependencies(identity)
	const service = new AccountService(dsh, client, deps)

	const snapshot = await service.signIn()
	assert.equal(snapshot.phase, "error")
	assert.equal(snapshot.cloud.status, "conflict")
	assert.equal(snapshot.error?.code, "cloud-provider-conflict")
	assert.deepEqual(createdKeys, [])
	assert.equal(writes, 0)
})

test("an active reserved provider without a managed route is a conflict", async () => {
	const identity = new MemoryVault(validIdentity())
	const { client, createdKeys } = agency()
	const dsh = {
		currentDefault: async () => ({ provider: "deepseek-official", model: "deepseek-v4-flash" }),
		describeSettings: async () => ({
			writable: true,
			namespaces: [{ ns: "llm-pi-ai", revision: 1, value: { providers: {} } }],
		}),
		describeCredentials: async () => ({
			COCODE_CLOUD_API_KEY: { configured: false, writable: true },
		}),
		providers: async (): Promise<ProviderView[]> => [
			{
				provider: "cocode-cloud",
				displayName: "Other Cloud",
				settingsNs: "llm-pi-ai",
				settingsPath: ["providers", "cocode-cloud"],
				active: true,
			},
		],
		models: async (): Promise<ModelGroup[]> => [],
		mutateSettings: async (): Promise<void> => undefined,
		setCredential: async (): Promise<void> => undefined,
		unsetCredential: async (): Promise<void> => undefined,
	} as never
	const { deps } = dependencies(identity)
	const snapshot = await new AccountService(dsh, client, deps).signIn()
	assert.equal(snapshot.phase, "error")
	assert.equal(snapshot.cloud.status, "conflict")
	assert.deepEqual(createdKeys, [])
})

test("failed provider activation rolls back the managed route and credential", async () => {
	const identity = new MemoryVault(validIdentity())
	const { client } = agency()
	let route: Record<string, unknown> | undefined
	let credentialConfigured = false
	const mutations: string[] = []
	const settings = (): SettingsNamespace[] => [
		{
			ns: "llm-pi-ai",
			revision: mutations.length,
			value:
				route === undefined ? { providers: {} } : { providers: { "cocode-cloud": route } },
		},
	]
	const dsh = {
		currentDefault: async () => ({ provider: "deepseek-official", model: "deepseek-v4-flash" }),
		describeSettings: async () => ({ writable: true, namespaces: settings() }),
		describeCredentials: async () => ({
			COCODE_CLOUD_API_KEY: { configured: credentialConfigured, writable: true },
		}),
		setCredential: async () => {
			credentialConfigured = true
			mutations.push("credential:set")
		},
		unsetCredential: async () => {
			credentialConfigured = false
			mutations.push("credential:unset")
		},
		mutateSettings: async (request: { ops: { op: "set" | "unset"; value?: unknown }[] }) => {
			const op = request.ops[0]
			if (op?.op === "set") route = op.value as Record<string, unknown>
			else route = undefined
			mutations.push(`route:${op?.op ?? "none"}`)
		},
		providers: async () => [
			{
				provider: "cocode-cloud",
				displayName: "Cocode Cloud",
				settingsNs: "llm-pi-ai",
				settingsPath: ["providers", "cocode-cloud"],
				active: false,
			},
		],
		models: async (): Promise<ModelGroup[]> => [],
	} as never
	const { deps, cloudKey } = dependencies(identity)
	const service = new AccountService(dsh, client, deps)

	const snapshot = await service.signIn()
	assert.equal(snapshot.phase, "error")
	assert.equal(route, undefined)
	assert.equal(credentialConfigured, false)
	assert.deepEqual(mutations, ["credential:set", "route:set", "route:unset", "credential:unset"])
	assert.equal(cloudKey.value, undefined)
})

test("provider write failure before route creation still rolls back the credential", async () => {
	const identity = new MemoryVault(validIdentity())
	const { client } = agency()
	let credentialConfigured = false
	const dsh = {
		currentDefault: async () => ({ provider: "deepseek-official", model: "deepseek-v4-flash" }),
		describeSettings: async () => ({
			writable: true,
			namespaces: [{ ns: "llm-pi-ai", revision: 1, value: { providers: {} } }],
		}),
		describeCredentials: async () => ({
			COCODE_CLOUD_API_KEY: { configured: credentialConfigured, writable: true },
		}),
		providers: async (): Promise<ProviderView[]> => [],
		models: async (): Promise<ModelGroup[]> => [],
		setCredential: async () => {
			credentialConfigured = true
		},
		unsetCredential: async () => {
			credentialConfigured = false
		},
		mutateSettings: async () => {
			throw new Error("settings write failed")
		},
	} as never
	const { deps } = dependencies(identity)
	const snapshot = await new AccountService(dsh, client, deps).signIn()
	assert.equal(snapshot.phase, "error")
	assert.equal(credentialConfigured, false)
})

test("sign out restores a cloud default before removing only the managed provider", async () => {
	const previous: DefaultSelection = { provider: "deepseek-official", model: "deepseek-v4-flash" }
	const identity = new MemoryVault(
		validIdentity({
			preLoginDefault: previous,
			managedRoute: {
				baseURL: "https://cocode.agency/v1",
				apiKeyEnv: "COCODE_CLOUD_API_KEY",
			},
		}),
	)
	const { client, revoked } = agency()
	let current: DefaultSelection = { provider: "cocode-cloud", model: "cloud-model" }
	let route: Record<string, unknown> | undefined = {
		displayName: "Cocode Cloud",
		api: "openai-responses",
		baseURL: "https://cocode.agency/v1",
		apiKeyEnv: "COCODE_CLOUD_API_KEY",
		models: [{ id: "cloud-model", name: "Cloud Model" }],
	}
	const mutations: string[] = []
	const dsh = {
		currentDefault: async () => current,
		models: async () => [
			{
				id: "deepseek-official",
				name: "DeepSeek",
				models: [{ id: "deepseek-v4-flash", name: "Flash" }],
			},
			{
				id: "cocode-cloud",
				name: "Cocode Cloud",
				models: [{ id: "cloud-model", name: "Cloud Model" }],
			},
		],
		describeSettings: async () => ({
			writable: true,
			namespaces: [
				{ ns: "agent-default-model", revision: 7, value: current },
				{
					ns: "llm-pi-ai",
					revision: 9,
					value:
						route === undefined
							? { providers: {} }
							: { providers: { "cocode-cloud": route } },
				},
			],
		}),
		describeCredentials: async () => ({
			COCODE_CLOUD_API_KEY: { configured: true, writable: true },
		}),
		providers: async (): Promise<ProviderView[]> => [],
		setCredential: async (): Promise<void> => undefined,
		unsetCredential: async () => {
			mutations.push("credential:unset")
		},
		mutateSettings: async (request: {
			ns: string
			ops: { op: "set" | "unset"; path: readonly string[]; value?: unknown }[]
		}) => {
			if (request.ns === "agent-default-model") {
				current = previous
				mutations.push("default:restore")
				return
			}
			route = undefined
			mutations.push("route:unset")
		},
	} as never
	const { deps, cloudKey, pending } = dependencies(identity, new MemoryVault("ck_test"))
	const service = new AccountService(dsh, client, deps)

	await service.signOut()
	assert.deepEqual(current, previous)
	assert.deepEqual(mutations, ["default:restore", "route:unset", "credential:unset"])
	assert.equal(identity.value, undefined)
	assert.equal(cloudKey.value, undefined)
	assert.equal(pending.value, undefined)
	assert.deepEqual(revoked, ["identity-refresh"])
	assert.equal((await service.snapshot()).phase, "signed-out")
})

test("a temporary refresh failure keeps the encrypted identity for retry", async () => {
	const identity = new MemoryVault(validIdentity({ accessExpiresAt: Date.now() - 1 }))
	const { client } = agency({
		refresh: async () => {
			throw new AgencyHttpError("could not refresh Cocode session", 503)
		},
	})
	const dsh = {
		currentDefault: async () => ({ provider: "deepseek-official", model: "deepseek-v4-flash" }),
		describeSettings: async () => ({ writable: true, namespaces: [] as SettingsNamespace[] }),
		describeCredentials: async () => ({}),
		providers: async (): Promise<ProviderView[]> => [],
		models: async (): Promise<ModelGroup[]> => [],
		mutateSettings: async (): Promise<void> => undefined,
		setCredential: async (): Promise<void> => undefined,
		unsetCredential: async (): Promise<void> => undefined,
	} as never
	const { deps } = dependencies(identity)
	const service = new AccountService(dsh, client, deps)

	await service.hydrate()
	assert.notEqual(identity.value, undefined)
	assert.equal((await service.snapshot()).phase, "error")
})

test("an invalid identity session is cleared after Agency rejects it", async () => {
	const identity = new MemoryVault(validIdentity())
	const { client } = agency({
		profile: async () => {
			throw new AgencyHttpError("could not load account", 401)
		},
	})
	const dsh = {
		currentDefault: async () => ({ provider: "deepseek-official", model: "deepseek-v4-flash" }),
		describeSettings: async () => ({ writable: true, namespaces: [] as SettingsNamespace[] }),
		describeCredentials: async () => ({}),
		providers: async (): Promise<ProviderView[]> => [],
		models: async (): Promise<ModelGroup[]> => [],
		mutateSettings: async (): Promise<void> => undefined,
		setCredential: async (): Promise<void> => undefined,
		unsetCredential: async (): Promise<void> => undefined,
	} as never
	const { deps } = dependencies(identity)
	const service = new AccountService(dsh, client, deps)
	await service.hydrate()
	assert.equal(identity.value, undefined)
	assert.equal((await service.snapshot()).phase, "signed-out")
})

test("sign out does not send an identity token to a changed Agency origin", async () => {
	const identity = new MemoryVault(validIdentity({ origin: "https://old.cocode.agency" }))
	const { client, revoked } = agency()
	const dsh = {
		currentDefault: async () => ({ provider: "deepseek-official", model: "deepseek-v4-flash" }),
		describeSettings: async () => ({ writable: true, namespaces: [] as SettingsNamespace[] }),
		describeCredentials: async () => ({}),
		providers: async (): Promise<ProviderView[]> => [],
		models: async (): Promise<ModelGroup[]> => [],
		mutateSettings: async (): Promise<void> => undefined,
		setCredential: async (): Promise<void> => undefined,
		unsetCredential: async (): Promise<void> => undefined,
	} as never
	const { deps } = dependencies(identity)
	await new AccountService(dsh, client, deps).signOut()
	assert.deepEqual(revoked, [])
	assert.equal(identity.value, undefined)
})

test("DSH unavailability clears local secrets and leaves a non-secret cleanup marker", async () => {
	const identity = new MemoryVault(
		validIdentity({
			preLoginDefault: { provider: "deepseek-official", model: "deepseek-v4-flash" },
			managedRoute: {
				baseURL: "https://cocode.agency/v1",
				apiKeyEnv: "COCODE_CLOUD_API_KEY",
			},
		}),
	)
	const { client } = agency()
	const dsh = {
		currentDefault: async () => {
			throw new DshCloudConfigUnavailableError()
		},
		describeSettings: async () => {
			throw new DshCloudConfigUnavailableError()
		},
		describeCredentials: async () => ({}),
		providers: async (): Promise<ProviderView[]> => [],
		models: async (): Promise<ModelGroup[]> => [],
		mutateSettings: async (): Promise<void> => undefined,
		setCredential: async (): Promise<void> => undefined,
		unsetCredential: async (): Promise<void> => undefined,
	} as never
	const { deps, cloudKey, pending } = dependencies(identity, new MemoryVault("ck_test"))
	const service = new AccountService(dsh, client, deps)

	await service.signOut()
	assert.equal(identity.value, undefined)
	assert.equal(cloudKey.value, undefined)
	assert.equal(pending.value?.pending, true)
	assert.deepEqual(pending.value?.managedRoute, {
		baseURL: "https://cocode.agency/v1",
		apiKeyEnv: "COCODE_CLOUD_API_KEY",
	})
	const snapshot = await service.snapshot()
	assert.equal(snapshot.phase, "error")
	assert.equal(snapshot.error?.code, "cleanup-pending")
})

test("renderer-visible account errors redact cloud keys and bearer tokens", async () => {
	const identity = new MemoryVault(validIdentity())
	const { client } = agency()
	const dsh = {
		currentDefault: async () => ({ provider: "deepseek-official", model: "deepseek-v4-flash" }),
		describeSettings: async () => ({
			writable: true,
			namespaces: [{ ns: "llm-pi-ai", revision: 1, value: { providers: {} } }],
		}),
		describeCredentials: async () => ({
			COCODE_CLOUD_API_KEY: { configured: false, writable: true },
		}),
		providers: async (): Promise<ProviderView[]> => [],
		models: async (): Promise<ModelGroup[]> => [],
		mutateSettings: async (): Promise<void> => undefined,
		setCredential: async () => {
			throw new Error("failed ck_secret Bearer eyJheader.payload.signature")
		},
		unsetCredential: async (): Promise<void> => undefined,
	} as never
	const { deps } = dependencies(identity)
	const service = new AccountService(dsh, client, deps)

	const snapshot = await service.signIn()
	assert.equal(snapshot.phase, "error")
	assert.doesNotMatch(snapshot.error?.message ?? "", /ck_secret|eyJheader|payload|signature/)
	assert.match(snapshot.error?.message ?? "", /\[redacted\]/)
})
