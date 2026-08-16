import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { hashFiles, listFiles, sha256File } from "./runtime-build-helpers.mjs"

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const supervisorRoot = path.resolve(repositoryRoot, "../cocode-host-supervisor")
const defaultManifestPath = path.join(
	repositoryRoot,
	".cache",
	"cocode",
	"supervisor-build-manifest.json",
)

export function buildSupervisor({ clean = false, manifestPath = defaultManifestPath } = {}) {
	if (!existsSync(supervisorRoot))
		throw new Error(`Supervisor checkout not found: ${supervisorRoot}`)
	const inputFiles = [
		"package.json",
		"pnpm-lock.yaml",
		"packages/host-supervisor/tsconfig.json",
		"packages/host-supervisor/tsconfig.build.json",
		"packages/host-supervisor/scripts/build.mjs",
		...listFiles(
			path.join(supervisorRoot, "packages", "host-supervisor", "src"),
			"packages/host-supervisor/src",
		),
	]
	const inputHash = hashFiles(supervisorRoot, inputFiles)
	const outputFiles = [
		...listFiles(
			path.join(supervisorRoot, "packages", "host-supervisor", "lib"),
			"packages/host-supervisor/lib",
		),
		...listFiles(
			path.join(supervisorRoot, "packages", "host-supervisor", "bin"),
			"packages/host-supervisor/bin",
		),
		...listFiles(path.join(supervisorRoot, "runtime", "plugins"), "runtime/plugins"),
	]
	const previous = existsSync(manifestPath)
		? JSON.parse(readFileSync(manifestPath, "utf8"))
		: undefined
	const valid =
		!clean &&
		previous?.inputHash === inputHash &&
		outputFiles.every(
			(file) => previous.artifacts?.[file] === sha256File(path.join(supervisorRoot, file)),
		)
	if (!valid) {
		console.log("[supervisor-build] building @cocode/host-supervisor")
		execFileSync(
			process.platform === "win32" ? "corepack.cmd" : "corepack",
			["pnpm@10.34.5", "run", "build"],
			{ cwd: supervisorRoot, stdio: "inherit" },
		)
	}
	const artifacts = Object.fromEntries(
		[
			...listFiles(
				path.join(supervisorRoot, "packages", "host-supervisor", "lib"),
				"packages/host-supervisor/lib",
			),
			...listFiles(
				path.join(supervisorRoot, "packages", "host-supervisor", "bin"),
				"packages/host-supervisor/bin",
			),
			...listFiles(path.join(supervisorRoot, "runtime", "plugins"), "runtime/plugins"),
		].map((file) => [file, sha256File(path.join(supervisorRoot, file))]),
	)
	if (!artifacts["packages/host-supervisor/lib/bin.js"])
		throw new Error("Supervisor build did not emit packages/host-supervisor/lib/bin.js.")
	mkdirSync(path.dirname(manifestPath), { recursive: true })
	writeFileSync(
		manifestPath,
		`${JSON.stringify({ schemaVersion: 1, inputHash, artifacts }, null, 2)}\n`,
	)
	return { manifestPath, manifest: { schemaVersion: 1, inputHash, artifacts }, supervisorRoot }
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(path.resolve(invokedPath)).href) {
	buildSupervisor({ clean: process.argv.includes("--clean") })
}
