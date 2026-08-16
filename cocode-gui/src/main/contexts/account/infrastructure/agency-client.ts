import { deviceKeyName } from "./device-name"

type AgencyResponse<T> = { readonly status: number; readonly value: T }

export class AgencyHttpError extends Error {
	readonly status: number

	constructor(message: string, status: number) {
		super(message)
		this.name = "AgencyHttpError"
		this.status = status
	}
}

function problemDetail(value: unknown): string | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined
	const record = value as Record<string, unknown>
	for (const key of ["detail", "title", "code", "message", "error"]) {
		const candidate = record[key]
		if (typeof candidate !== "string" || candidate.trim() === "") continue
		return candidate
			.trim()
			.replace(/ck_[A-Za-z0-9_-]+/g, "[redacted]")
			.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
			.slice(0, 200)
	}
	return undefined
}

export type TokenPair = {
	readonly access_token: string
	readonly refresh_token: string
	readonly expires_in: number
}

type AgencyProfile = {
	readonly user?: {
		readonly display_name?: string
		readonly email?: string
		readonly avatar_url?: string
	}
}

export type AgencyModel = { readonly id: string; readonly name: string }
export type CreatedApiKey = { readonly secret: string; readonly id: string; readonly name: string }
export type AgencyAccountUsage = {
	readonly plan: string
	readonly fiveHour: number
	readonly week: number
	readonly month: number
	readonly syncedAt: string
}

type AgencyModelCredit = {
	readonly plan?: string
	readonly granted_microusd?: number
	readonly settled_microusd?: number
	readonly reserved_microusd?: number
}

type AgencyModelUsage = {
	readonly fresh_at?: string
	readonly totals?: { readonly billable_microusd?: number }
}

const DEFAULT_ORIGIN = "https://cocode.agency"

export type AgencyClientOptions = {
	/** Permit COCODE_AGENCY_ORIGIN and local HTTP for development/test clients. */
	readonly allowOriginOverride?: boolean
	readonly allowLocalHttp?: boolean
}

function isAllowedAgencyProtocol(url: URL): boolean {
	if (url.protocol === "https:") return true
	return (
		url.protocol === "http:" &&
		(url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "[::1]")
	)
}

export function agencyOrigin(options: AgencyClientOptions = {}): string {
	const configured = process.env.COCODE_AGENCY_ORIGIN
	if (options.allowOriginOverride !== false && configured !== undefined && configured !== "")
		return normalizeOrigin(configured, options.allowLocalHttp !== false)
	return DEFAULT_ORIGIN
}

function normalizeOrigin(value: string, allowLocalHttp = true): string {
	let parsed: URL
	try {
		parsed = new URL(value)
	} catch {
		throw new Error("COCODE_AGENCY_ORIGIN must be a valid URL")
	}
	if (
		parsed.username !== "" ||
		parsed.password !== "" ||
		parsed.search !== "" ||
		parsed.hash !== ""
	) {
		throw new Error(
			"COCODE_AGENCY_ORIGIN must be an origin without credentials or query parameters",
		)
	}
	if (!isAllowedAgencyProtocol(parsed) || (!allowLocalHttp && parsed.protocol !== "https:")) {
		throw new Error("COCODE_AGENCY_ORIGIN must use HTTPS outside local development")
	}
	return parsed.origin
}

export class AgencyClient {
	private readonly origin: string

	constructor(origin?: string, options: AgencyClientOptions = {}) {
		this.origin = normalizeOrigin(
			origin ?? agencyOrigin(options),
			options.allowLocalHttp !== false,
		)
	}

	getOrigin(): string {
		return this.origin
	}

