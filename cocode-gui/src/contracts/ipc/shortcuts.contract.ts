export const shortcutsChannels = {
	sync: "shortcuts:sync",
	triggered: "shortcuts:triggered",
} as const

export type GlobalBindingDto = {
	readonly commandId: string
	readonly accelerator: string
}

export type SyncShortcutsRequest = {
	readonly bindings: readonly GlobalBindingDto[]
}

export type ShortcutConflictDto = {
	readonly accelerator: string
	readonly reason: string
}

export type SyncShortcutsResult = {
	readonly ok: boolean
	readonly conflicts?: readonly ShortcutConflictDto[]
}

export type ShortcutsApi = {
	readonly sync: (request: SyncShortcutsRequest) => Promise<SyncShortcutsResult>
	readonly onTriggered: (listener: (commandId: string) => void) => () => void
}
