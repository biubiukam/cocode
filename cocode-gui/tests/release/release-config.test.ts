import assert from "node:assert/strict"
import test from "node:test"
import {
	createMacNotarizeOptions,
	createSquirrelConfig,
	createWindowsSignOptions,
	requireReleaseCredentials,
	resolveReleaseTarget,
} from "../../scripts/release/release-config"

test("resolves only native darwin and win32 targets", () => {
	assert.deepEqual(resolveReleaseTarget({ RELEASE_PLATFORM: "darwin", RELEASE_ARCH: "x64" }), {
		platform: "darwin",
		arch: "x64",
	})
	assert.deepEqual(resolveReleaseTarget({ RELEASE_PLATFORM: "win32", RELEASE_ARCH: "arm64" }), {
		platform: "win32",
		arch: "arm64",
	})
	assert.throws(() => resolveReleaseTarget({ RELEASE_PLATFORM: "linux", RELEASE_ARCH: "x64" }))
})

test("requires complete signing credentials", () => {
	assert.throws(() =>
		requireReleaseCredentials(
			{ platform: "darwin", arch: "arm64" },
			{
				RELEASE_REQUIRE_SIGNING: "1",
				MAC_SIGNING_IDENTITY: "Developer ID Application: Test",
			},
		),
	)
	assert.throws(() =>
		requireReleaseCredentials(
			{ platform: "win32", arch: "x64" },
			{ RELEASE_REQUIRE_SIGNING: "1" },
		),
	)
	assert.deepEqual(
		createMacNotarizeOptions({
			APPLE_API_KEY: "key",
			APPLE_API_KEY_ID: "id",
			APPLE_API_ISSUER: "issuer",
		}),
		{ appleApiKey: "key", appleApiKeyId: "id", appleApiIssuer: "issuer" },
	)
	assert.throws(() => createMacNotarizeOptions({ APPLE_API_KEY: "key" }))
})

test("generates architecture-safe Squirrel names", () => {
	assert.equal(
		createSquirrelConfig("1.2.3", { RELEASE_ARCH: "x64" }).setupExe,
		"Cocode-Desktop-1.2.3-win32-x64-Setup.exe",
	)
	assert.equal(
		createSquirrelConfig("1.2.3", { RELEASE_ARCH: "arm64" }).setupMsi,
		"Cocode-Desktop-1.2.3-arm64-Setup.msi",
	)
})

test("rejects partial Windows certificate configuration", () => {
	assert.throws(() => createWindowsSignOptions({ WINDOWS_CERTIFICATE_PASSWORD: "secret" }))
})

test("treats empty Windows certificate values as unconfigured", () => {
	assert.equal(
		createWindowsSignOptions({
			WINDOWS_CERTIFICATE_FILE: "",
			WINDOWS_CERTIFICATE_PASSWORD: "",
		}),
		undefined,
	)
})
