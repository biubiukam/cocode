import type { DshRuntimeApi } from "./dsh-runtime.contract"
import type { DatabaseApi } from "./database.contract"

export interface DesktopApi {
	readonly database: DatabaseApi
	readonly dsh: DshRuntimeApi
}
