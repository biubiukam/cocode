import type { ForgeConfig } from "@electron-forge/shared-types"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, readdirSync } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import { MakerDMG } from "@electron-forge/maker-dmg"
import { MakerSquirrel } from "@electron-forge/maker-squirrel"
import { MakerZIP } from "@electron-forge/maker-zip"
import { MakerDeb } from "@electron-forge/maker-deb"
import { MakerRpm } from "@electron-forge/maker-rpm"
import { VitePlugin } from "@electron-forge/plugin-vite"
import { FusesPlugin } from "@electron-forge/plugin-fuses"
import { FuseV1Options, FuseVersion } from "@electron/fuses"
import packageMetadata from "./package.json"
import {
	createDmgConfig,
	createMacNotarizeOptions,
	createMacSignOptions,
	createSquirrelConfig,
	createWindowsSignOptions,
	loadReleaseEnvironment,
	resolveGitHubReleaseRepository,
	resolveReleaseTarget,
} from "./scripts/release/release-config"
import {
	appendChecksumManifest,
	addMacPkgArtifact,
	cleanupWindowsSignLedger,
	notarizeFinalMacArtifacts,
	normalizeArtifactNames,
	prepareMacDmgDependencies,
	selectGitHubReleaseArtifacts,
	verifyMadeArtifacts,
	verifyPackagedApplication,
} from "./scripts/release/release-hooks"

loadReleaseEnvironment()

const releaseTarget =
	process.env.RELEASE_PLATFORM || process.env.RELEASE_ARCH || process.env.RELEASE_REQUIRE_SIGNING
		? resolveReleaseTarget()
		: undefined
const defaultIconRoot = path.resolve("resources/icons")
const targetPlatform = releaseTarget?.platform ?? process.platform
const appIcon =
	targetPlatform === "win32"
		? process.env.WINDOWS_ICON_PATH?.trim() || path.join(defaultIconRoot, "cocode.ico")
		: process.env.MACOS_ICON_PATH?.trim() || path.join(defaultIconRoot, "cocode.icns")
const macSignOptions = releaseTarget?.platform === "win32" ? undefined : createMacSignOptions()
const macNotarizeOptions =
	releaseTarget?.platform === "win32" ? undefined : createMacNotarizeOptions()
const windowsSignOptions =
	releaseTarget?.platform === "darwin" ? undefined : createWindowsSignOptions()

