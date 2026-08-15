import type { DshBootEntryDto } from "../../contracts/ipc/dsh-runtime.contract"

declare global {
	interface Window {
		__DSH_DESKTOP_RUNTIME_ORIGIN__?: string
		__DSH_BOOT__?: {
			readonly rev: string
			readonly entries: readonly DshBootEntryDto[]
		}
	}
}

export {}
