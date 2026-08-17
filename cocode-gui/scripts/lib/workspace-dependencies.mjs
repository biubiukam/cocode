import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
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
	if (requiredPaths.every((requiredPath) => existsSync(requiredPath))) return

	console.log(`[supervisor-build] installing ${label} dependencies`)
	execFileSync(
		process.platform === "win32" ? "corepack.cmd" : "corepack",
		["pnpm@10.34.5", "install", "--frozen-lockfile"],
		shellCommandOptions({ cwd: root, stdio: "inherit" }),
	)
}
