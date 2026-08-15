import { execFileSync } from "node:child_process"
import process from "node:process"
import os from "node:os"

const minimumNode = [22, 12, 0]
const requiredPnpm = "10.34.5"

function parseVersion(version) {
	return version
		.replace(/^v/, "")
		.split(".")
		.map((part) => Number.parseInt(part, 10) || 0)
}

function atLeast(actual, minimum) {
	for (let index = 0; index < minimum.length; index += 1) {
		if (actual[index] !== minimum[index]) return actual[index] > minimum[index]
	}
	return true
}

function fail(message) {
	console.error(`Environment check failed: ${message}`)
	process.exitCode = 1
}

const nodeVersion = parseVersion(process.version)
if (!atLeast(nodeVersion, minimumNode)) {
	fail(`Node.js ${minimumNode.join(".")}+ is required; found ${process.version}.`)
}

let pnpmVersion = process.env.npm_config_user_agent?.match(/pnpm\/(\d+\.\d+\.\d+)/)?.[1]
if (!pnpmVersion) {
	try {
		pnpmVersion = execFileSync("pnpm", ["--version"], { encoding: "utf8" }).trim()
	} catch {
		fail(`pnpm ${requiredPnpm} is required but pnpm is not available on PATH.`)
	}
}
if (pnpmVersion && pnpmVersion !== requiredPnpm) {
	fail(`pnpm ${requiredPnpm} is required; found ${pnpmVersion}.`)
}

let pythonVersion
try {
	pythonVersion = execFileSync("python3", ["--version"], { encoding: "utf8" }).trim()
} catch {
	fail("Python 3 is required but python3 is not available on PATH.")
}
if (pythonVersion && !/^Python 3(?:\.|$)/.test(pythonVersion)) {
	fail(`Python 3 is required; found ${pythonVersion}.`)
}

const platform = process.platform
const supportedPlatforms = new Set(["darwin", "win32", "linux"])
if (!supportedPlatforms.has(platform)) {
	fail(`Supported platforms are macOS, Windows, and Linux; found ${platform}.`)
}

if (!["x64", "arm64"].includes(process.arch)) {
	fail(`A 64-bit x64 or arm64 runtime is required; found ${process.arch}.`)
}

if (platform === "darwin") {
	const macVersion = parseVersion(os.release())
	// os.release() is Darwin's kernel version, so macOS 12+ maps to Darwin 21+.
	if (!atLeast(macVersion, [21, 0, 0])) {
		fail(`macOS 12 or newer is required; found Darwin ${os.release()}.`)
	}
}

if (platform === "win32") {
	// Electron/Node does not expose the Windows marketing version reliably.
	// The supported Windows baseline is documented and should also be enforced in CI.
	console.warn("Windows baseline: Windows 10 or newer (verify on the CI/runner image).")
}

if (process.exitCode !== 1) {
	console.log(
		`Environment OK: Node ${process.version}, pnpm ${pnpmVersion}, ${pythonVersion}, ${platform}/${process.arch}.`,
	)
}
