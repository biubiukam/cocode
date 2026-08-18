import type { ApplicationUpdateState } from "../updater/application-update-coordinator"
import type { ApplicationLocaleId } from "../../shared/locale/application-locale"

export const APPLICATION_UPDATE_MENU_ITEM_ID = "application.check-for-updates"

export type ApplicationMenuUpdateState = ApplicationUpdateState

export interface ApplicationUpdateMenuItem {
	readonly id: string
	label: string
	enabled: boolean
	readonly click: () => void
}

export interface ApplicationUpdateMenuOptions {
	readonly enabled: boolean
	readonly checkNow: () => void
	readonly locale?: ApplicationLocaleId
}

export function createApplicationUpdateMenuItem({
	enabled,
	checkNow,
	locale,
}: ApplicationUpdateMenuOptions): ApplicationUpdateMenuItem {
	const presentation = getApplicationUpdateMenuPresentation("idle", enabled, locale)
	return {
		id: APPLICATION_UPDATE_MENU_ITEM_ID,
		label: presentation.label,
		enabled: presentation.enabled,
		click: checkNow,
	}
}

export function getApplicationUpdateMenuPresentation(
	state: ApplicationMenuUpdateState,
	updateEnabled: boolean,
	locale: ApplicationLocaleId = "zh",
): { label: string; enabled: boolean } {
	const labels =
		locale === "en"
			? { check: "Check for Updates", checking: "Checking…", downloading: "Updating…" }
			: { check: "检查更新", checking: "检查中…", downloading: "更新中…" }
	if (!updateEnabled) return { label: labels.check, enabled: false }
	if (state === "checking") return { label: labels.checking, enabled: false }
	if (state === "downloading") return { label: labels.downloading, enabled: false }
	return { label: labels.check, enabled: true }
}
