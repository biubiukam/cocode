import assert from "node:assert/strict"
import test from "node:test"
import {
	APPLICATION_UPDATE_MENU_ITEM_ID,
	createApplicationUpdateMenuItem,
	getApplicationUpdateMenuPresentation,
	type ApplicationMenuUpdateState,
} from "../../../src/main/shell/menu/application-menu-model"

test("creates an enabled check-for-updates menu item with a stable id", () => {
	let checks = 0
	const item = createApplicationUpdateMenuItem({
		enabled: true,
		checkNow: () => {
			checks += 1
		},
	})

	assert.equal(item.id, APPLICATION_UPDATE_MENU_ITEM_ID)
	assert.equal(item.label, "检查更新")
	assert.equal(item.enabled, true)
	item.click?.()
	assert.equal(checks, 1)
})

test("maps update states to native menu labels and enabled values", () => {
	const expected: Array<[ApplicationMenuUpdateState, string, boolean]> = [
		["idle", "检查更新", true],
		["checking", "检查中…", false],
		["downloading", "更新中…", false],
	]

	for (const [state, label, enabled] of expected) {
		assert.deepEqual(getApplicationUpdateMenuPresentation(state, true), { label, enabled })
	}
	assert.deepEqual(getApplicationUpdateMenuPresentation("idle", false), {
		label: "检查更新",
		enabled: false,
	})
})
