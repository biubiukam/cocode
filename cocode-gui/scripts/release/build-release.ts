import { spawnSync } from "node:child_process"
import { mkdirSync, rmSync } from "node:fs"
import * as path from "pathe"
import {
	loadReleaseEnvironment,
	requireReleaseCredentials,
	requireReleaseUpdateRepository,
	resolveReleaseTarget,
	resolveWindowsSignMode,
} from "./release-config"

loadReleaseEnvironment()

const platform = readOption("--platform")
const arch = readOption("--arch")
if (!platform || !arch) throw new Error("Usage: pnpm release:{mac|win}:{x64|arm64}")

const environment: NodeJS.ProcessEnv = {
	...process.env,
	RELEASE_PLATFORM: platform,
	RELEASE_ARCH: arch,
	RELEASE_REQUIRE_SIGNING: "1",
	RELEASE_REQUIRE_NATIVE_ARCH_MATCH: "1",
	FORGE_OUT_DIR: process.env.FORGE_OUT_DIR ?? `release/${platform}/${arch}`,
	COCODE_RUNTIME_ARTIFACT_ROOT:
		process.env.COCODE_RUNTIME_ARTIFACT_ROOT ??
		path.resolve(`release/${platform}/${arch}/runtime`),
}
environment.WINDOWS_SIGN_LEDGER_DIR = path.resolve(environment.FORGE_OUT_DIR, "windows-sign-ledger")
delete environment.COREPACK_ROOT
const target = resolveReleaseTarget(environment)
if (target.platform !== process.platform)
	throw new Error(
		`Release builds must run on ${target.platform}; current host is ${process.platform}.`,
	)
if (target.arch !== process.arch)
	throw new Error(
		`Release builds must run on native ${target.arch}; current process is ${process.arch}.`,
	)
requireReleaseCredentials(target, environment)
requireReleaseUpdateRepository(target, environment)

if (target.platform === "win32" && resolveWindowsSignMode(environment) === "service") {
	rmSync(environment.WINDOWS_SIGN_LEDGER_DIR, { recursive: true, force: true })
	mkdirSync(environment.WINDOWS_SIGN_LEDGER_DIR, { recursive: true })
	const credentialCheck = spawnSync(
		process.execPath,
		["scripts/release/windows-sign-credentials.cjs", "check"],
		{ cwd: process.cwd(), env: environment, stdio: "inherit" },
	)
	if (credentialCheck.error) throw credentialCheck.error
	if (credentialCheck.status !== 0)
		throw new Error("Windows signing service credential preflight failed.")
}

const command = process.platform === "win32" ? "corepack.cmd" : "corepack"
const commandOptions = process.platform === "win32" ? { shell: true } : {}
const runtime = spawnSync(
	command,
	[
		"pnpm@10.34.5",
		"run",
		"build:runtime",
		"--",
		"--clean",
		"--output",
		environment.COCODE_RUNTIME_ARTIFACT_ROOT,
	],
	{ cwd: process.cwd(), env: environment, stdio: "inherit", ...commandOptions },
)
if (runtime.error) throw runtime.error
if (runtime.status !== 0)
	throw new Error(`Runtime build exited with code ${String(runtime.status)}.`)

const forge = spawnSync(
	command,
	[
		"pnpm@10.34.5",
		"exec",
		"electron-forge",
		"make",
		"--platform",
		target.platform,
		"--arch",
		target.arch,
	],
	{ cwd: process.cwd(), env: environment, stdio: "inherit", ...commandOptions },
)
if (forge.error) throw forge.error
process.exitCode = forge.status ?? 1

function readOption(name: string): string | undefined {
	const index = process.argv.indexOf(name)
	return index === -1 ? undefined : process.argv[index + 1]
}
