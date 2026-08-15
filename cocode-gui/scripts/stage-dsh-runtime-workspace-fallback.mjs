import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync } from "node:fs"
import path from "node:path"

/**
 * pnpm does not install workspace peer dependencies into a deploy when the
 * source workspace disables automatic peer installation. DSH imports several
 * of those peers at runtime (for example cordis-plugin-group and schemastery),
 * so copy the source workspace packages into the flat deployed node_modules.
 * Each package is copied without its own node_modules; the deploy's hoisted
 * dependency tree remains the single owner of external dependencies.
 */
export function copyWorkspaceFallback(sourceRoot, target) {
	const sourceModules = path.join(sourceRoot, "node_modules", ".pnpm", "node_modules")
	const targetModules = path.join(target, "node_modules")
	if (!existsSync(sourceModules)) return

	for (const scopeOrPackage of readdirSync(sourceModules)) {
		const sourceScope = path.join(sourceModules, scopeOrPackage)
		const sourceStat = lstatSafe(sourceScope)
		if (sourceStat?.isDirectory() && scopeOrPackage.startsWith("@")) {
			for (const packageName of readdirSync(sourceScope)) {
				copyWorkspacePackage(
					path.join(sourceScope, packageName),
					path.join(targetModules, scopeOrPackage, packageName),
					sourceRoot,
				)
			}
		} else {
			copyWorkspacePackage(sourceScope, path.join(targetModules, scopeOrPackage), sourceRoot)
		}
	}
}

function copyWorkspacePackage(source, target, sourceRoot) {
	const resolved = realpathSafe(source)
	if (!resolved || !isWorkspacePath(resolved, sourceRoot)) return
	mkdirSync(path.dirname(target), { recursive: true })
	cpSync(source, target, {
		recursive: true,
		dereference: true,
		filter: (entry) => path.basename(entry) !== "node_modules",
	})
}

export function isWorkspacePath(candidate, sourceRoot) {
	const resolvedSourceRoot = realpathSafe(sourceRoot) ?? path.resolve(sourceRoot)
	const relative = path.relative(resolvedSourceRoot, candidate)
	return (
		relative !== "" &&
		!relative.startsWith("..") &&
		!path.isAbsolute(relative) &&
		!relative.split(path.sep).includes("node_modules")
	)
}

function lstatSafe(file) {
	try {
		return lstatSync(file)
	} catch {
		return undefined
	}
}

function realpathSafe(file) {
	try {
		return realpathSync(file)
	} catch {
		return undefined
	}
}
