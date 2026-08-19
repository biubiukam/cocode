import type { DshRuntimeApi } from "./dsh-runtime.contract"
import type { DatabaseApi } from "./database.contract"
import type { AccountApi } from "./account.contract"
import type { ShortcutsApi } from "./shortcuts.contract"
import type { DiagnosticsApi } from "./diagnostics.contract"
import type { TuiApi } from "./tui.contract"
import type { ExternalDshApi, SharedDshApi } from "./external-dsh.contract"
import type { LocaleApi } from "./locale.contract"
import type { LocalFilesApi } from "./local-files.contract"

export interface DesktopApi {
	readonly database: DatabaseApi
	readonly dsh: DshRuntimeApi
	readonly account: AccountApi
	readonly shortcuts: ShortcutsApi
	readonly diagnostics: DiagnosticsApi
	readonly tui: TuiApi
	readonly sharedDsh: SharedDshApi
	/** @deprecated Use sharedDsh. */
	readonly externalDsh: ExternalDshApi
	readonly locale: LocaleApi
	readonly localFiles: LocalFilesApi
}