	async startAuthorization(input: {
		readonly redirectUri: string
		readonly state: string
		readonly codeChallenge: string
	}): Promise<string> {
		const response = await this.request<{ authorization_url?: string }>(
			"/v1/auth/native/authorizations",
			{
				method: "POST",
				body: {
					client_id: "cocode-desktop",
					device_label: deviceKeyName(),
					redirect_uri: input.redirectUri,
					state: input.state,
					code_challenge: input.codeChallenge,
					code_challenge_method: "S256",
					scopes: [
						"profile:read",
						"organizations:read",
						"account:read",
						"models:read",
						"inference:write",
					],
				},
			},
		)
		if (response.status !== 201 || typeof response.value.authorization_url !== "string") {
			throw new Error("could not start Cocode login")
		}
		let authorizationUrl: URL
		try {
			authorizationUrl = new URL(response.value.authorization_url)
		} catch {
			throw new Error("Cocode returned an invalid authorization URL")
		}
		if (!isAllowedAgencyProtocol(authorizationUrl)) {
			throw new Error("Cocode returned an unsafe authorization URL")
		}
		if (authorizationUrl.origin !== this.origin)
			throw new Error("Cocode returned an unexpected authorization origin")
		return authorizationUrl.href
	}

	async exchangeCode(input: {
		readonly code: string
		readonly redirectUri: string
		readonly verifier: string
	}): Promise<TokenPair> {
		const response = await this.request<TokenPair>("/v1/auth/native/token", {
			method: "POST",
			body: {
				grant_type: "authorization_code",
				client_id: "cocode-desktop",
				code: input.code,
				redirect_uri: input.redirectUri,
				code_verifier: input.verifier,
			},
		})
		if (
			response.status !== 200 ||
			typeof response.value.access_token !== "string" ||
			typeof response.value.refresh_token !== "string" ||
			typeof response.value.expires_in !== "number" ||
			!Number.isFinite(response.value.expires_in)
		) {
			throw new Error("could not exchange login code")
		}
		return response.value
	}

	async refresh(refreshToken: string): Promise<TokenPair> {
		const response = await this.request<TokenPair>("/v1/auth/token/refresh", {
			method: "POST",
			body: { refresh_token: refreshToken },
		})
		if (response.status === 401 || response.status === 403)
			throw new AgencyHttpError("session expired", response.status)
		if (
			response.status !== 200 ||
			typeof response.value.access_token !== "string" ||
			typeof response.value.expires_in !== "number" ||
			!Number.isFinite(response.value.expires_in)
		)
			throw new AgencyHttpError("could not refresh Cocode session", response.status)
		return response.value
	}

	async profile(
		accessToken: string,
	): Promise<{ displayName: string; email?: string; avatarUrl?: string }> {
		const response = await this.request<AgencyProfile>("/v1/me", {
			method: "GET",
			token: accessToken,
		})
		if (response.status !== 200)
			throw new AgencyHttpError("could not load account", response.status)
		const displayName = response.value.user?.display_name?.trim() ?? ""
		const email = response.value.user?.email
		return {
			displayName: displayName === "" ? email ?? "Cocode" : displayName,
			...(email === undefined ? {} : { email }),
			...(response.value.user?.avatar_url === undefined
				? {}
				: { avatarUrl: response.value.user.avatar_url }),
		}
	}

	async createDesktopKey(accessToken: string): Promise<CreatedApiKey> {
		const name = deviceKeyName()
		const response = await this.request<{ secret?: string; id?: string }>("/v1/me/api-keys", {
			method: "POST",
			token: accessToken,
			body: { name, scopes: ["models:read", "inference:write"] },
		})
		const secret = response.value.secret?.trim()
		const id = response.value.id?.trim()
		if (
			(response.status !== 201 && response.status !== 200) ||
			typeof secret !== "string" ||
			typeof id !== "string" ||
			id === "" ||
			!/^ck_[A-Za-z0-9_-]+$/.test(secret)
		) {
			const detail = problemDetail(response.value)
			throw new AgencyHttpError(
				`could not create a device API key (HTTP ${String(response.status)})${
					detail === undefined ? "" : `: ${detail}`
				}`,
				response.status,
			)
		}
		return { secret, id, name }
	}

