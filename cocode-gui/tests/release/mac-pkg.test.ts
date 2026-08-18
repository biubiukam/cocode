import assert from "node:assert/strict"
import test from "node:test"
import { macCliWrapper } from "../../scripts/release/build-mac-pkg.mjs"
import { posixShim } from "../../src/main/contexts/tui/infrastructure/desktop-cli-registration"

test("macOS PKG wrapper matches the runtime-generated POSIX shim", () => {
	const executable = "/Applications/Cocode.app/Contents/Resources/cocode-node"
	const entry = "/Applications/Cocode.app/Contents/Resources/tui/cocode-cli.mjs"
	const supervisorEntry =
		"/Applications/Cocode.app/Contents/Resources/dsh-runtime/packages/host-supervisor/lib/bin.js"
	const invocation = {
		executable,
		args: [entry],
		env: {
			COCODE_NODE_EXECUTABLE: executable,
			COCODE_SUPERVISOR_SERVICE_ENTRY: supervisorEntry,
			COCODE_TUI_CLIENT_KIND: "desktop-tui",
			DSH_PROFILE: "cocode",
			COCODE_HOST_CONFIG_FINGERPRINT: "cocode-web-jsonrpc-v3",
			COCODE_RUNTIME_CHANNEL: "stable",
		},
		cwd: "/Applications/Cocode.app",
	}
	assert.equal(macCliWrapper({}), posixShim(invocation, "installer"))
})
