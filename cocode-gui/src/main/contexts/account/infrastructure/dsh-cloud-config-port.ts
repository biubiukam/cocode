import { randomUUID } from "node:crypto"
import type { DshRuntimeProcess } from "../../dsh-runtime/infrastructure/dsh-runtime-process"

type RpcResult<T> =
	| { readonly ok: true; readonly value: T }
	| { readonly ok: false; readonly error: { readonly code: string; readonly message: string } }

type RpcEnvelope<T> = {
	readonly type: "server-response"
	readonly rpcId: string
	readonly result: RpcResult<T>
}

export type SettingsNamespace = {
	readonly ns: string
	readonly value: unknown
	readonly revision: number
}

export type ProviderView = {
	readonly provider: string
	readonly displayName: string
	readonly settingsNs: string
	readonly settingsPath: string[]
	readonly active: boolean
}

export type ModelGroup = {
	readonly id: string
	readonly name: string
	readonly models: readonly { readonly id: string; readonly name: string }[]
}

export type DefaultSelection = {
	readonly provider: string
	readonly model: string
	readonly reasoningEffort?: string
}

export class DshCloudConfigUnavailableError extends Error {
	constructor(message = "DSH configuration service is unavailable") {
		super(message)
		this.name = "DshCloudConfigUnavailableError"
	}
}

export class DshCloudConfigPort {
	constructor(private readonly runtime: DshRuntimeProcess) {}

	async describeSettings(): Promise<{
		readonly writable: boolean
		readonly namespaces: SettingsNamespace[]
	}> {
		const result = await this.call<{ writable?: boolean; namespaces?: SettingsNamespace[] }>(
			"settings.describe",
			{},
		)
		return {
			writable: result.writable === true,
			namespaces: Array.isArray(result.namespaces) ? result.namespaces : [],
		}
	}

	async describeCredentials(
		refs: readonly string[],
	): Promise<Record<string, { configured: boolean; writable: boolean }>> {
		const result = await this.call<{
			credentials?: Record<string, { configured?: boolean; writable?: boolean }>
		}>("credentials.describe", { refs: [...refs] })
		const output: Record<string, { configured: boolean; writable: boolean }> = {}
		for (const ref of refs) {
			const value = result.credentials?.[ref]
			output[ref] = {
				configured: value?.configured === true,
				writable: value?.writable !== false,
			}
		}
		return output
	}

	async providers(): Promise<ProviderView[]> {
		const result = await this.call<{ providers?: ProviderView[] }>("llm.providers", {})
		return Array.isArray(result.providers) ? result.providers : []
	}

	async models(): Promise<ModelGroup[]> {
		const result = await this.call<{ groups?: ModelGroup[] }>("llm.models", {})
		return Array.isArray(result.groups) ? result.groups : []
	}

	async currentDefault(): Promise<DefaultSelection> {
		const result = await this.call<{ provider?: string; model?: string }>("host.describe", {})
		const fallback =
			typeof result.provider === "string" && typeof result.model === "string"
				? { provider: result.provider, model: result.model }
				: undefined
		let settings: { readonly namespaces: SettingsNamespace[] }
		try {
			settings = await this.describeSettings()
		} catch {
			if (fallback !== undefined) return fallback
			throw new Error("default model selection is unavailable")
		}
		const namespace = settings.namespaces.find((item) => item.ns === "agent-default-model")
		const value = namespace?.value
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			if (fallback !== undefined) return fallback
			throw new Error("default model selection is unavailable")
		}
		const record = value as Record<string, unknown>
		const provider = typeof record.provider === "string" ? record.provider : fallback?.provider
		const model = typeof record.model === "string" ? record.model : fallback?.model
		if (provider === undefined || model === undefined)
			throw new Error("default model selection is unavailable")
		return {
			provider,
			model,
			...(typeof record.reasoningEffort === "string"
				? { reasoningEffort: record.reasoningEffort }
				: {}),
		}
	}

	async mutateSettings(request: {
		readonly ns: string
		readonly expectedRevision?: number
		readonly ops: readonly {
			readonly op: "set" | "unset"
			readonly path: readonly string[]
			readonly value?: unknown
		}[]
	}): Promise<void> {
		await this.call("settings.mutate", request)
	}

	async setCredential(ref: string, value: string): Promise<void> {
		await this.call("credentials.set", { ref, value })
	}

	async unsetCredential(ref: string): Promise<void> {
		await this.call("credentials.unset", { ref })
	}

	private async call<T>(method: string, payload: unknown): Promise<T> {
		const rpcId = randomUUID()
		let response: Awaited<ReturnType<DshRuntimeProcess["request"]>>
		try {
			response = await this.runtime.request(
				{
					requestId: randomUUID(),
					path: `/api/${method}`,
					method: "POST",
					headers: [
						["content-type", "application/json"],
						["accept", "application/json"],
					],
					body: new TextEncoder().encode(
						JSON.stringify({ type: "client-request", rpcId, method, payload }),
					),
				},
				new AbortController().signal,
			)
		} catch {
			throw new DshCloudConfigUnavailableError()
		}
		if (response.status < 200 || response.status >= 300) {
			throw new Error(`DSH request ${method} failed with HTTP ${String(response.status)}`)
		}
		let envelope: RpcEnvelope<T>
		try {
			envelope = JSON.parse(new TextDecoder().decode(response.body)) as RpcEnvelope<T>
		} catch {
			throw new Error(`DSH request ${method} returned invalid JSON`)
		}
		if (envelope.type !== "server-response" || envelope.result === undefined) {
			throw new Error(`DSH request ${method} returned an invalid response envelope`)
		}
		if (envelope.rpcId !== rpcId)
			throw new Error(`DSH request ${method} returned a mismatched rpcId`)
		const result = envelope.result
		if ("value" in result) return result.value
		throw new Error(`${result.error.code}: ${result.error.message}`)
	}
}
