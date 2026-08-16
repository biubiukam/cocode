import type { DshRuntimeBootstrapDto } from "../../../contracts/ipc/dsh-runtime.contract"
import { parseDshRuntimeBootstrap } from "../../../contracts/schemas/dsh-runtime.schema"

const WEB_BOOTSTRAP_PATH = "/__cocode/dsh-bootstrap"

export function isDesktopDshBridgeAvailable(): boolean {
	return window.desktopApi?.dsh !== undefined
}

export async function loadDshBootstrap(): Promise<DshRuntimeBootstrapDto> {
	if (isDesktopDshBridgeAvailable()) {
		return window.desktopApi.dsh.getBootstrap()
	}

	const response = await fetch(WEB_BOOTSTRAP_PATH, { cache: "no-store" })
	if (!response.ok) {
		let detail = `HTTP ${String(response.status)}`
		try {
			const payload = (await response.json()) as { error?: string }
			if (payload.error !== undefined && payload.error.length > 0) detail = payload.error
		} catch {
			// Ignore malformed error payloads.
		}
		throw new Error(`DSH web bootstrap request failed (${detail}).`)
	}

	return parseDshRuntimeBootstrap(await response.json())
}

/** Desktop rewrites through preload; browser dev proxies DSH routes on the Vite origin. */
export function resolveRendererRuntimeOrigin(bootstrap: DshRuntimeBootstrapDto): string {
	if (isDesktopDshBridgeAvailable()) return new URL(bootstrap.origin).origin
	return window.location.origin
}
