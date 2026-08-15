import { createRequire } from "node:module"
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createPackage } from "@electron/asar"

const require = createRequire(import.meta.url)
const electronPackageRoot = path.dirname(require.resolve("electron/package.json"))
const resourcesRootArgument = process.argv.indexOf("--resources-root")
const configuredResourcesRoot =
	resourcesRootArgument === -1 ? undefined : process.argv[resourcesRootArgument + 1]
if (resourcesRootArgument !== -1 && !configuredResourcesRoot) {
	throw new Error("--resources-root requires a directory path")
}
const resourcesRoot = configuredResourcesRoot
	? path.resolve(configuredResourcesRoot)
	: process.platform === "darwin"
	? path.join(electronPackageRoot, "dist", "Electron.app", "Contents", "Resources")
	: path.join(electronPackageRoot, "dist", "resources")
const defaultAppArchive = path.join(resourcesRoot, "default_app.asar")
const marker = "Cocode: exit before showing the unconfigured Electron welcome window."
const welcomeBranchStart = "\nelse {\n    if (!option.noHelp) {"
const sourceMapComment = "\n//# sourceMappingURL=main.js.map"
const silentExitBranch = `\nelse {\n    // ${marker}\n    process.exit(0);\n}`

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "cocode-electron-default-app-"))
const extractedDefaultApp = path.join(temporaryRoot, "default-app")
const replacementArchive = path.join(temporaryRoot, "default_app.asar")
const backupArchive = path.join(temporaryRoot, "default_app.original.asar")

try {
	const { extractAll } = await import("@electron/asar")
	extractAll(defaultAppArchive, extractedDefaultApp)

	const mainPath = path.join(extractedDefaultApp, "main.js")
	const mainSource = await readFile(mainPath, "utf8")
	if (mainSource.includes(marker)) {
		console.log("[electron] default welcome window is already suppressed")
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
		console.log("[electron] suppressed the unconfigured default welcome window")
	}
} finally {
	await rm(temporaryRoot, { recursive: true, force: true })
}
