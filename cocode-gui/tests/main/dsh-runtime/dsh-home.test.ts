import { describe, it } from "node:test"
import assert from "node:assert/strict"
import os from "node:os"
import path from "node:path"
import { resolveDshHome } from "../../../src/main/contexts/dsh-runtime/infrastructure/dsh-home"

describe("resolveDshHome", () => {
	it("uses an explicit configured path first", () => {
		assert.equal(
			resolveDshHome("~/configured-dsh", { DSH_HOME: "~/environment-dsh" }),
			path.join(os.homedir(), "configured-dsh"),
		)
	})

	it("uses a non-blank DSH_HOME environment value", () => {
		assert.equal(
			resolveDshHome(undefined, { DSH_HOME: "~/environment-dsh" }),
			path.join(os.homedir(), "environment-dsh"),
		)
	})

	it("falls back to ~/.dsh when DSH_HOME is absent or blank", () => {
		const expected = path.join(os.homedir(), ".dsh")
		assert.equal(resolveDshHome(undefined, {}), expected)
		assert.equal(resolveDshHome(undefined, { DSH_HOME: "   " }), expected)
	})
})
