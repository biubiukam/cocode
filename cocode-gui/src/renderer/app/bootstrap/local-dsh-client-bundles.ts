const CLIENT_PACKAGE_PREFIX = "@deepseek-ai/dsh-client-"

const LOCAL_CLIENT_BUNDLES = new Map<string, string>([
	...[
		"connection",
		"hmr",
		"locale",
		"modules",
		"runtime",
		"ui-agent-preset",
		"ui-commands",
		"ui-conversation",
		"ui-deliverables",
		"ui-directory-picker-browse",
		"ui-directory-picker-native",
		"ui-goal",
		"ui-input-trigger",
		"ui-jobs",
		"ui-layout",
		"ui-message-feedback",
		"ui-model-selection",
		"ui-permission-presets",
		"ui-plan",
		"ui-settings",
		"ui-settings-general",
		"ui-settings-models",
		"ui-settings-plugin-inventory",
		"ui-settings-plugins",
		"ui-sidebar",
		"ui-skill",
		"ui-subagent",
		"ui-theme",
		"ui-tool",
		"ui-trajectory",
		"ui-user-questions",
		"ui-workflow-run",
		"ui-workspace",
	].map((directory) => [`${CLIENT_PACKAGE_PREFIX}${directory}`, directory] as const),
	["cocode-sidebar", "cocode/cocode-sidebar"],
	["cocode-account", "cocode/cocode-account"],
])

export function resolveLocalDshClientBundleUrl(packageId: string): string | undefined {
	const directory = LOCAL_CLIENT_BUNDLES.get(packageId)
	if (directory === undefined) return undefined
	return new URL(`./dsh-client/${directory}/client.js`, window.location.href).href
}
