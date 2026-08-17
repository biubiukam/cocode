import { homedir } from "node:os"
import * as path from "pathe"

const DSH_HOME_DIR_NAME = ".dsh"
const DSH_HOME_ENV = "DSH_HOME"

/**
 * Resolve the Harness home with the same precedence as the official runtime:
 * an explicit value, a non-blank DSH_HOME environment value, then ~/.dsh.
 *
 * The Electron main bundle keeps this small resolver locally because the
 * official home-paths package belongs to the sidecar deployment closure and
 * is not a renderer/main application dependency.
 */
export function resolveDshHome(
	configured?: string,
	env: Readonly<Record<string, string | undefined>> = process.env,
): string {
	const fromEnv = env[DSH_HOME_ENV]
	const selected =
		configured ??
		(fromEnv !== undefined && fromEnv.trim().length > 0
			? fromEnv
			: path.join(homedir(), DSH_HOME_DIR_NAME))

	return path.resolve(expandHomePath(selected))
}

function expandHomePath(value: string): string {
	if (value === "~") return homedir()
	if (value.startsWith("~/") || value.startsWith("~\\")) {
		return path.join(homedir(), value.slice(2))
	}
	return value
}
