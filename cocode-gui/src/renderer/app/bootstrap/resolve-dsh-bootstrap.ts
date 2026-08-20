import type { DshRuntimeBootstrapDto } from "../../../contracts/ipc/dsh-runtime.contract"
import { parseDshRuntimeBootstrap } from "../../../contracts/schemas/dsh-runtime.schema"
import { readJsonResponse } from "./read-json-response"

export function isDesktopDshRuntime(): boolean {
	return window.desktopApi?.dsh !== undefined
}

function isElectronDesktopRenderer(): boolean {
	return (
		typeof __COCODE_ELECTRON_DESKTOP__ !== "undefined" && __COCODE_ELECTRON_DESKTOP__ === true
	)
}

export async function resolveDshBootstrap(): Promise<DshRuntimeBootstrapDto> {
	if (isDesktopDshRuntime()) return window.desktopApi.dsh.getBootstrap()
	if (isElectronDesktopRenderer()) {
		throw new Error(
			"Electron preload bridge is unavailable. The preload script failed to load.",
		)
	}

	const response = await fetch("/__cocode/dsh-bootstrap", { cache: "no-store" })
	return parseDshRuntimeBootstrap(
		await readJsonResponse<{
			readonly origin: string
			readonly boot: unknown
			readonly themePreference: unknown
		}>(response, "DSH runtime bootstrap request"),
	)
}
