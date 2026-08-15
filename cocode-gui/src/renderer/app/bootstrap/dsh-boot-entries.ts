import type { DshBootEntryDto } from "../../../contracts/ipc/dsh-runtime.contract"

export const DSH_CLIENT_HMR_ID = "@deepseek-ai/dsh-client-hmr"

/**
 * The HMR client subscribes to the dev-only `/plugins/events` SSE route. A
 * packaged Renderer loads from `file://`, so that relative route would become
 * `file:///plugins/events`; the packaged shell has no need for HMR anyway.
 */
export function selectDshBootEntries(
	entries: readonly DshBootEntryDto[],
	production: boolean,
): readonly DshBootEntryDto[] {
	if (!production) return entries
	return entries.filter((entry) => entry.id !== DSH_CLIENT_HMR_ID)
}
