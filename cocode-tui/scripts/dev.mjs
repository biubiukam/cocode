#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveCompanionRuntimeLayout } from './companion-layout.mjs'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

loadDotenv(resolve(packageRoot, '.env'))

try {
	const layout = resolveCompanionRuntimeLayout(
		new URL('./companion-runner.mjs', import.meta.url),
	)
	if (!process.env.COCODE_HARNESS_ROOT?.trim()) {
		process.env.COCODE_HARNESS_ROOT = layout.harnessRoot
	}
} catch (error) {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
	process.stderr.write(
		'Build harness: cd ../cocode-harness && pnpm install && pnpm run build\n',
	)
	process.exit(1)
}

if (!process.env.COCODE_HARNESS_CMD?.trim()) {
	process.env.COCODE_HARNESS_CMD = process.execPath
}
if (!process.env.COCODE_HARNESS_ARGS?.trim()) {
	process.env.COCODE_HARNESS_ARGS = [
		'--import',
		'tsx/esm',
		resolve(packageRoot, 'scripts/companion-runner.mjs'),
	].join(',')
}
if (!process.env.COCODE_HARNESS_CWD?.trim()) {
	process.env.COCODE_HARNESS_CWD = process.cwd()
}
if (!process.env.COCODE_HOME?.trim()) {
	process.env.COCODE_HOME = resolve(packageRoot, '.dev/home')
}

const result = spawnSync(
	process.execPath,
	['--import', 'tsx/esm', resolve(packageRoot, 'src/main.tsx'), ...process.argv.slice(2)],
	{ cwd: packageRoot, env: process.env, stdio: 'inherit' },
)

if (result.error) {
	process.stderr.write(`Cocode TUI failed to start: ${result.error.message}\n`)
	process.exit(1)
}
process.exit(result.status ?? 1)

function loadDotenv(path) {
	let text
	try {
		text = readFileSync(path, 'utf8')
	} catch {
		return
	}
	for (const line of text.split('\n')) {
		const trimmed = line.trim()
		if (trimmed === '' || trimmed.startsWith('#')) continue
		const eq = trimmed.indexOf('=')
		if (eq <= 0) continue
		const key = trimmed.slice(0, eq).trim()
		let value = trimmed.slice(eq + 1).trim()
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1)
		}
		if (process.env[key] === undefined) process.env[key] = value
	}
}