const config: ForgeConfig = {
	packagerConfig: {
		asar: false,
		appBundleId: process.env.ELECTRON_APP_ID ?? "com.cocode.desktop",
		appCategoryType: "public.app-category.developer-tools",
		appCopyright:
			process.env.RELEASE_COPYRIGHT ??
			`Copyright © ${new Date().getFullYear()} Cocode Contributors`,
		icon: appIcon,
		osxSign: macSignOptions,
		osxNotarize: macNotarizeOptions,
		windowsSign: windowsSignOptions,
		...(process.env.FORGE_OUT_DIR ? { outDir: process.env.FORGE_OUT_DIR } : {}),
		afterExtract: [
			(buildPath, _electronVersion, platform, _arch, callback) => {
				const resourcesRoot =
					platform === "darwin"
						? path.join(buildPath, "Electron.app", "Contents", "Resources")
						: path.join(buildPath, "resources")
				runNodeScript("scripts/harden-electron-default-app.mjs", [
					"--resources-root",
					resourcesRoot,
				]).then(
					() => callback(),
					(error: unknown) =>
						callback(error instanceof Error ? error : new Error(String(error))),
				)
			},
		],
	},
	hooks: {
		preMake: async () => {
			prepareMacDmgDependencies()
		},
		packageAfterCopy: async (_config, buildPath: string) => {
			if (
				process.env.RELEASE_REQUIRE_NATIVE_ARCH_MATCH === "1" &&
				releaseTarget !== undefined &&
				process.arch !== releaseTarget.arch
			) {
				throw new Error(
					`Native staging requires ${releaseTarget.arch}, but this process is ${process.arch}.`,
				)
			}
			const runtimeDependencies = ["better-sqlite3", "node-addon-api"]

			await Promise.all(
				runtimeDependencies.map(async (dependency) => {
					const source = path.resolve("node_modules", dependency)
					const destination = path.join(buildPath, "node_modules", dependency)
					await fs.mkdir(path.dirname(destination), { recursive: true })
					await fs.cp(source, destination, { recursive: true })
				}),
			)

			const resourcesRoot = resolvePackagedResourcesRoot(buildPath)
			const runtimeArtifact = path.resolve(
				process.env.COCODE_RUNTIME_ARTIFACT_ROOT ??
					path.join(process.cwd(), ".cache", "cocode", "release-runtime"),
			)
			await runNodeScript("scripts/verify-dsh-runtime.mjs", [
				"--runtime-root",
				runtimeArtifact,
			])
			await fs.rm(path.join(resourcesRoot, "dsh-runtime"), { recursive: true, force: true })
			await fs.cp(runtimeArtifact, path.join(resourcesRoot, "dsh-runtime"), {
				recursive: true,
			})
			const tuiArtifact = path.resolve(
				process.env.COCODE_TUI_ARTIFACT_ROOT ??
					path.join(process.cwd(), ".cache", "cocode", "tui"),
			)
			await verifyTuiArtifact(tuiArtifact)
			await fs.rm(path.join(resourcesRoot, "tui"), { recursive: true, force: true })
			await fs.cp(tuiArtifact, path.join(resourcesRoot, "tui"), { recursive: true })
			const nodeExecutable = path.join(resourcesRoot, "cocode-node")
			await fs.cp(process.execPath, nodeExecutable)
			await fs.chmod(nodeExecutable, 0o755)
		},
		postPackage: async (_config, packageResult) => {
			await verifyPackagedTui(packageResult)
			await verifyPackagedApplication(packageResult)
		},
		postMake: async (_config, makeResults) => {
			const normalized = normalizeArtifactNames(addMacPkgArtifact(makeResults))
			await notarizeFinalMacArtifacts(normalized)
			verifyMadeArtifacts(normalized)
			const result = appendChecksumManifest(selectGitHubReleaseArtifacts(normalized))
			cleanupWindowsSignLedger()
			return result
		},
	},
	// Use the final headers host directly. The default electronjs.org URL
	// redirects there, and node-gyp's fetch can fail on that redirect when a
	// proxy resets the connection.
	rebuildConfig: {
		headerURL: "https://artifacts.electronjs.org/headers/dist",
	},
	makers: [
		new MakerSquirrel(
			createSquirrelConfig(packageMetadata.version, process.env, windowsSignOptions),
			["win32"],
		),
		new MakerZIP({}, ["darwin"]),
		new MakerDMG(createDmgConfig(), ["darwin"]),
		new MakerRpm({}),
		new MakerDeb({}),
	],
	publishers: [
		{
			name: "@electron-forge/publisher-github",
			config: {
				repository: resolveGitHubReleaseRepository(),
				tagPrefix: "v",
				draft: true,
				prerelease: false,
				generateReleaseNotes: true,
				force: true,
			},
		},
	],
	plugins: [
		new VitePlugin({
			// `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
			// If you are familiar with Vite configuration, it will look really familiar.
			build: [
				{
					// `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
					entry: "src/main/index.ts",
					config: "vite.main.config.ts",
					target: "main",
				},
				{
					entry: "src/preload/index.ts",
					config: "vite.preload.config.ts",
					target: "preload",
				},
			],
			renderer: [
				{
					name: "main_window",
					config: "vite.renderer.config.ts",
				},
			],
		}),
		// Fuses are used to enable/disable various Electron functionality
		// at package time, before code signing the application
		new FusesPlugin({
			version: FuseVersion.V1,
			[FuseV1Options.RunAsNode]: false,
			[FuseV1Options.EnableCookieEncryption]: true,
			[FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
			[FuseV1Options.EnableNodeCliInspectArguments]: false,
			[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
			// The DSH runtime is staged as a real directory so Node can resolve
			// dynamic ESM imports and native libraries such as sharp/libvips.
			[FuseV1Options.OnlyLoadAppFromAsar]: false,
		}),
	],
}

function resolvePackagedResourcesRoot(buildPath: string): string {
	// Forge's packageAfterCopy buildPath points at Resources/app on macOS and
	// resources/app on the other desktop targets. The runtime must live beside
	// app, because Electron exposes that parent as process.resourcesPath.
	if (path.basename(buildPath) === "app") return path.dirname(buildPath)
	return process.platform === "darwin"
		? path.join(buildPath, "Contents", "Resources")
		: path.join(buildPath, "resources")
}

function runNodeScript(script: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [script, ...args], { stdio: "inherit" })
		child.once("error", reject)
		child.once("exit", (code) => {
			if (code === 0) resolve()
			else reject(new Error(`${script} exited with code ${String(code)}`))
		})
	})
}

