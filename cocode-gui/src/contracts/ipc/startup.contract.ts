export const startupChannels = {
	restart: "startup:restart",
	quit: "startup:quit",
} as const

export interface StartupApi {
	readonly restart: () => Promise<boolean>
	readonly quit: () => Promise<boolean>
}
