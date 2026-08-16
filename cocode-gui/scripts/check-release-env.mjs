import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

const root = process.cwd()
const example = path.join(root, ".env.release.example")
const alias = path.join(root, "env.list.example")
const allowed = new Set([
	"ELECTRON_APP_ID",
	"RELEASE_COPYRIGHT",
	"RELEASE_DESCRIPTION",
	"RELEASE_HOMEPAGE",
	"ELECTRON_UPDATE_REPOSITORY",
	"ELECTRON_AUTO_UPDATE",
	"ELECTRON_UPDATE_INTERVAL",
	"MACOS_ICON_PATH",
	"WINDOWS_ICON_PATH",
	"DMG_ICON_PATH",
	"DMG_BACKGROUND_PATH",
	"DMG_FORMAT",
	"DMG_ICON_SIZE",
	"MAC_SIGNING_IDENTITY",
	"MAC_SIGNING_KEYCHAIN",
	"MAC_ENTITLEMENTS_PATH",
	"MAC_PLUGIN_ENTITLEMENTS_PATH",
	"APPLE_API_KEY",
	"APPLE_API_KEY_ID",
	"APPLE_API_ISSUER",
	"APPLE_KEYCHAIN_PROFILE",
	"APPLE_KEYCHAIN",
	"APPLE_ID",
	"APPLE_APP_SPECIFIC_PASSWORD",
	"APPLE_TEAM_ID",
	"WINDOWS_CERTIFICATE_FILE",
	"WINDOWS_CERTIFICATE_PASSWORD",
	"WINDOWS_TIMESTAMP_SERVER",
	"WINDOWS_SIGN_WITH_PARAMS",
])

function parse(file) {
	const rows = []
	for (const [index, line] of readFileSync(file, "utf8").split(/\r?\n/).entries()) {
		const trimmed = line.trim()
		if (!trimmed || trimmed.startsWith("#")) continue
		const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
		if (!match) throw new Error(`${file}:${index + 1} must use KEY=value syntax.`)
		if (!allowed.has(match[1]))
			throw new Error(`${file}:${index + 1} uses unknown key ${match[1]}.`)
		rows.push(match)
	}
	return rows
}

if (!existsSync(example) || !existsSync(alias))
	throw new Error("Both release env example files are required.")
const left = parse(example)
const right = parse(alias)
const normalize = (rows) => rows.map(([key, value]) => `${key}=${value}`).join("\n")
if (normalize(left) !== normalize(right))
	throw new Error("env.list.example must mirror .env.release.example exactly.")
console.log(`Release env schema OK: ${left.length} variables.`)
