import assert from "node:assert/strict"
import test from "node:test"
import { packagedNodeExecutableName } from "../../src/shared/packaged-node-executable"

test("uses a Windows executable suffix only for Windows bundles", () => {
	assert.equal(packagedNodeExecutableName("win32"), "cocode-node.exe")
	assert.equal(packagedNodeExecutableName("darwin"), "cocode-node")
	assert.equal(packagedNodeExecutableName("linux"), "cocode-node")
})
