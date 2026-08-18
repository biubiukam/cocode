export const localeChannels = {
	set: "locale:set",
} as const

export type LocaleId = "zh" | "en"

export interface LocaleApi {
	readonly set: (locale: LocaleId) => void
}
