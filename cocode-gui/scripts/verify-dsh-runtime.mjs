import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs"
import * as path from "pathe"
import { fileURLToPath } from "node:url"
import { hashDirectory, hashJson } from "./runtime-build-helpers.mjs"

export function verifyRuntime(
	runtimeRoot,
	{ expectedInputFingerprint, platform = process.platform, arch = process.arch } = {},
) {
	const root = path.resolve(runtimeRoot)
	const manifestPath = path.join(root, "runtime-manifest.json")
	if (!existsSync(manifestPath)) throw new Error(`Runtime manifest is missing: ${manifestPath}`)
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
	if (manifest.schemaVersion !== 1)
		throw new Error(`Unsupported runtime manifest schema: ${manifest.schemaVersion}`)
	if (manifest.platform !== platform || manifest.arch !== arch)
		throw new Error(
			`Runtime platform mismatch: expected ${platform}/${arch}, got ${manifest.platform}/${manifest.arch}.`,
		)
	if (expectedInputFingerprint && manifest.inputFingerprint !== expectedInputFingerprint)
		throw new Error("Staged runtime inputs are stale.")
	const withoutManifest = hashDirectory(root, {
		ignore: (relative) => relative === "runtime-manifest.json",
	})
	if (withoutManifest !== manifest.runtimeContentHash)
		throw new Error("Runtime content hash does not match runtime-manifest.json.")
	const unsigned = { ...manifest }
	delete unsigned.fingerprint
	if (hashJson(unsigned) !== manifest.fingerprint)
		throw new Error("Runtime manifest fingerprint is invalid.")
	assertFile(path.join(root, manifest.supervisor.entry), "Supervisor entry")
	const supervisorPackage = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"))
	if (supervisorPackage.name !== "@cocode-agency/host-supervisor")
		throw new Error("Staged supervisor package name is invalid.")
	if (String(supervisorPackage.version) !== String(manifest.supervisor.version))
		throw new Error("Supervisor version mismatch.")
	if (
		hashDirectory(path.join(root, "packages", "host-supervisor")) !==
		manifest.supervisor.contentHash
	)
		throw new Error("Supervisor content hash mismatch.")
	for (const plugin of manifest.plugins) {
		const pluginRoot = path.join(root, "runtime", "plugins", ...String(plugin.name).split("/"))
		const pluginPackage = JSON.parse(
			readFileSync(path.join(pluginRoot, "package.json"), "utf8"),
		)
		if (
			pluginPackage.name !== plugin.name ||
			String(pluginPackage.version) !== String(plugin.version)
		)
			throw new Error(`Plugin manifest mismatch: ${plugin.name}`)
		assertFile(path.join(pluginRoot, "lib", "index.js"), `${plugin.name} server entry`)
		if (pluginPackage.dsh?.client?.platform === "web")
			assertFile(path.join(pluginRoot, "lib", "client.js"), `${plugin.name} client entry`)
		if (hashDirectory(pluginRoot) !== plugin.contentHash)
			throw new Error(`Plugin content hash mismatch: ${plugin.name}`)
	}
	const dshRoot = path.join(root, "node_modules", "@deepseek-ai", "dsh")
	const dshPackage = JSON.parse(readFileSync(path.join(dshRoot, "package.json"), "utf8"))
	if (
		dshPackage.name !== "@deepseek-ai/dsh" ||
		String(dshPackage.version) !== String(manifest.dsh.version)
	)
		throw new Error("DSH manifest mismatch.")
	assertFile(path.join(root, manifest.dsh.entry), "DSH entry")
	if (hashDirectory(dshRoot) !== manifest.dsh.contentHash)
		throw new Error("DSH content hash mismatch.")
	if (hashDirectory(path.join(root, "node_modules")) !== manifest.dependencyClosureHash)
		throw new Error("Dependency closure hash mismatch.")
	verifyNoSymlinks(root)
	verifyNodePtyNatives(root, platform, arch)
	return manifest
}

function verifyNoSymlinks(root) {
	for (const relative of listPaths(root))
		if (lstatSync(path.join(root, relative)).isSymbolicLink())
			throw new Error(`Staged runtime contains a symlink: ${relative}`)
}

/**
 * node-pty loads each native module from the first of build/Release,
 * build/Debug or prebuilds/<platform>-<arch> that contains it, and resolves the
 * companion binaries next to it. Windows has no spawn-helper: it drives conpty
 * and winpty instead.
 */
function verifyNodePtyNatives(root, platform, arch) {
	const moduleRoot = path.join(root, "node_modules", "node-pty")
	const searchDirectories = ["build/Release", "build/Debug", `prebuilds/${platform}-${arch}`].map(
		(relative) => path.join(moduleRoot, relative),
	)
	const resolveNativeDirectory = (name) => {
		const directory = searchDirectories.find((candidate) =>
			existsSync(path.join(candidate, name)),
		)
		if (!directory) throw new Error(`node-pty ${name} is missing for ${platform}/${arch}.`)
		return directory
	}
	const ptyDirectory = resolveNativeDirectory("pty.node")
	if (platform !== "win32") {
		assertFile(path.join(ptyDirectory, "spawn-helper"), "node-pty spawn-helper")
		return
	}
	assertFile(path.join(ptyDirectory, "winpty-agent.exe"), "node-pty winpty agent")
	const conptyDirectory = resolveNativeDirectory("conpty.node")
	assertFile(path.join(conptyDirectory, "conpty", "conpty.dll"), "node-pty conpty library")
	assertFile(path.join(conptyDirectory, "conpty", "OpenConsole.exe"), "node-pty conpty console")
}

function listPaths(root, prefix = "") {
	return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
		const relative = path.join(prefix, entry.name)
		const absolute = path.join(root, entry.name)
		return entry.isDirectory() ? listPaths(absolute, relative) : [relative]
	})
}

function assertFile(file, label) {
	if (!existsSync(file) || !statSync(file).isFile())
		throw new Error(`${label} is missing: ${file}`)
}

const invokedPath = process.argv[1]
if (invokedPath && path.resolve(invokedPath) === path.resolve(fileURLToPath(import.meta.url))) {
	const index = process.argv.indexOf("--runtime-root")
	if (index < 0)
		throw new Error("Usage: node scripts/verify-dsh-runtime.mjs --runtime-root <directory>")
	verifyRuntime(process.argv[index + 1])
}
