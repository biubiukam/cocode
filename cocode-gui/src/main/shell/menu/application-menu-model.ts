import type { ApplicationUpdateState } from "../updater/application-update-coordinator"

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
}

export function createApplicationUpdateMenuItem({
	enabled,
	checkNow,
}: ApplicationUpdateMenuOptions): ApplicationUpdateMenuItem {
	const presentation = getApplicationUpdateMenuPresentation("idle", enabled)
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
): { label: string; enabled: boolean } {
	if (!updateEnabled) return { label: "检查更新", enabled: false }
	if (state === "checking") return { label: "检查中…", enabled: false }
	if (state === "downloading") return { label: "更新中…", enabled: false }
	return { label: "检查更新", enabled: true }
}
