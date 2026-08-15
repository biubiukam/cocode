import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
	extractDshBootManifest,
	extractDshThemePreference,
} from "../../../src/main/contexts/dsh-runtime/infrastructure/dsh-runtime-bootstrap"

describe("extractDshBootManifest", () => {
	it("parses the host-injected manifest with nested entry data", () => {
		const manifest = extractDshBootManifest(
			`<script>window.__DSH_BOOT__ = ${JSON.stringify({
				rev: "local",
				entries: [
					{
						id: "@deepseek-ai/dsh-client-runtime",
						url: "/plugins/runtime/client.js",
						rev: "abc",
						inject: ["connection"],
						immediately: true,
					},
				],
			})}</script>`,
		)

		assert.deepEqual(manifest.entries[0], {
			id: "@deepseek-ai/dsh-client-runtime",
			url: "/plugins/runtime/client.js",
			rev: "abc",
			inject: ["connection"],
			immediately: true,
		})
	})

	it("rejects a page without the boot script", () => {
		assert.throws(
			() => extractDshBootManifest("<html><body>missing</body></html>"),
			/ did not contain window\.__DSH_BOOT__\./,
		)
	})

	it("rejects malformed JSON before it reaches the manifest schema", () => {
		assert.throws(
			() => extractDshBootManifest("<script>window.__DSH_BOOT__ = {broken}</script>"),
			/boot manifest is not valid JSON/,
		)
	})
})

describe("extractDshThemePreference", () => {
	it("reads the host preference marker used for the no-flash local boot", () => {
		assert.equal(
			extractDshThemePreference(
				'<head><meta name="dsh-theme-preference" content="dark"></head>',
			),
			"dark",
		)
	})

	it("accepts the marker attributes in either order", () => {
		assert.equal(
			extractDshThemePreference(
				'<head><meta content="light" data-source="host" name="dsh-theme-preference"></head>',
			),
			"light",
		)
	})

	it("falls back to system for older sidecar pages", () => {
		assert.equal(extractDshThemePreference("<html></html>"), "system")
	})
})
