import type { DshRuntimeBootstrapDto } from "../../../contracts/ipc/dsh-runtime.contract"
import { parseDshRuntimeBootstrap } from "../../../contracts/schemas/dsh-runtime.schema"

export function isDesktopDshRuntime(): boolean {
	return window.desktopApi?.dsh !== undefined
}

export async function resolveDshBootstrap(): Promise<DshRuntimeBootstrapDto> {
	if (isDesktopDshRuntime()) return window.desktopApi.dsh.getBootstrap()

	const response = await fetch("/__cocode/dsh-bootstrap", { cache: "no-store" })
	if (!response.ok) {
		let detail = `HTTP ${String(response.status)}`
		try {
			const payload = (await response.json()) as { readonly error?: string }
			if (payload.error) detail = payload.error
		} catch {
			// Keep the status-only message when the proxy body is not JSON.
		}
		throw new Error(
			`DSH runtime bootstrap request failed (${detail}). Ensure \`make dev gui-web\` is running.`,
		)
	}

	return parseDshRuntimeBootstrap(await response.json())
}
