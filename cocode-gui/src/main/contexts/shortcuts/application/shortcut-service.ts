import { globalShortcut, type BrowserWindow, type WebContents } from "electron"
import type {
	GlobalBindingDto,
	ShortcutConflictDto,
	SyncShortcutsResult,
} from "../../../../contracts/ipc/shortcuts.contract"
import { shortcutsChannels } from "../../../../contracts/ipc/shortcuts.contract"

const ALLOWED_GLOBAL_COMMANDS = new Set(["cocode.newSession"])

export interface GlobalShortcutHost {
	register(accelerator: string, callback: () => void): boolean
	unregister(accelerator: string): void
	isRegistered(accelerator: string): boolean
}

const electronGlobalShortcut: GlobalShortcutHost = {
	register: (accelerator, callback) => globalShortcut.register(accelerator, callback),
	unregister: (accelerator) => {
		globalShortcut.unregister(accelerator)
	},
	isRegistered: (accelerator) => globalShortcut.isRegistered(accelerator),
}

/** Owns the process-local Electron global shortcut registrations. */
export class ShortcutService {
	private registrations = new Map<string, string>()

	constructor(
		private readonly getWindow: () => BrowserWindow | null,
		private readonly host: GlobalShortcutHost = electronGlobalShortcut,
	) {}

	sync(bindings: readonly GlobalBindingDto[], sender?: WebContents): SyncShortcutsResult {
		const window = this.getWindow()
		if (window !== null && sender !== undefined && sender.id !== window.webContents.id) {
			return { ok: false, conflicts: [{ accelerator: "", reason: "unauthorized-sender" }] }
		}

		const conflicts: ShortcutConflictDto[] = []
		const next = new Map<string, string>()
		for (const binding of bindings) {
			if (!ALLOWED_GLOBAL_COMMANDS.has(binding.commandId)) {
				conflicts.push({
					accelerator: binding.accelerator,
					reason: "command-not-global-capable",
				})
				continue
			}
			if (next.has(binding.accelerator)) {
				conflicts.push({
					accelerator: binding.accelerator,
					reason: "duplicate-accelerator",
				})
				continue
			}
			next.set(binding.accelerator, binding.commandId)
		}
		if (conflicts.length > 0) return { ok: false, conflicts }

		const previous = new Map(this.registrations)
		const changed = [...previous.entries()].filter(
			([accelerator, commandId]) => next.get(accelerator) !== commandId,
		)
		const added = [...next.entries()].filter(
			([accelerator, commandId]) => previous.get(accelerator) !== commandId,
		)
		for (const [accelerator] of changed) this.host.unregister(accelerator)

		const registered: string[] = []
		for (const [accelerator, commandId] of added) {
			let ok = false
			try {
				ok = this.host.register(accelerator, () => {
					this.trigger(commandId)
				})
			} catch {
				ok = false
			}
			if (!ok) {
				for (const registeredAccelerator of registered)
					this.host.unregister(registeredAccelerator)
				for (const [oldAccelerator, oldCommandId] of previous) {
					if (this.host.isRegistered(oldAccelerator)) continue
					this.host.register(oldAccelerator, () => {
						this.trigger(oldCommandId)
					})
				}
				this.registrations = previous
				return {
					ok: false,
					conflicts: [{ accelerator, reason: "os-registration-failed" }],
				}
			}
			registered.push(accelerator)
		}
		this.registrations = next
		return { ok: true }
	}

	dispose(): void {
		for (const accelerator of this.registrations.keys()) this.host.unregister(accelerator)
		this.registrations.clear()
	}

	private trigger(commandId: string): void {
		const window = this.getWindow()
		if (window === null || window.isDestroyed()) return
		if (window.isMinimized()) window.restore()
		if (!window.isVisible()) window.show()
		window.focus()
		if (!window.webContents.isDestroyed())
			window.webContents.send(shortcutsChannels.triggered, commandId)
	}
}
