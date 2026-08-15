import type { DshRuntimeApi } from "./dsh-runtime.contract"
import type { DatabaseApi } from "./database.contract"
import type { AccountApi } from "./account.contract"

export interface DesktopApi {
	readonly database: DatabaseApi
	readonly dsh: DshRuntimeApi
	readonly account: AccountApi
}
