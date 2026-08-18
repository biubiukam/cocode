import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "pathe"
import test from "node:test"

const css = readFileSync(
	resolve(process.cwd(), "packages/client/ui-sidebar/src/client/SidebarRoot.module.css"),
	"utf8",
)

test("Settings remains an independent footer trigger", () => {
	assert.doesNotMatch(css, /\.settingsArea \[data-dsh-settings-trigger\]\s*\{\s*display: none;/)
	assert.doesNotMatch(css, /\.footArea:has\([^)]*\) \.settingsArea/)
})
