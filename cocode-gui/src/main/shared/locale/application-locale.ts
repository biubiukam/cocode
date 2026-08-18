import { app } from "electron"

export type ApplicationLocaleId = "zh" | "en"

export interface ApplicationLocale {
	readonly get: () => ApplicationLocaleId
	readonly set: (locale: ApplicationLocaleId) => void
	readonly subscribe: (listener: (locale: ApplicationLocaleId) => void) => () => void
}

export function createApplicationLocale(): ApplicationLocale {
	let current = resolveSystemLocale()
	const listeners = new Set<(locale: ApplicationLocaleId) => void>()
	return {
		get: () => current,
		set: (locale) => {
			if (locale === current) return
			current = locale
			for (const listener of listeners) listener(current)
		},
		subscribe: (listener) => {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
	}
}

function resolveSystemLocale(): ApplicationLocaleId {
	const locale = app.getLocale().toLowerCase().split(/[-_]/)[0]
	return locale === "en" ? "en" : "zh"
}
