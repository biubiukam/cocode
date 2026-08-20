import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import * as path from "pathe"

export function verifyPackagedStartupAssets(packageRoot, { platform, arch } = {}) {
	if (platform !== "win32") return
	const root = path.resolve(packageRoot)
	assertFile(path.join(root, "resources", "cocode-node"), "packaged cocode-node")
	assertFile(
		path.join(root, "resources", "startup-failure.html"),
		"packaged startup failure diagnostic page",
	)

	const runtimeRoot = path.join(root, "resources", "dsh-runtime")
	assertDirectory(runtimeRoot, "packaged DSH runtime")
	const manifestPath = path.join(runtimeRoot, "runtime-manifest.json")
	assertFile(manifestPath, "packaged runtime manifest")
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
	if (manifest.platform !== platform || manifest.arch !== arch) {
		throw new Error(
			`Packaged runtime architecture mismatch: expected ${platform}/${arch}, got ${manifest.platform}/${manifest.arch}.`,
		)
	}
	assertFile(
		path.join(runtimeRoot, "packages", "host-supervisor", "lib", "bin.js"),
		"packaged Host Supervisor entry",
	)
	assertFile(path.join(runtimeRoot, "package.json"), "packaged Supervisor manifest")
	const dshEntry = manifest.dsh?.entry
	if (typeof dshEntry !== "string" || dshEntry.length === 0)
		throw new Error("Packaged DSH runtime manifest is missing its Web entry.")
	assertFile(path.join(runtimeRoot, dshEntry), "packaged DSH Web entry")
	assertPackageEntry(runtimeRoot, "@deepseek-ai/dsh-host-webserver", "packaged DSH Web server")
	assertPackageEntry(
		runtimeRoot,
		"@deepseek-ai/dsh-host-frontend-static",
		"packaged DSH Web frontend",
	)

	const appRoot = resolvePackagedAppRoot(root)
	const betterSqliteRoot = path.join(appRoot, "node_modules", "better-sqlite3")
	assertDirectory(betterSqliteRoot, "packaged better-sqlite3")
	const betterSqliteNative = findTargetNativeAddon(betterSqliteRoot, platform, arch)
	if (!betterSqliteNative) throw new Error("Packaged better-sqlite3 native module is missing.")

	const ptyRoot = path.join(runtimeRoot, "node_modules", "node-pty")
	assertDirectory(ptyRoot, "packaged node-pty")
	const ptyNative = findRequiredFile(ptyRoot, "pty.node")
	assertFile(ptyNative, "packaged node-pty pty.node")
	assertPeArchitecture(ptyNative, arch)
	if (platform === "win32") {
		const winptyAgent = findRequiredFile(ptyRoot, "winpty-agent.exe")
		const conptyNative = findRequiredFile(ptyRoot, "conpty.node")
		const conptyLibrary = findRequiredFile(ptyRoot, "conpty.dll")
		const openConsole = findRequiredFile(ptyRoot, "OpenConsole.exe")
		assertFile(winptyAgent, "packaged node-pty winpty agent")
		assertFile(conptyNative, "packaged node-pty conpty.node")
		assertFile(conptyLibrary, "packaged node-pty conpty.dll")
		assertFile(openConsole, "packaged node-pty OpenConsole.exe")
		for (const nativeFile of [ptyNative, winptyAgent, conptyNative, conptyLibrary, openConsole])
			assertPeArchitecture(nativeFile, arch)
	}

	assertPeArchitecture(path.join(root, "resources", "cocode-node"), arch)
	assertPeArchitecture(betterSqliteNative, arch)
	verifySharpNatives(runtimeRoot, platform, arch)
	return { appRoot, runtimeRoot, betterSqliteNative }
}

function resolvePackagedAppRoot(root) {
	const candidates = [
		root,
		path.join(root, "resources", "app"),
		path.join(root, "resources", "app.asar.unpacked"),
	]
	const resolved = candidates.find((candidate) =>
		existsSync(path.join(candidate, "node_modules", "better-sqlite3")),
	)
	if (!resolved) throw new Error("Packaged application node_modules are missing.")
	return resolved
}

