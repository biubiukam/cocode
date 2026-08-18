import { homedir } from "node:os"
import * as path from "pathe"

const COCODE_HOME_DIR_NAME = ".cocode"
const COCODE_HOME_ENV = "COCODE_HOME"
const COCODE_DSH_HOME_ENV = "COCODE_DSH_HOME"
const LEGACY_COCODE_DSH_HOME_ENV = "COCODE_DSH_SOURCE_HOME"
const DSH_HOME_ENV = "DSH_HOME"

/** Backward-compatible official DSH resolver (`DSH_HOME` / `~/.dsh`). */
export function resolveDshHome(
	configured?: string,
	env: Readonly<Record<string, string | undefined>> = process.env,
): string {
	const fromEnv = env[DSH_HOME_ENV]
	const selected =
		configured ??
		(fromEnv !== undefined && fromEnv.trim().length > 0
			? fromEnv
			: path.join(homedir(), ".dsh"))
	return path.resolve(expandHomePath(selected))
}

/** Resolve Cocode's embedded home without consulting ambient DSH_HOME. */
export function resolveCocodeHome(
	configured?: string,
	env: Readonly<Record<string, string | undefined>> = process.env,
): string {
	const fromEnv = env[COCODE_HOME_ENV]
	const selected =
		configured ??
		(fromEnv !== undefined && fromEnv.trim().length > 0
			? fromEnv
			: path.join(homedir(), COCODE_HOME_DIR_NAME))

	return path.resolve(expandHomePath(selected))
}

/** Resolve the shared DSH data home used by Cocode's cocode profile. */
export function resolveCocodeDshHome(
	configured?: string,
	env: Readonly<Record<string, string | undefined>> = process.env,
): string {
	const fromEnv = env[COCODE_DSH_HOME_ENV] ?? env[LEGACY_COCODE_DSH_HOME_ENV]
	const selected =
		configured ??
		(fromEnv !== undefined && fromEnv.trim().length > 0
			? fromEnv
			: path.join(homedir(), ".dsh"))
	return path.resolve(expandHomePath(selected))
}

/** Backward-compatible alias for callers that still use the old reader name. */
export const resolveOfficialDshSourceHome = resolveCocodeDshHome

function expandHomePath(value: string): string {
	if (value === "~") return homedir()
	if (value.startsWith("~/") || value.startsWith("~\\")) {
		return path.join(homedir(), value.slice(2))
	}
	return value
}
