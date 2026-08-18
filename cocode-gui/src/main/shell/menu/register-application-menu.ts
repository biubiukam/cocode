import { app, Menu, type MenuItem, type MenuItemConstructorOptions } from "electron"
import type { ApplicationUpdateState } from "../updater/application-update-coordinator"
import type { ApplicationUpdateRegistration } from "../updater/register-application-updates"
import {
	APPLICATION_UPDATE_MENU_ITEM_ID,
	createApplicationUpdateMenuItem,
	getApplicationUpdateMenuPresentation,
} from "./application-menu-model"
import type { ApplicationLocale } from "../../shared/locale/application-locale"

export interface ApplicationMenuRegistration {
	readonly dispose: () => void
}

export function registerApplicationMenu(
	updates: ApplicationUpdateRegistration,
	locale?: ApplicationLocale,
): ApplicationMenuRegistration {
	const previousMenu = Menu.getApplicationMenu()
	const updateItemModel = createApplicationUpdateMenuItem({ ...updates, locale: locale?.get() })
	const template: MenuItemConstructorOptions[] = [
		{
			label: app.getName(),
			submenu: [
				{
					id: updateItemModel.id,
					label: updateItemModel.label,
					enabled: updateItemModel.enabled,
					click: () => {
						updateItemModel.click()
					},
				},
				{ type: "separator" },
				{ role: "quit" },
			],
		},
		{ role: "editMenu" },
		{ role: "viewMenu" },
		{ role: "windowMenu" },
	]
	const menu = Menu.buildFromTemplate(template)
	Menu.setApplicationMenu(menu)
	const updateItem: MenuItem | undefined = menu.getMenuItemById(APPLICATION_UPDATE_MENU_ITEM_ID)
	const unsubscribe = updates.subscribe((state) => {
		if (updateItem === undefined) return
		applyUpdatePresentation(updateItem, state, updates.enabled, locale?.get())
	})
	const unsubscribeLocale =
		locale?.subscribe((id) => {
			if (updateItem === undefined) return
			applyUpdatePresentation(updateItem, "idle", updates.enabled, id)
		}) ?? (() => undefined)

	return {
		dispose: () => {
			unsubscribe()
			unsubscribeLocale()
			Menu.setApplicationMenu(previousMenu)
		},
	}
}

function applyUpdatePresentation(
	item: MenuItem,
	state: ApplicationUpdateState,
	updateEnabled: boolean,
	locale?: import("../../shared/locale/application-locale").ApplicationLocaleId,
): void {
	const presentation = getApplicationUpdateMenuPresentation(state, updateEnabled, locale)
	item.label = presentation.label
	item.enabled = presentation.enabled
}
