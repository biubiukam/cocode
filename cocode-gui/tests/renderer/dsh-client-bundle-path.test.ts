import assert from "node:assert/strict"
import test from "node:test"
import { parseDshClientBundleRequest } from "../../vite.renderer.config"

test("parses nested Cocode client bundle paths", () => {
	assert.deepEqual(parseDshClientBundleRequest("/dsh-client/cocode/cocode-sidebar/client.js"), {
		directory: "cocode/cocode-sidebar",
		sourceMap: false,
	})
	assert.deepEqual(parseDshClientBundleRequest("/dsh-client/cocode/cocode-account/client.js"), {
		directory: "cocode/cocode-account",
		sourceMap: false,
	})
})

test("preserves source-map requests for nested client bundles", () => {
	assert.deepEqual(
		parseDshClientBundleRequest("/dsh-client/cocode/cocode-sidebar/client.js.map"),
		{
			directory: "cocode/cocode-sidebar",
			sourceMap: true,
		},
	)
})
