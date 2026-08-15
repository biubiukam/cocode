import assert from "node:assert/strict"
import test from "node:test"
import {
	COCODE_SIDEBAR_PACKAGE,
	createDshDesktopPatch,
} from "../../../src/main/contexts/dsh-runtime/infrastructure/dsh-desktop-patch"

test("mounts Cocode plugins only through the Electron overlay", () => {
	const patch = createDshDesktopPatch("file:///app/dsh-noop-hmr.mjs")

	assert.equal(COCODE_SIDEBAR_PACKAGE, "cocode-sidebar")
	assert.match(patch, /id: dsh-desktop-hmr/)
	assert.match(patch, /name: "file:\/\/\/app\/dsh-noop-hmr\.mjs"/)
	assert.match(patch, /id: cocode-sidebar/)
	assert.match(patch, /name: "cocode-sidebar"/)
	assert.doesNotMatch(patch, /profiles\/web|cordis\.patch\.yml/)
})
