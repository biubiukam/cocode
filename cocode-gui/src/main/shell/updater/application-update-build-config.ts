declare const __COCODE_UPDATE_REPOSITORY_WIN32_ARM64__: string | undefined

export const embeddedWindowsArm64UpdateRepository =
	typeof __COCODE_UPDATE_REPOSITORY_WIN32_ARM64__ === "string"
		? __COCODE_UPDATE_REPOSITORY_WIN32_ARM64__.trim()
		: ""
