#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const tuiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(tuiRoot, '..')
const guiRoot = resolve(repoRoot, 'cocode-gui')
const hostRoot = resolve(repoRoot, 'cocode-host-supervisor')
const checkOnly = process.argv.includes('--check-only')

main()

function main() {
	checkNodeVersion()
	ensureDirectory(hostRoot, 'cocode-host-supervisor')

	const tuiHostLink = join(tuiRoot, 'node_modules', '@cocode', 'host-supervisor')
	const tuiInstallNeeded = needsInstall(tuiRoot, [
		join(tuiRoot, 'node_modules', '.bin', 'tsx'),
		join(tuiHostLink, 'package.json'),
	])
	const hostInstallNeeded = needsInstall(hostRoot, [
		join(hostRoot, 'node_modules', '.bin', 'tsc'),
		join(hostRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
	])

	const hostLinkNeedsRepair = !pointsTo(tuiHostLink, hostRoot)
	if (checkOnly) {
		if (tuiInstallNeeded) fail('TUI 依赖不完整，请运行 `make install-tui`。')
		if (hostLinkNeedsRepair) fail('TUI 未链接当前仓库的 Host Supervisor，请运行 `make install-tui`。')
		if (hostInstallNeeded) fail('Host Supervisor 依赖不完整，请运行 `pnpm --dir cocode-host-supervisor install`。')
	} else {
		if (hostInstallNeeded) runPnpm(hostRoot, ['install'], '安装 Host Supervisor 依赖')
		if (tuiInstallNeeded || hostLinkNeedsRepair) runPnpm(tuiRoot, ['install'], '安装 TUI 依赖')
	}

	const hostBuildOutput = join(hostRoot, 'packages', 'host-supervisor', 'lib', 'index.js')
	const pluginBuildNeeded = hasCocodePluginBuildsNeeded()
	const hostBuildNeeded =
		!existsSync(hostBuildOutput) ||
		hasNewerSource(hostRoot, hostBuildOutput) ||
		hasMissingGuiRuntimePlugins()
	if (pluginBuildNeeded) {
		if (checkOnly) {
			fail('Cocode GUI 插件构建产物已缺失或过期，请运行 `pnpm --dir cocode-gui run build:cocode-plugins`。')
		}
		runPnpm(guiRoot, ['run', 'build:cocode-plugins'], '构建 Cocode GUI 插件')
	}
	if (hostBuildNeeded) {
		if (checkOnly) fail('Host Supervisor 构建产物已缺失或过期，请运行 `pnpm --dir cocode-host-supervisor run build:with-gui-plugins`。')
		runPnpm(hostRoot, ['run', 'build:with-gui-plugins'], '构建带 GUI 插件的 Host runtime')
	}

	if (!checkOnly) {
		process.stdout.write('TUI 开发环境已准备完成。\n')
	}
}

function checkNodeVersion() {
	const [major, minor] = process.versions.node.split('.').map(Number)
	const supported = major > 24 || major === 24 || (major === 22 && minor >= 19)
	if (!supported) {
		fail(`Node.js 版本 ${process.versions.node} 不满足要求，需要 22.19.x 或 24 及以上版本。`)
	}
}

function ensureDirectory(path, label) {
	if (!existsSync(path) || !statSync(path).isDirectory()) {
		fail(`找不到 ${label}：${path}`)
	}
}

function needsInstall(root, requiredPaths) {
	const modulesFile = join(root, 'node_modules', '.modules.yaml')
	if (!existsSync(modulesFile)) return true
	if (requiredPaths.some((path) => !existsSync(path))) return true

	const lockfile = join(root, 'pnpm-lock.yaml')
	return existsSync(lockfile) && statSync(lockfile).mtimeMs > statSync(modulesFile).mtimeMs
}

function pointsTo(path, expectedTarget) {
	try {
		return resolve(realpathSync(path)) === resolve(realpathSync(expectedTarget))
	} catch {
		return false
	}
}

function hasNewerSource(root, output) {
	const outputMtime = statSync(output).mtimeMs
	const sourceRoots = [
		join(root, 'packages', 'host-supervisor', 'src'),
		join(root, 'packages', 'host-supervisor', 'scripts'),
		join(root, 'packages', 'vision', 'src'),
		join(repoRoot, 'cocode-gui', 'packages', 'cocode'),
	]
	const sourceFiles = [
		join(root, 'package.json'),
		join(root, 'packages', 'host-supervisor', 'tsconfig.json'),
		join(root, 'packages', 'host-supervisor', 'tsconfig.build.json'),
		join(root, 'packages', 'vision', 'package.json'),
		...sourceRoots.flatMap((sourceRoot) => listFiles(sourceRoot)),
	]
	return sourceFiles.some((path) => existsSync(path) && statSync(path).mtimeMs > outputMtime)
}

function hasCocodePluginBuildsNeeded() {
	const pluginsRoot = join(guiRoot, 'packages', 'cocode')
	if (!existsSync(pluginsRoot)) return false
	return readdirSync(pluginsRoot, { withFileTypes: true }).some((entry) => {
		if (!entry.isDirectory()) return false
		const pluginRoot = join(pluginsRoot, entry.name)
		const manifestPath = join(pluginRoot, 'package.json')
		if (!existsSync(manifestPath)) return false
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
		if (manifest.private !== true || !manifest.cocode) return false
		const output = join(pluginRoot, 'lib', 'index.js')
		return !existsSync(output) || hasNewerPluginSource(pluginRoot, output)
	})
}

function hasMissingGuiRuntimePlugins() {
	const manifestPath = join(hostRoot, 'runtime', 'plugins.json')
	if (!existsSync(manifestPath)) return true

	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
	const bundled = new Set(Array.isArray(manifest.plugins) ? manifest.plugins : [])
	return discoverGuiPluginNames().some((name) => {
		const pluginRoot = join(hostRoot, 'runtime', 'plugins', name)
		return !bundled.has(name) ||
			!existsSync(join(pluginRoot, 'package.json')) ||
			!existsSync(join(pluginRoot, 'lib', 'index.js'))
	})
}

function discoverGuiPluginNames() {
	const pluginsRoot = join(guiRoot, 'packages', 'cocode')
	if (!existsSync(pluginsRoot)) return []
	return readdirSync(pluginsRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.flatMap((entry) => {
			const manifestPath = join(pluginsRoot, entry.name, 'package.json')
			if (!existsSync(manifestPath)) return []
			const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
			return manifest.private === true && manifest.cocode && typeof manifest.name === 'string'
				? [manifest.name]
				: []
		})
}

function hasNewerPluginSource(root, output) {
	const sourceFiles = [
		join(root, 'package.json'),
		join(root, 'tsconfig.json'),
		join(root, 'tsconfig.build.json'),
		join(root, 'tsdown.config.ts'),
		...listFiles(join(root, 'src')),
	]
	const outputMtime = statSync(output).mtimeMs
	return sourceFiles.some((path) => existsSync(path) && statSync(path).mtimeMs > outputMtime)
}

function listFiles(root) {
	if (!existsSync(root)) return []
	return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
		const path = join(root, entry.name)
		return entry.isDirectory() ? listFiles(path) : [path]
	})
}

function runPnpm(cwd, args, label) {
	process.stdout.write(`${label}…\n`)
	try {
		execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', args, {
			cwd,
			stdio: 'inherit',
			shell: process.platform === 'win32',
		})
	} catch {
		fail(`${label}失败，请在 ${relative(repoRoot, cwd) || '.'} 目录重试：pnpm ${args.join(' ')}`)
	}
}

function fail(message) {
	process.stderr.write(`TUI 启动前检查失败：${message}\n`)
	process.exit(1)
}
