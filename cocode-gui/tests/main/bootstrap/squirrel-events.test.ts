import assert from "node:assert/strict"
import test from "node:test"
import { detectSquirrelEvent } from "../../../src/main/bootstrap/squirrel-events"

test("detects Squirrel install lifecycle arguments", () => {
	assert.equal(detectSquirrelEvent(["C:\\Cocode.exe", "--squirrel-install"]), "install")
	assert.equal(detectSquirrelEvent(["C:\\Cocode.exe", "--squirrel-updated"]), "updated")
	assert.equal(detectSquirrelEvent(["C:\\Cocode.exe", "--squirrel-firstrun"]), "firstrun")
	assert.equal(detectSquirrelEvent(["C:\\Cocode.exe", "--squirrel-uninstall"]), "uninstall")
	assert.equal(detectSquirrelEvent(["C:\\Cocode.exe", "--squirrel-obsolete"]), "obsolete")
	assert.equal(detectSquirrelEvent(["C:\\Cocode.exe"]), undefined)
})
