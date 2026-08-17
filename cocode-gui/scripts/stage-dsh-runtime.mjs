import {
	cpSync,
	existsSync,
	chmodSync,
	mkdirSync,
	rmSync,
	readFileSync,
	readdirSync,
	realpathSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import * as path from 'pathe'
import process from 'node:process'

const destination = readArgument('--destination')
if (!destination) {
	console.error('Usage: node scripts/stage-dsh-runtime.mjs --destination <directory>')
	process.exit(2)
}

const require = createRequire(import.meta.url)
const supervisorManifest = require.resolve('@cocode/host-supervisor/package.json')
const supervisorRoot = path.dirname(supervisorManifest)
const supervisorPackage = JSON.parse(readFileSync(supervisorManifest, 'utf8'))
const supervisorRequire = createRequire(supervisorManifest)
const dshManifest = supervisorRequire.resolve('@deepseek-ai/dsh/package.json')

verifyWorkspacePluginArtifacts(supervisorRoot)

rmSync(destination, { recursive: true, force: true })
mkdirSync(destination, { recursive: true })
copyTree(supervisorRoot, destination)
materializeDependencyClosure(
	supervisorRoot,
	destination,
	readDirectory(path.join(supervisorRoot, 'runtime', 'plugins')).map((entry) =>
		path.join(supervisorRoot, 'runtime', 'plugins', entry),
	),
)
materializeBundledPlugins(destination)
restoreNodePtyHelper(destination)

const marker = {
	package: supervisorPackage.name,
	supervisorVersion: supervisorPackage.version,
	dshVersion: JSON.parse(readFileSync(dshManifest, 'utf8')).version,
	entry: path.join(destination, 'packages', 'host-supervisor', 'lib', 'bin.js'),
}
cpSync(dshManifest, path.join(destination, 'dsh-package.json'))
process.stdout.write(`Staged shared DSH Host runtime ${marker.dshVersion} with Supervisor ${marker.supervisorVersion}\n`)

function readArgument(name) {
	const index = process.argv.indexOf(name)
	return index === -1 ? undefined : process.argv[index + 1]
}

function copyTree(source, target) {
	cpSync(source, target, {
		recursive: true,
		dereference: true,
		filter: (entry) => {
			// pathe normalizes relative paths to forward slashes on every platform.
			const relative = path.relative(source, entry)
			if (relative === '') return true
			if (relative === 'node_modules' || relative.startsWith('node_modules/')) return false
			return !relative.split('/').includes('.cache')
		},
	})
	for (const candidate of [
		path.join(target, 'node_modules', 'node-pty', 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
		path.join(target, 'node_modules', 'node-pty', 'build', 'Release', 'spawn-helper'),
	]) {
		if (existsSync(candidate)) chmodSync(candidate, 0o755)
	}
}

/**
 * Build a flat npm-shaped dependency tree from the installed package graph.
 * The GUI workspace uses pnpm's isolated symlink layout, which is not safe to
 * copy into Electron resources because links would point back to this
 * checkout. The runtime bootstrap resolves the same closure again at Host
 * startup, so the staged Supervisor must itself be self-contained first.
 */
function materializeDependencyClosure(supervisorRoot, destination, additionalRoots) {
	const targetModules = path.join(destination, 'node_modules')
	const pending = [
		{ root: realpathSync(supervisorRoot), copy: false },
		...additionalRoots.map((root) => ({ root: realpathSync(root), copy: true })),
	]
	const visited = new Set()
	while (pending.length > 0) {
		const { root, copy } = pending.shift()
		const manifestPath = path.join(root, 'package.json')
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
		if (typeof manifest.name !== 'string' || visited.has(manifest.name)) continue
		visited.add(manifest.name)
		if (copy) {
			const target = path.join(targetModules, ...manifest.name.split('/'))
			mkdirSync(path.dirname(target), { recursive: true })
			copyPackageTree(root, target)
		}
		const packageRequire = createRequire(manifestPath)
		const dependencies = {
			...(manifest.dependencies ?? {}),
			...(manifest.optionalDependencies ?? {}),
			...(manifest.peerDependencies ?? {}),
		}
		for (const dependency of Object.keys(dependencies)) {
			try {
				pending.push({ root: resolvePackageRoot(packageRequire, dependency), copy: true })
			} catch (error) {
				if (
					manifest.optionalDependencies?.[dependency] !== undefined ||
					manifest.peerDependenciesMeta?.[dependency]?.optional === true
				) continue
				throw new Error(
					`Unable to resolve staged runtime dependency ${dependency} from ${root}: ${String(error)}`,
				)
			}
		}
	}
}

function copyPackageTree(source, target) {
	cpSync(source, target, {
		recursive: true,
		dereference: true,
		filter: (entry) => {
			const relative = path.relative(source, entry)
			if (relative === '') return true
			return path.basename(entry) !== 'node_modules' && !relative.split('/').includes('.cache')
		},
	})
}

function resolvePackageRoot(packageRequire, packageName) {
	for (const searchPath of packageRequire.resolve.paths(packageName) ?? []) {
		const candidate = path.join(searchPath, ...packageName.split('/'))
		const manifestPath = path.join(candidate, 'package.json')
		if (!existsSync(manifestPath)) continue
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
		if (manifest.name === packageName) return realpathSync(candidate)
	}
	throw new Error(`package root not found for ${packageName}`)
}

function materializeBundledPlugins(root) {
	const pluginsRoot = path.join(root, 'runtime', 'plugins')
	if (!existsSync(pluginsRoot)) return
	for (const entry of readDirectory(pluginsRoot)) {
		const source = path.join(pluginsRoot, entry)
		const target = path.join(root, 'node_modules', ...entry.split('/'))
		mkdirSync(path.dirname(target), { recursive: true })
		cpSync(source, target, { recursive: true, dereference: true })
	}
}

/**
 * In the workspace the Supervisor package is linked, so its committed runtime
 * artifacts must match the GUI plugin build that the current Desktop uses.
 * Published installs have no sibling GUI source and intentionally skip this
 * check.
 */
function verifyWorkspacePluginArtifacts(supervisorRoot) {
	const workspacePlugins = path.resolve(process.cwd(), 'packages', 'cocode')
	if (!existsSync(workspacePlugins)) return
	const bundledPlugins = path.join(supervisorRoot, 'runtime', 'plugins')
	for (const entry of readDirectory(workspacePlugins)) {
		const source = path.join(workspacePlugins, entry)
		const bundled = path.join(bundledPlugins, entry)
		if (!existsSync(path.join(source, 'package.json'))) continue
		for (const artifact of ['lib/index.js', 'lib/client.js']) {
			const sourceFile = path.join(source, artifact)
			const bundledFile = path.join(bundled, artifact)
			if (!existsSync(sourceFile) || !existsSync(bundledFile)) continue
			if (sha256(sourceFile) !== sha256(bundledFile)) {
				throw new Error(
					`Stale Supervisor runtime plugin ${entry}/${artifact}. Run pnpm run build:cocode-plugins before staging the DSH runtime.`,
				)
			}
		}
		const sourceManifest = JSON.parse(readFileSync(path.join(source, 'package.json'), 'utf8'))
		const bundledManifestPath = path.join(bundled, 'package.json')
		if (!existsSync(bundledManifestPath)) {
			throw new Error(`Supervisor runtime plugin ${entry} is missing package.json.`)
		}
		const bundledManifest = JSON.parse(readFileSync(bundledManifestPath, 'utf8'))
		if (
			bundledManifest.name !== sourceManifest.name ||
			bundledManifest.version !== sourceManifest.version ||
			JSON.stringify(bundledManifest.dsh) !== JSON.stringify(sourceManifest.dsh)
		) {
			throw new Error(
				`Stale Supervisor runtime manifest for ${entry}. Run pnpm run build:cocode-plugins before staging the DSH runtime.`,
			)
		}
	}
}

function sha256(file) {
	return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function restoreNodePtyHelper(root) {
	for (const helper of [
		path.join(root, 'node_modules', 'node-pty', 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
		path.join(root, 'node_modules', 'node-pty', 'build', 'Release', 'spawn-helper'),
	]) {
		if (existsSync(helper)) chmodSync(helper, 0o755)
	}
}

function readDirectory(directory) {
	return existsSync(directory) ? readdirSync(directory) : []
}
