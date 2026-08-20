export const MAIN_RUNTIME_DEPENDENCIES = [
	"@cocode-agency/host-supervisor",
	"electron-updater",
	"pino",
	"better-sqlite3",
	"node-addon-api",
] as const

export const MAIN_BUNDLED_DEPENDENCIES = ["tar", "yaml", "zod"] as const
