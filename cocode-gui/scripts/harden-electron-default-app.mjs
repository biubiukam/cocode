import { spawn } from "node:child_process"
import { createRequire } from "node:module"
import { access, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import * as path from "pathe"
import { createPackage, extractAll } from "@electron/asar"
import { electronDefaultAppTemporaryPrefix } from "./lib/electron-default-app-paths.mjs"

const require = createRequire(import.meta.url)
const electronPackageRoot = path.dirname(require.resolve("electron/package.json"))
const resourcesRootArgument = process.argv.indexOf("--resources-root")
const configuredResourcesRoot =
	resourcesRootArgument === -1 ? undefined : process.argv[resourcesRootArgument + 1]
if (resourcesRootArgument !== -1 && !configuredResourcesRoot) {
	throw new Error("--resources-root requires a directory path")
}
const marker = "Cocode: exit before showing the unconfigured Electron welcome window."
const welcomeBranchStart = "\nelse {\n    if (!option.noHelp) {"
const sourceMapComment = "\n//# sourceMappingURL=main.js.map"
const silentExitBranch = `\nelse {\n    // ${marker}\n    process.exit(0);\n}`

await ensureElectronBinary()

const resourcesRoots = configuredResourcesRoot
	? [path.resolve(configuredResourcesRoot)]
	: await discoverElectronResourcesRoots()

for (const resourcesRoot of resourcesRoots) {
	await hardenDefaultApp(resourcesRoot)
}

async function hardenDefaultApp(resourcesRoot) {
	const defaultAppArchive = path.join(resourcesRoot, "default_app.asar")
	if (!(await pathExists(defaultAppArchive))) {
		throw new Error(
			`Electron default app archive is missing: ${defaultAppArchive}. ` +
				"The Electron binary installation did not complete; remove node_modules/electron and reinstall.",
		)
	}
	const temporaryRoot = await mkdtemp(electronDefaultAppTemporaryPrefix(defaultAppArchive))
	const extractedDefaultApp = path.join(temporaryRoot, "default-app")
	const replacementArchive = path.join(temporaryRoot, "default_app.asar")
	const backupArchive = path.join(temporaryRoot, "default_app.original.asar")

	try {
		extractAll(defaultAppArchive, extractedDefaultApp)

		const mainPath = path.join(extractedDefaultApp, "main.js")
		const mainSource = await readFile(mainPath, "utf8")
		if (mainSource.includes(marker)) {
			console.log(`[electron] default welcome window is already suppressed: ${resourcesRoot}`)
			process.exitCode = 0
		} else {
			const branchStart = mainSource.lastIndexOf(welcomeBranchStart)
			const branchEnd = mainSource.indexOf(sourceMapComment, branchStart)
			if (branchStart === -1 || branchEnd === -1) {
				throw new Error(
					"Unable to locate Electron's default welcome branch. " +
						"Review the Electron default app before updating this hardening script.",
				)
			}

			await writeFile(
				mainPath,
				mainSource.slice(0, branchStart) + silentExitBranch + mainSource.slice(branchEnd),
				"utf8",
			)
			await createPackage(extractedDefaultApp, replacementArchive)
			await rename(defaultAppArchive, backupArchive)
			try {
				await rename(replacementArchive, defaultAppArchive)
			} catch (error) {
				await rename(backupArchive, defaultAppArchive)
				throw error
			}
			await rm(backupArchive, { force: true })
			console.log(
				`[electron] suppressed the unconfigured default welcome window: ${resourcesRoot}`,
			)
		}
	} finally {
		await rm(temporaryRoot, { recursive: true, force: true })
	}
}

async function discoverElectronResourcesRoots() {
	const primaryRoot =
		process.platform === "darwin"
			? path.join(electronPackageRoot, "dist", "Electron.app", "Contents", "Resources")
			: path.join(electronPackageRoot, "dist", "resources")
	const roots = [primaryRoot]
	const pnpmStoreRoot = path.join(path.dirname(electronPackageRoot), ".pnpm")
	let entries
	try {
		entries = await readdir(pnpmStoreRoot, { withFileTypes: true })
	} catch {
		return roots
	}
	for (const entry of entries) {
		if (!entry.isDirectory() || !entry.name.startsWith("electron@")) continue
		const packageRoot = path.join(pnpmStoreRoot, entry.name, "node_modules", "electron")
		const resourcesRoot =
			process.platform === "darwin"
				? path.join(packageRoot, "dist", "Electron.app", "Contents", "Resources")
				: path.join(packageRoot, "dist", "resources")
		if (await pathExists(path.join(resourcesRoot, "default_app.asar")))
			roots.push(resourcesRoot)
	}
	if (!(await pathExists(path.join(primaryRoot, "default_app.asar")))) {
		throw new Error(
			`Electron default app archive is missing: ${path.join(
				primaryRoot,
				"default_app.asar",
			)}. ` +
				"The Electron binary installation did not complete; remove node_modules/electron and reinstall.",
		)
	}
	return [...new Set(roots)]
}

async function ensureElectronBinary() {
	if (await electronBinaryExists()) return

	const installerPath = path.join(electronPackageRoot, "install.js")
	console.log("[electron] downloading the Electron binary")
	await runNodeScript(installerPath)
	if (!(await electronBinaryExists())) {
		throw new Error(
			"Electron binary installation finished without producing the expected executable. " +
				"Check the Electron download mirror/proxy and retry after removing node_modules/electron.",
		)
	}
}

async function electronBinaryExists() {
	try {
		const version = (await readFile(path.join(electronPackageRoot, "dist", "version"), "utf8"))
			.trim()
			.replace(/^v/, "")
		const packageVersion = require(path.join(electronPackageRoot, "package.json")).version
		if (version !== packageVersion) return false

		const platformPath = (
			await readFile(path.join(electronPackageRoot, "path.txt"), "utf8")
		).trim()
		const distRoot = process.env.ELECTRON_OVERRIDE_DIST_PATH
			? path.resolve(process.env.ELECTRON_OVERRIDE_DIST_PATH)
			: path.join(electronPackageRoot, "dist")
		await access(path.join(distRoot, platformPath))
		return true
	} catch {
		return false
	}
}

function runNodeScript(scriptPath) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [scriptPath], { stdio: "inherit", env: process.env })
		child.once("error", reject)
		child.once("close", (code, signal) => {
			if (code === 0) {
				resolve()
			} else {
				reject(
					new Error(
						`Electron installer exited with ${
							signal ? `signal ${signal}` : `code ${code}`
						}.`,
					),
				)
			}
		})
	})
}

async function pathExists(filePath) {
	try {
		await access(filePath)
		return true
	} catch {
		return false
	}
}
