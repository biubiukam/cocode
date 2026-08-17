import assert from "node:assert/strict"
import test from "node:test"
import {
	createMacNotarizeOptions,
	createSquirrelConfig,
	createWindowsSignOptions,
	requireReleaseCredentials,
	resolveMacCliInstallPath,
	resolveMacInstallerSigningIdentity,
	resolveReleaseTarget,
	resolveWindowsSignMode,
	resolveWindowsSignServiceOptions,
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

test("uses the application signing identity as the PKG signing fallback", () => {
	assert.equal(
		resolveMacInstallerSigningIdentity({
			MAC_SIGNING_IDENTITY: "Developer ID Application: Test",
		}),
		"Developer ID Application: Test",
	)
	assert.equal(resolveMacCliInstallPath({}), "/usr/local/bin/cocode")
	assert.equal(
		resolveMacCliInstallPath({ MAC_CLI_INSTALL_PATH: "/custom/bin/cocode" }),
		"/custom/bin/cocode",
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

test("uses the team signing hook for a signed Windows release", () => {
	const options = createWindowsSignOptions({
		RELEASE_REQUIRE_SIGNING: "1",
		WINDOWS_SIGN_MODE: "service",
		WINDOWS_SIGN_SERVICE_URL: "https://signing.example.test",
		WINDOWS_SIGN_DESCRIPTION: "Cocode Desktop",
		WINDOWS_SIGN_WEBSITE: "https://cocode.example.test",
	})
	assert.ok(options)
	assert.equal(options?.hashes?.join(","), "sha256")
	assert.equal(options?.description, "Cocode Desktop")
	assert.equal(options?.website, "https://cocode.example.test")
	assert.equal(options?.debug, false)
	assert.match(options?.hookModulePath ?? "", /windows-sign-hook\.cjs$/)
})

test("service mode does not require or consume PFX values", () => {
	assert.equal(
		resolveWindowsSignMode({
			WINDOWS_SIGN_MODE: "service",
			WINDOWS_CERTIFICATE_FILE: "C:\\ignored\\certificate.pfx",
			WINDOWS_CERTIFICATE_PASSWORD: "ignored",
		}),
		"service",
	)
	assert.doesNotThrow(() =>
		requireReleaseCredentials(
			{ platform: "win32", arch: "x64" },
			{
				RELEASE_REQUIRE_SIGNING: "1",
				WINDOWS_SIGN_MODE: "service",
				WINDOWS_SIGN_SERVICE_URL: "https://signing.example.test",
				WINDOWS_CERTIFICATE_FILE: "C:\\ignored\\certificate.pfx",
				WINDOWS_CERTIFICATE_PASSWORD: "ignored",
			},
		),
	)
})

test("signed Windows releases reject explicit PFX mode", () => {
	assert.throws(() =>
		requireReleaseCredentials(
			{ platform: "win32", arch: "x64" },
			{
				RELEASE_REQUIRE_SIGNING: "1",
				WINDOWS_SIGN_MODE: "pfx",
				WINDOWS_CERTIFICATE_FILE: "C:\\certificate.pfx",
				WINDOWS_CERTIFICATE_PASSWORD: "secret",
			},
		),
	)
})

test("validates service URL and bounded retry settings", () => {
	assert.deepEqual(
		resolveWindowsSignServiceOptions({
			WINDOWS_SIGN_SERVICE_URL: "https://signing.example.test/",
			WINDOWS_SIGN_CREDENTIAL_TARGET: "team/windows-sign",
			WINDOWS_SIGN_TIMEOUT_MS: "45000",
			WINDOWS_SIGN_RETRY_COUNT: "3",
		}),
		{
			serviceUrl: "https://signing.example.test",
			credentialTarget: "team/windows-sign",
			description: "Cocode Desktop",
			hashAlgorithm: "sha256",
			timeoutMs: 45000,
			retryCount: 3,
		},
	)
	assert.throws(() =>
		resolveWindowsSignServiceOptions({ WINDOWS_SIGN_SERVICE_URL: "file:///tmp/sign" }),
	)
	assert.throws(() =>
		resolveWindowsSignServiceOptions({
			WINDOWS_SIGN_SERVICE_URL: "https://signing.example.test",
			WINDOWS_SIGN_TIMEOUT_MS: "0",
		}),
	)
})
