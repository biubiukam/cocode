import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const css = readFileSync(
	resolve(process.cwd(), "packages/client/ui-sidebar/src/client/SidebarRoot.module.css"),
	"utf8",
)

test("slot errors do not hide the Settings fallback trigger", () => {
	assert.match(css, /\.footArea:has\(\.footerActions > :not\(\[data-slot-error\]\)\) \.settingsArea/)
	assert.doesNotMatch(css, /\.footArea:has\(\.footerActions > \*\) \.settingsArea/)
})