	async models(apiKey: string): Promise<AgencyModel[]> {
		if (!/^ck_[A-Za-z0-9_-]+$/.test(apiKey)) throw new Error("invalid Cocode Nut API key")
		const response = await this.request<{ data?: { id?: string; name?: string }[] }>(
			"/v1/me/models",
			{ method: "GET", token: apiKey },
		)
		if (response.status !== 200)
			throw new AgencyHttpError("could not list hosted models", response.status)
		const models = (response.value.data ?? [])
			.filter(
				(row): row is { id: string; name?: string } =>
					typeof row.id === "string" && row.id !== "",
			)
			.map((row) => ({ id: row.id, name: row.name?.trim() || row.id }))
		return [...new Map(models.map((model) => [model.id, model])).values()]
	}

	async accountUsage(accessToken: string): Promise<AgencyAccountUsage> {
		const now = new Date()
		const to = now.toISOString()
		const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString()
		const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
		const [credit, fiveHourUsage, weekUsage] = await Promise.all([
			this.request<AgencyModelCredit>("/v1/me/model-credit", {
				method: "GET",
				token: accessToken,
			}),
			this.request<AgencyModelUsage>(
				`/v1/me/model-usage?from=${encodeURIComponent(
					fiveHoursAgo,
				)}&to=${encodeURIComponent(to)}`,
				{ method: "GET", token: accessToken },
			),
			this.request<AgencyModelUsage>(
				`/v1/me/model-usage?from=${encodeURIComponent(weekAgo)}&to=${encodeURIComponent(
					to,
				)}`,
				{ method: "GET", token: accessToken },
			),
		])
		if (credit.status !== 200 || fiveHourUsage.status !== 200 || weekUsage.status !== 200)
			throw new AgencyHttpError(
				"could not load account usage",
				Math.max(credit.status, fiveHourUsage.status, weekUsage.status),
			)
		const granted = finiteNumber(credit.value.granted_microusd)
		const settled = finiteNumber(credit.value.settled_microusd)
		const reserved = finiteNumber(credit.value.reserved_microusd)
		return {
			plan: credit.value.plan?.trim() || "unknown",
			fiveHour: usagePercent(
				finiteNumber(fiveHourUsage.value.totals?.billable_microusd),
				granted / 5,
			),
			week: usagePercent(
				finiteNumber(weekUsage.value.totals?.billable_microusd),
				granted / 2,
			),
			month: usagePercent(settled + reserved, granted),
			syncedAt: latestTimestamp(fiveHourUsage.value.fresh_at, weekUsage.value.fresh_at) ?? to,
		}
	}

	async revoke(refreshToken: string): Promise<void> {
		try {
			await this.request("/v1/auth/token/revoke", {
				method: "POST",
				body: { refresh_token: refreshToken },
			})
		} catch {
			// Local logout remains authoritative.
		}
	}

	private async request<T>(
		path: string,
		init: { method: string; body?: unknown; token?: string },
	): Promise<AgencyResponse<T>> {
		const headers: Record<string, string> = { accept: "application/json" }
		if (init.body !== undefined) headers["content-type"] = "application/json"
		if (init.token !== undefined) headers.authorization = `Bearer ${init.token}`
		let response: Response
		try {
			response = await fetch(`${this.origin}${path}`, {
				method: init.method,
				headers,
				body: init.body === undefined ? undefined : JSON.stringify(init.body),
			})
		} catch {
			throw new Error("Cocode Agency is unavailable")
		}
		const text = await response.text()
		let value: T
		try {
			value = text === "" ? ({} as T) : (JSON.parse(text) as T)
		} catch {
			throw new AgencyHttpError(
				`agency answered HTTP ${String(response.status)}`,
				response.status,
			)
		}
		return { status: response.status, value }
	}
}

function finiteNumber(value: number | undefined): number {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0
}

function usagePercent(used: number, limit: number): number {
	if (limit <= 0) return 0
	return Math.max(0, Math.min(100, Math.round((used / limit) * 100)))
}

function latestTimestamp(...values: (string | undefined)[]): string | undefined {
	return values
		.filter(
			(value): value is string =>
				typeof value === "string" && !Number.isNaN(Date.parse(value)),
		)
		.sort((left, right) => Date.parse(right) - Date.parse(left))[0]
}
