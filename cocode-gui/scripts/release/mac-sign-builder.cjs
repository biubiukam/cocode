const path = require("node:path")
const { signAsync } = require("@electron/osx-sign")

module.exports = async function macSignBuilder(configuration) {
	const entitlements = path.resolve(
		process.env.MAC_ENTITLEMENTS_PATH || "resources/entitlements.mac.plist",
	)
	const pluginEntitlements = path.resolve(
		process.env.MAC_PLUGIN_ENTITLEMENTS_PATH || "resources/entitlements.mac.plugin.plist",
	)
	await signAsync({
		...configuration,
		optionsForFile(filePath) {
			return {
				entitlements:
					filePath.includes("Helper (Plugin).app") || filePath.includes("node-pty")
						? pluginEntitlements
						: entitlements,
				hardenedRuntime: true,
			}
		},
	})
}