async function verifyTuiArtifact(root: string): Promise<void> {
	const entry = path.join(root, "cocode-tui.mjs")
	const meta = path.join(root, "cocode-tui.meta.json")
	const manifestPath = path.join(root, "manifest.json")
	for (const file of [entry, meta, manifestPath]) {
		try {
			await fs.access(file)
		} catch {
			throw new Error(`TUI artifact is missing: ${file}`)
		}
	}
	const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
		entry?: string
		sha256?: string
		schemaVersion?: number
	}
	if (manifest.schemaVersion !== 1 || manifest.entry !== "tui/cocode-tui.mjs") {
		throw new Error("TUI artifact manifest is invalid.")
	}
	const hash = createHash("sha256")
		.update(await fs.readFile(entry))
		.digest("hex")
	if (hash !== manifest.sha256) throw new Error("TUI artifact hash does not match its manifest.")
}

type ForgePackageResultLike = {
	readonly packagePath?: string
	readonly outputPath?: string
	readonly outputPaths?: readonly string[]
}

function resolveForgePackageRoots(packageResult: ForgePackageResultLike): string[] {
	return [
		packageResult.packagePath,
		packageResult.outputPath,
		...(packageResult.outputPaths ?? []),
	].filter((candidate): candidate is string => typeof candidate === "string")
}

function findPackagedResourcesRoot(packageResult: ForgePackageResultLike): string | undefined {
	for (const packageRoot of resolveForgePackageRoots(packageResult)) {
		const directCandidates = [
			packageRoot,
			path.join(packageRoot, "resources"),
			path.join(packageRoot, "Resources"),
			path.join(packageRoot, "Contents", "Resources"),
		]
		const directMatch = directCandidates.find((candidate) =>
			existsSync(path.join(candidate, "tui")),
		)
		if (directMatch) return directMatch

		if (!existsSync(packageRoot)) continue
		let entries
		try {
			entries = readdirSync(packageRoot, { withFileTypes: true })
		} catch {
			continue
		}
		for (const entry of entries) {
			if (!entry.isDirectory() || !entry.name.endsWith(".app")) continue
			const appResources = path.join(packageRoot, entry.name, "Contents", "Resources")
			if (existsSync(path.join(appResources, "tui"))) return appResources
		}
	}
	return undefined
}

async function verifyPackagedTui(packageResult: ForgePackageResultLike): Promise<void> {
	const resourcesRoot = findPackagedResourcesRoot(packageResult)
	if (!resourcesRoot) {
		const roots = resolveForgePackageRoots(packageResult)
		throw new Error(
			`Packaged TUI resources were not found under Forge output paths: ${
				roots.join(", ") || "<none>"
			}`,
		)
	}
	await verifyTuiArtifact(path.join(resourcesRoot, "tui"))
}

export default config
