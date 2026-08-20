import path from "node:path"
import type { Configuration } from "electron-builder"
import {
	createMacSignOptions,
	createWindowsSignOptions,
	isReleaseSigningRequired,
	loadReleaseEnvironment,
	resolveGitHubReleaseRepository,
	resolveReleaseTarget,
} from "./scripts/release/release-config"
import {
	finalizeBuilderArtifacts,
	hardenBuilderElectron,
	notarizeBuilderMacApplication,
	stageBuilderApplication,
} from "./scripts/release/release-hooks"

loadReleaseEnvironment()

const target = resolveReleaseTarget()
const macSign = target.platform === "darwin" ? createMacSignOptions() : undefined
const windowsSign = target.platform === "win32" ? createWindowsSignOptions() : undefined
const repository = resolveGitHubReleaseRepository()
const outputDirectory = path.resolve(
	process.env.RELEASE_OUTPUT_DIR ?? path.join("release", target.platform, target.arch),
)
const iconRoot = path.resolve("resources/icons")

if (macSign?.keychain && !process.env.CSC_KEYCHAIN) {
	process.env.CSC_KEYCHAIN = macSign.keychain
}

const config: Configuration = {
	appId: process.env.ELECTRON_APP_ID?.trim() || "com.cocode.desktop",
	productName: "Cocode",
	copyright:
		process.env.RELEASE_COPYRIGHT?.trim() ||
		`Copyright © ${new Date().getFullYear()} Cocode Contributors`,
	asar: false,
	forceCodeSigning: isReleaseSigningRequired(),
	npmRebuild: false,
	directories: {
		buildResources: path.resolve("resources"),
		output: outputDirectory,
	},
	files: [
		{ from: ".vite/build", to: ".vite/build", filter: ["**/*"] },
		{ from: ".vite/renderer", to: ".vite/renderer", filter: ["**/*"] },
		"package.json",
	],
	extraMetadata: {
		main: ".vite/build/main.mjs",
	},
	electronFuses: {
		runAsNode: false,
		enableCookieEncryption: true,
		enableNodeOptionsEnvironmentVariable: false,
		enableNodeCliInspectArguments: false,
		enableEmbeddedAsarIntegrityValidation: true,
		onlyLoadAppFromAsar: false,
	},
	afterExtract: hardenBuilderElectron,
	afterPack: stageBuilderApplication,
	afterSign: notarizeBuilderMacApplication,
	afterAllArtifactBuild: finalizeBuilderArtifacts,
	publish: [
		{
			provider: "github",
			owner: repository.owner,
			repo: repository.name,
			channel: target.arch,
			releaseType: "draft",
			publishAutoUpdate: false,
			tagNamePrefix: "v",
		},
	],
	mac: {
		target: ["zip"],
		artifactName: `Cocode-\${version}-${target.arch}.\${ext}`,
		category: "public.app-category.developer-tools",
		icon: process.env.MACOS_ICON_PATH?.trim() || path.join(iconRoot, "cocode.icns"),
		identity: macSign?.identity ?? null,
		entitlements: macSign?.entitlements,
		entitlementsInherit: macSign?.entitlementsInherit,
		hardenedRuntime: macSign?.hardenedRuntime ?? true,
		preAutoEntitlements: macSign?.preAutoEntitlements ?? true,
		strictVerify: macSign?.strictVerify ?? true,
		notarize: false,
		sign: macSign ? path.resolve("scripts/release/mac-sign-builder.cjs") : null,
	},
	win: {
		target: ["nsis"],
		artifactName: `Cocode-\${version}-${target.arch}.\${ext}`,
		icon: process.env.WINDOWS_ICON_PATH?.trim() || path.join(iconRoot, "cocode.ico"),
		signtoolOptions: windowsSign ?? null,
		signExts: [".exe", ".node"],
		verifyUpdateCodeSignature: Boolean(windowsSign),
		extraResources: [
			{
				from: path.resolve("resources/windows-cli-installer.ps1"),
				to: "windows-cli-installer.ps1",
			},
		],
	},
	nsis: {
		oneClick: true,
		perMachine: false,
		allowElevation: false,
		createDesktopShortcut: true,
		createStartMenuShortcut: true,
		deleteAppDataOnUninstall: false,
		include: path.resolve("resources/installer.nsh"),
		artifactName: `Cocode-\${version}-${target.arch}.\${ext}`,
	},
}

export default config
