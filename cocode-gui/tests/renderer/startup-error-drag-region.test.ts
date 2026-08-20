import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import * as path from "pathe"
import test from "node:test"

const styles = readFileSync(path.resolve("src/renderer/styles/index.css"), "utf8")

test("keeps the startup error background draggable while content stays selectable", () => {
	assert.match(styles, /\.dsh-desktop-startup-error\s*\{[^}]*-webkit-app-region:\s*drag;/s)
	assert.match(
		styles,
		/\.dsh-desktop-startup-error\s*>\s*\*\s*\{[^}]*-webkit-app-region:\s*no-drag;/s,
	)
	assert.match(
		styles,
		/\.dsh-desktop-startup-error\s+h1,\s*\.dsh-desktop-startup-error\s+p\s*\{[^}]*user-select:\s*text;/s,
	)
})
