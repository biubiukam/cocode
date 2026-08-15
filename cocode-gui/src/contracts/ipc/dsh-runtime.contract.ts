export const dshRuntimeChannels = {
	bootstrap: "dsh-runtime:bootstrap",
	request: "dsh-runtime:request",
	cancelRequest: "dsh-runtime:cancel-request",
} as const

/** Theme preference transferred with the early bootstrap handshake. */
export type DshThemePreference = "light" | "dark" | "system"

export type DshRuntimeRequestMethod = "GET" | "HEAD" | "POST"

export interface DshRuntimeRequestDto {
	readonly requestId: string
	readonly path: string
	readonly method: DshRuntimeRequestMethod
	readonly headers: readonly (readonly [string, string])[]
	readonly body?: Uint8Array
}

export interface DshRuntimeResponseDto {
	readonly status: number
	readonly statusText: string
	readonly headers: readonly (readonly [string, string])[]
	readonly body: Uint8Array
}

export interface DshBootEntryDto {
	readonly id: string
	readonly url: string
	readonly rev: string
	readonly inject?: readonly string[]
	readonly immediately?: boolean
}

export interface DshBootManifestDto {
	readonly rev: string
	readonly entries: readonly DshBootEntryDto[]
}

export interface DshRuntimeBootstrapDto {
	readonly origin: string
	readonly boot: DshBootManifestDto
	/** Host-backed preference used before the Renderer client graph mounts. */
	readonly themePreference: DshThemePreference
}

export interface DshRuntimeApi {
	getBootstrap(): Promise<DshRuntimeBootstrapDto>
	request(request: DshRuntimeRequestDto): Promise<DshRuntimeResponseDto>
	cancelRequest(requestId: string): void
}
