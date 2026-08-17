import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs"
import os from "node:os"
import * as path from "pathe"

const args = process.argv.slice(2)
const pkgPath = args[0] === "--" ? args[1] : args[0]
if (!pkgPath) throw new Error("Usage: node scripts/release/verify-mac-pkg.mjs <package.pkg>")
if (process.platform !== "darwin") {
	console.log("macOS PKG verification skipped on non-darwin host.")
	process.exit(0)
}
if (!existsSync(pkgPath)) throw new Error(`PKG does not exist: ${pkgPath}`)

const payload = execFileSync("pkgutil", ["--payload-files", pkgPath], { encoding: "utf8" })
const required = [
	"Applications/Cocode.app/Contents/Resources/cocode-node",
	"Applications/Cocode.app/Contents/Resources/tui/cocode-tui.mjs",
	"Applications/Cocode.app/Contents/Resources/dsh-runtime/packages/host-supervisor/lib/bin.js",
]
for (const file of required) {
	if (!payload.split(/\r?\n/).some((entry) => entry.trim().replace(/^\.\//, "") === file)) {
		throw new Error(`PKG payload is missing: ${file}`)
	}
}

const expanded = mkdtempSync(path.join(os.tmpdir(), "cocode-pkg-verify-"))
try {
	execFileSync("pkgutil", ["--expand-full", pkgPath, expanded])
	const postinstall = findFile(expanded, "postinstall")
	if (!postinstall) throw new Error("PKG CLI component does not contain a postinstall script.")
	const script = readFileSync(postinstall, "utf8")
	const cliInstallPath = process.env.MAC_CLI_INSTALL_PATH?.trim() || "/usr/local/bin/cocode"
	if (!script.includes("cocode-desktop-cli-shim:v1") || !script.includes(cliInstallPath)) {
		throw new Error("PKG CLI postinstall script does not register the expected Desktop CLI.")
	}
} finally {
	rmSync(expanded, { recursive: true, force: true })
}

if (process.env.RELEASE_REQUIRE_SIGNING === "1") {
	execFileSync("pkgutil", ["--check-signature", pkgPath], { stdio: "inherit" })
}

console.log(`macOS PKG payload verified: ${pkgPath}`)

function findFile(root, name) {
	if (!existsSync(root)) return undefined
	if (!statSync(root).isDirectory()) return path.basename(root) === name ? root : undefined
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const found = findFile(path.join(root, entry.name), name)
		if (found) return found
	}
	return undefined
}