function verifySharpNatives(runtimeRoot, platform, arch) {
	const sharpRoot = path.join(runtimeRoot, "node_modules", "sharp")
	assertDirectory(sharpRoot, "packaged sharp")
	assertFile(path.join(sharpRoot, "package.json"), "packaged sharp manifest")
	const sharpNativeRoot = path.join(
		runtimeRoot,
		"node_modules",
		"@img",
		`sharp-${platform}-${arch}`,
	)
	assertDirectory(sharpNativeRoot, `packaged sharp native package for ${platform}/${arch}`)
	const sharpNative = findFirstByExtension(sharpNativeRoot, ".node")
	if (!sharpNative) throw new Error("Packaged sharp native module is missing.")
	assertPeArchitecture(sharpNative, arch)
	const libvipsRoot = path.join(
		runtimeRoot,
		"node_modules",
		"@img",
		`sharp-libvips-${platform}-${arch}`,
	)
	assertDirectory(libvipsRoot, `packaged sharp libvips package for ${platform}/${arch}`)
	const libvips = findFirstByExtension(libvipsRoot, ".dll")
	if (!libvips) throw new Error("Packaged sharp libvips DLL is missing.")
	assertPeArchitecture(libvips, arch)
}

function assertDirectory(directory, label) {
	if (!existsSync(directory) || !statSync(directory).isDirectory())
		throw new Error(`${label} is missing: ${directory}`)
}

function assertFile(file, label) {
	if (!existsSync(file) || !statSync(file).isFile())
		throw new Error(`${label} is missing: ${file}`)
}

function assertPackageEntry(root, packageName, label) {
	const packageRoot = path.join(root, "node_modules", ...packageName.split("/"))
	const packageManifestPath = path.join(packageRoot, "package.json")
	assertFile(packageManifestPath, `${label} manifest`)
	const packageManifest = JSON.parse(readFileSync(packageManifestPath, "utf8"))
	const entry = typeof packageManifest.main === "string" ? packageManifest.main : "lib/index.js"
	assertFile(path.join(packageRoot, entry), `${label} entry`)
}

function findRequiredFile(root, name) {
	const file = findFirstByName(root, name)
	if (!file) throw new Error(`Packaged native file is missing: ${name}`)
	return file
}

function findFirstByName(root, name) {
	if (!existsSync(root) || !statSync(root).isDirectory()) return undefined
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const file = path.join(root, entry.name)
		if (entry.isFile() && entry.name === name) return file
		if (entry.isDirectory()) {
			const found = findFirstByName(file, name)
			if (found) return found
		}
	}
	return undefined
}

function findFirstByExtension(root, extension) {
	if (!existsSync(root) || !statSync(root).isDirectory()) return undefined
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const file = path.join(root, entry.name)
		if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) return file
		if (entry.isDirectory()) {
			const found = findFirstByExtension(file, extension)
			if (found) return found
		}
	}
	return undefined
}

function findTargetNativeAddon(root, platform, arch) {
	const targetName = `${platform}-${arch}.node`
	const target = findFirstByName(root, targetName)
	if (target) return target
	return findFirstByExtension(root, ".node")
}

function assertPeArchitecture(file, arch) {
	const bytes = readFileSync(file)
	if (bytes.length < 0x40 || bytes.readUInt16LE(0) !== 0x5a4d)
		throw new Error(`Native packaged file is not a Windows PE image: ${file}`)
	const peOffset = bytes.readUInt32LE(0x3c)
	if (peOffset + 6 > bytes.length || bytes.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0")
		throw new Error(`Native packaged file has no PE header: ${file}`)
	const machine = bytes.readUInt16LE(peOffset + 4)
	const expected = arch === "arm64" ? 0xaa64 : 0x8664
	if (machine !== expected)
		throw new Error(`Native packaged file architecture mismatch for ${arch}: ${file}`)
}
