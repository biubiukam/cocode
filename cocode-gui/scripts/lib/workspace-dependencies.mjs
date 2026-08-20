import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import * as path from "pathe"
import { shellCommandOptions } from "./child-process-options.mjs"

/**
 * Install a sibling workspace's dependencies when its required artifacts are
 * missing. Installation runs through Corepack at the pinned pnpm version so
 * the result matches the workspace's committed lockfile.
 * @param root - workspace directory containing package.json and pnpm-lock.yaml.
 * @param label - human-readable workspace name used in progress output.
 * @param requiredPaths - files whose presence marks the install as complete.
 */
export function ensureWorkspaceDependencies({ root, label, requiredPaths }) {
	if (requiredPaths.every((requiredPath) => existsSync(requiredPath))) return false

	console.log(`[workspace-deps] installing ${label} dependencies`)
	execFileSync(
		process.platform === "win32" ? "corepack.cmd" : "corepack",
		["pnpm@10.34.5", "install", "--frozen-lockfile"],
		shellCommandOptions({ cwd: root, stdio: "inherit" }),
	)
	return true
}

/**
 * node-pty can load its Windows native modules from build/Release,
 * build/Debug, or prebuilds/win32-<arch>. The ConPTY companion binaries live
 * beside whichever conpty.node is selected. A sibling workspace can retain a
 * valid JS install while those architecture-specific files are missing, so
 * repair the native files explicitly before the runtime is staged.
 */
export function ensureWindowsNodePtyNatives({
	root,
	platform = process.platform,
	arch = process.arch,
	force = false,
	run = execFileSync,
} = {}) {
	if (platform !== "win32") return false
	const packageRoot = path.join(root, "node_modules", "node-pty")
	if (!force && resolveWindowsNodePtyMissing(packageRoot, arch).length === 0) return false

	console.log(`[workspace-deps] rebuilding node-pty natives for win32/${arch}`)
	run(
		process.platform === "win32" ? "corepack.cmd" : "corepack",
		["pnpm@10.34.5", "rebuild", "node-pty"],
		{
			...shellCommandOptions({ cwd: root, stdio: "inherit" }),
			env: { ...process.env, npm_config_arch: arch },
		},
	)

	const missing = resolveWindowsNodePtyMissing(packageRoot, arch)
	if (missing.length > 0) {
		throw new Error(
			[
				`node-pty Windows native files are missing after rebuild for win32/${arch}.`,
				"Run the pinned pnpm rebuild in the host-supervisor workspace and ensure node-pty build scripts are allowed:",
				`  corepack pnpm@10.34.5 --dir ${root} rebuild node-pty`,
				...missing.map((file) => `  missing: ${file}`),
			].join("\n"),
		)
	}
	return true
}

function resolveWindowsNodePtyMissing(packageRoot, arch) {
	const searchDirectories = [
		path.join(packageRoot, "build", "Release"),
		path.join(packageRoot, "build", "Debug"),
		path.join(packageRoot, "prebuilds", `win32-${arch}`),
	]
	const resolveDirectory = (name) =>
		searchDirectories.find((directory) => existsSync(path.join(directory, name)))
	const missing = []
	const ptyDirectory = resolveDirectory("pty.node")
	if (!ptyDirectory) {
		missing.push(`pty.node (searched: ${searchDirectories.join(", ")})`)
	} else if (!existsSync(path.join(ptyDirectory, "winpty-agent.exe"))) {
		missing.push(path.join(ptyDirectory, "winpty-agent.exe"))
	}
	const conptyDirectory = resolveDirectory("conpty.node")
	if (!conptyDirectory) {
		missing.push(`conpty.node (searched: ${searchDirectories.join(", ")})`)
	} else {
		for (const companion of ["conpty.dll", "OpenConsole.exe"]) {
			const file = path.join(conptyDirectory, "conpty", companion)
			if (!existsSync(file)) missing.push(file)
		}
	}
	return missing
}
