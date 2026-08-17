/**
 * Windows exposes Corepack and pnpm as .cmd shims. Node cannot execute those
 * shims through execFileSync/spawnSync without going through a shell.
 */
export function shellCommandOptions(options = {}) {
	return process.platform === "win32" ? { ...options, shell: true } : options
}
