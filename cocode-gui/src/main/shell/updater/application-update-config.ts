export type ApplicationUpdateDisabledReason =
	| "development"
	| "disabled-by-environment"
	| "unsupported-platform"
	| "unsupported-architecture"

export type ApplicationUpdateConfig =
	| {
			readonly enabled: false
			readonly reason: ApplicationUpdateDisabledReason
	  }
	| {
			readonly enabled: true
			readonly repository: string
			readonly updateInterval: string
	  }

export interface ResolveApplicationUpdateConfigOptions {
	readonly packaged: boolean
	readonly platform: NodeJS.Platform
	readonly architecture: string
	readonly defaultRepository: string
	readonly embeddedWindowsArm64Repository?: string
	readonly environment?: NodeJS.ProcessEnv
}

export function resolveApplicationUpdateConfig({
	packaged,
	platform,
	architecture,
	defaultRepository,
	embeddedWindowsArm64Repository,
	environment = process.env,
}: ResolveApplicationUpdateConfigOptions): ApplicationUpdateConfig {
	if (!packaged) return { enabled: false, reason: "development" }
	if (isDisabled(environment.ELECTRON_AUTO_UPDATE)) {
		return { enabled: false, reason: "disabled-by-environment" }
	}
	if (platform !== "darwin" && platform !== "win32") {
		return { enabled: false, reason: "unsupported-platform" }
	}
	if (platform === "win32" && architecture !== "x64" && architecture !== "arm64") {
		return { enabled: false, reason: "unsupported-architecture" }
	}
	if (platform === "darwin" && architecture !== "x64" && architecture !== "arm64") {
		return { enabled: false, reason: "unsupported-architecture" }
	}

	const repository =
		(platform === "win32" && architecture === "arm64"
			? environment.ELECTRON_UPDATE_REPOSITORY_WIN32_ARM64?.trim() ||
			  embeddedWindowsArm64Repository?.trim()
			: undefined) ||
		environment.ELECTRON_UPDATE_REPOSITORY?.trim() ||
		defaultRepository
	assertGitHubRepository(repository)
	const updateInterval = environment.ELECTRON_UPDATE_INTERVAL?.trim() || "10 minutes"
	assertUpdateInterval(updateInterval)

	return { enabled: true, repository, updateInterval }
}

export function resolveGitHubRepositoryFromUrl(repositoryUrl: string): string {
	const match = repositoryUrl.trim().match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i)
	if (!match) throw new Error(`Unsupported GitHub repository URL: ${repositoryUrl}`)
	const repository = `${match[1]}/${match[2]}`
	assertGitHubRepository(repository)
	return repository
}

function assertGitHubRepository(repository: string): void {
	const parts = repository.split("/")
	if (
		parts.length !== 2 ||
		parts.some((part) => !part || part.trim() !== part || /\s/.test(part))
	) {
		throw new Error(`GitHub repository must use the owner/name format: ${repository}`)
	}
}

function isDisabled(value: string | undefined): boolean {
	return value !== undefined && ["0", "false", "no", "off"].includes(value.trim().toLowerCase())
}

function assertUpdateInterval(value: string): void {
	const match = value.match(/^(\d+)\s+(minute|minutes|hour|hours|day|days)$/i)
	if (!match) {
		throw new Error(
			`ELECTRON_UPDATE_INTERVAL must be a human-friendly interval such as "10 minutes": ${value}`,
		)
	}
	const amount = Number(match[1])
	const unit = match[2].toLowerCase()
	if ((unit === "minute" || unit === "minutes") && amount < 5) {
		throw new Error("ELECTRON_UPDATE_INTERVAL must be at least 5 minutes.")
	}
}
