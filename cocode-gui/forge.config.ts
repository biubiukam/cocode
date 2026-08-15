import type { ForgeConfig } from "@electron-forge/shared-types"
import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import { MakerSquirrel } from "@electron-forge/maker-squirrel"
import { MakerZIP } from "@electron-forge/maker-zip"
import { MakerDeb } from "@electron-forge/maker-deb"
import { MakerRpm } from "@electron-forge/maker-rpm"
import { VitePlugin } from "@electron-forge/plugin-vite"
import { FusesPlugin } from "@electron-forge/plugin-fuses"
import { FuseV1Options, FuseVersion } from "@electron/fuses"

const config: ForgeConfig = {
	packagerConfig: {
		asar: false,
	},
	hooks: {
		packageAfterCopy: async (_config, buildPath: string) => {
			const runtimeDependencies = ["better-sqlite3", "node-addon-api"]

			await Promise.all(
				runtimeDependencies.map(async (dependency) => {
					const source = path.resolve("node_modules", dependency)
					const destination = path.join(buildPath, "node_modules", dependency)
					await fs.mkdir(path.dirname(destination), { recursive: true })
					await fs.cp(source, destination, { recursive: true })
				}),
			)

			await runNodeScript("scripts/stage-dsh-runtime.mjs", [
				"--destination",
				path.join(buildPath, "resources", "dsh-runtime"),
			])
			await fs.cp(
				path.resolve("resources", "dsh-utility-entry.mjs"),
				path.join(buildPath, "resources", "dsh-utility-entry.mjs"),
			)
			await fs.cp(
				path.resolve("resources", "dsh-noop-hmr.mjs"),
				path.join(buildPath, "resources", "dsh-noop-hmr.mjs"),
			)
		},
	},
	rebuildConfig: {},
	makers: [
		new MakerSquirrel({}),
		new MakerZIP({}, ["darwin"]),
		new MakerRpm({}),
		new MakerDeb({}),
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

export default config
