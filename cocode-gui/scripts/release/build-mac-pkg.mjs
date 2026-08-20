import { execFileSync } from "node:child_process"
import {
	chmodSync,
	existsSync,
	mkdtempSync,
	mkdirSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs"
import os from "node:os"
import * as path from "pathe"

const DEFAULT_APP_INSTALL_LOCATION = "/Applications"
const DEFAULT_CLI_INSTALL_PATH = "/usr/local/bin/cocode"

export function buildMacPkg({ appPath, outputPath, version, environment = process.env } = {}) {
	if (process.platform !== "darwin") return undefined
	if (!appPath || !existsSync(appPath))
		throw new Error(`macOS App bundle does not exist: ${appPath}`)
	if (!outputPath) throw new Error("A macOS PKG output path is required.")
	if (!version) throw new Error("A macOS PKG version is required.")

	const staging = mkdtempSync(path.join(os.tmpdir(), "cocode-pkg-"))
	const componentDir = path.join(staging, "components")
	const cliScripts = path.join(staging, "cli-scripts")
	const appComponent = path.join(componentDir, "cocode-app.pkg")
	const cliComponent = path.join(componentDir, "cocode-cli.pkg")
	try {
		mkdirSync(componentDir, { recursive: true })
		const cliInstallPath = environment.MAC_CLI_INSTALL_PATH?.trim() || DEFAULT_CLI_INSTALL_PATH
		mkdirSync(cliScripts, { recursive: true })
		const postinstall = path.join(cliScripts, "postinstall")
		writeFileSync(postinstall, macCliPostinstall(environment, cliInstallPath), { mode: 0o755 })
		chmodSync(postinstall, 0o755)

		const installerIdentity = environment.MAC_INSTALLER_SIGNING_IDENTITY?.trim()
		const appIdentifier =
			environment.MAC_INSTALLER_APP_IDENTIFIER?.trim() || "com.cocode.desktop"
		const cliIdentifier =
			environment.MAC_INSTALLER_CLI_IDENTIFIER?.trim() || "com.cocode.desktop.cli"
		const signArgs = installerIdentity ? ["--sign", installerIdentity] : []
		if (environment.RELEASE_REQUIRE_SIGNING === "1" && !installerIdentity) {
			throw new Error(
				"MAC_INSTALLER_SIGNING_IDENTITY (Developer ID Installer) is required for a signed macOS PKG release.",
			)
		}

		run("pkgbuild", [
			"--component",
			appPath,
			"--install-location",
			DEFAULT_APP_INSTALL_LOCATION,
			"--identifier",
			appIdentifier,
			"--version",
			version,
			...signArgs,
			appComponent,
		])
		run("pkgbuild", [
			"--nopayload",
			"--scripts",
			cliScripts,
			"--install-location",
			"/",
			"--identifier",
			cliIdentifier,
			"--version",
			version,
			...signArgs,
			cliComponent,
		])
		mkdirSync(path.dirname(outputPath), { recursive: true })
		const productSignArgs = installerIdentity ? ["--sign", installerIdentity] : []
		run("productbuild", [
			"--package",
			appComponent,
			"--package",
			cliComponent,
			...productSignArgs,
			outputPath,
		])
		return outputPath
	} finally {
		rmSync(staging, { recursive: true, force: true })
	}
}

export function macCliWrapper(environment = process.env) {
	const resources = "/Applications/Cocode.app/Contents/Resources"
	const executable = `${resources}/cocode-node`
	const entry = `${resources}/tui/cocode-cli.mjs`
	const supervisorEntry = `${resources}/dsh-runtime/packages/host-supervisor/lib/bin.js`
	return [
		"#!/bin/sh",
		"# cocode-desktop-cli-shim:v1",
		"# cocode-desktop-cli-source:installer",
		"set -eu",
		'export COCODE_HOME="${COCODE_HOME:-$HOME/.cocode}"',
		'export COCODE_DSH_HOME="${COCODE_DSH_HOME:-$HOME/.dsh}"',
		'export DSH_HOME="$COCODE_DSH_HOME"',
		`export COCODE_NODE_EXECUTABLE=${shellQuote(executable)}`,
		`export COCODE_SUPERVISOR_SERVICE_ENTRY=${shellQuote(supervisorEntry)}`,
		"export COCODE_TUI_CLIENT_KIND='desktop-tui'",
		`export DSH_PROFILE=${shellQuote(environment.DSH_PROFILE?.trim() || "cocode")}`,
		`export COCODE_HOST_CONFIG_FINGERPRINT=${shellQuote(
			environment.COCODE_HOST_CONFIG_FINGERPRINT?.trim() || "cocode-web-jsonrpc-v3",
		)}`,
		`export COCODE_RUNTIME_CHANNEL=${shellQuote(
			environment.COCODE_RUNTIME_CHANNEL?.trim() || "stable",
		)}`,
		`exec ${shellQuote(executable)} ${shellQuote(entry)} "$@"`,
		"",
	].join("\n")
}

export function macCliPostinstall(
	environment = process.env,
	cliInstallPath = DEFAULT_CLI_INSTALL_PATH,
) {
	const target = shellQuote(cliInstallPath)
	const wrapper = macCliWrapper(environment)
	return [
		"#!/bin/sh",
		"set -eu",
		`target=${target}`,
		'if [ -e "$target" ] && ! grep -q "cocode-desktop-cli-shim:v1" "$target"; then',
		'  echo "Cocode CLI conflict detected; preserving the existing command at $target." >&2',
		"  exit 0",
		"fi",
		'mkdir -p "$(dirname "$target")"',
		'tmp="$target.cocode.tmp.$$"',
		"cat > \"$tmp\" <<'COCODE_DESKTOP_WRAPPER'",
		wrapper,
		"COCODE_DESKTOP_WRAPPER",
		'chmod 755 "$tmp"',
		'mv -f "$tmp" "$target"',
		"exit 0",
		"",
	].join("\n")
}

function shellQuote(value) {
	return `'${value.replaceAll("'", "'\\''")}'`
}

function run(command, args) {
	execFileSync(command, args, { stdio: "inherit" })
}

function findApp(root) {
	if (!existsSync(root)) return undefined
	if (root.endsWith(".app") && statSync(root).isDirectory()) return root
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const candidate = path.join(root, entry.name)
		if (entry.isDirectory()) {
			const found = findApp(candidate)
			if (found) return found
		}
	}
	return undefined
}

export function findPackagedMacApp(root = process.env.RELEASE_OUTPUT_DIR || "release") {
	return findApp(path.resolve(root))
}

if (
	process.argv[1] &&
	path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
) {
	const appPath = process.argv[2]
	const outputPath = process.argv[3]
	const version = process.argv[4]
	buildMacPkg({ appPath, outputPath, version })
}
