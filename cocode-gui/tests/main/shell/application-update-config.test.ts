import assert from "node:assert/strict"
import test from "node:test"
import {
	resolveApplicationUpdateConfig,
	resolveGitHubRepositoryFromUrl,
} from "../../../src/main/shell/updater/application-update-config"

const base = {
	packaged: true,
	platform: "darwin" as NodeJS.Platform,
	architecture: "arm64",
	defaultRepository: "cocode-agency/cocode",
}

test("enables packaged macOS updates with a ten-minute default interval", () => {
	assert.deepEqual(resolveApplicationUpdateConfig(base), {
		enabled: true,
		repository: "cocode-agency/cocode",
		updateInterval: "10 minutes",
	})
})

test("honors the repository and interval environment overrides", () => {
	assert.deepEqual(
		resolveApplicationUpdateConfig({
			...base,
			environment: {
				ELECTRON_UPDATE_REPOSITORY: "acme/desktop",
				ELECTRON_UPDATE_INTERVAL: "1 hour",
			},
		}),
		{ enabled: true, repository: "acme/desktop", updateInterval: "1 hour" },
	)
})

test("disables development, unsupported platforms, and Windows arm64", () => {
	assert.deepEqual(resolveApplicationUpdateConfig({ ...base, packaged: false }), {
		enabled: false,
		reason: "development",
	})
	assert.deepEqual(resolveApplicationUpdateConfig({ ...base, platform: "linux" }), {
		enabled: false,
		reason: "unsupported-platform",
	})
	assert.deepEqual(
		resolveApplicationUpdateConfig({ ...base, platform: "win32", architecture: "arm64" }),
		{ enabled: false, reason: "unsupported-architecture" },
	)
})

test("allows explicit opt-out and rejects unsafe intervals or repository values", () => {
	assert.deepEqual(
		resolveApplicationUpdateConfig({
			...base,
			environment: { ELECTRON_AUTO_UPDATE: "off" },
		}),
		{ enabled: false, reason: "disabled-by-environment" },
	)
	assert.throws(() =>
		resolveApplicationUpdateConfig({
			...base,
			environment: { ELECTRON_UPDATE_INTERVAL: "1 minute" },
		}),
	)
	assert.throws(() =>
		resolveApplicationUpdateConfig({
			...base,
			environment: { ELECTRON_UPDATE_REPOSITORY: "acme" },
		}),
	)
})

test("normalizes GitHub repository URLs", () => {
	assert.equal(
		resolveGitHubRepositoryFromUrl("git+https://github.com/acme/desktop.git"),
		"acme/desktop",
	)
	assert.equal(resolveGitHubRepositoryFromUrl("https://github.com/acme/desktop"), "acme/desktop")
	assert.throws(() => resolveGitHubRepositoryFromUrl("https://gitlab.com/acme/desktop"))
})
