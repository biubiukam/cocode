import assert from "node:assert/strict"
import test from "node:test"
import electronViteConfig from "../../electron.vite.config"
import {
	MAIN_BUNDLED_DEPENDENCIES,
	MAIN_RUNTIME_DEPENDENCIES,
} from "../../scripts/release/runtime-dependencies"
import mainConfig from "../../vite.main.config"

test("bundles only the approved pure JavaScript main-process dependencies", () => {
	const plugin = mainConfig.plugins?.find((candidate) => candidate?.name === "vite:externalize-deps")
	assert.ok(plugin)
	assert.deepEqual(plugin.name, "vite:externalize-deps")
	assert.deepEqual(mainConfig.build?.lib?.formats, ["es"])
	assert.equal(mainConfig.build?.lib?.fileName?.("es"), "main.mjs")
	assert.equal(electronViteConfig.main?.build?.rollupOptions?.output?.entryFileNames, "main.mjs")
	assert.deepEqual(MAIN_BUNDLED_DEPENDENCIES, ["tar", "yaml", "zod"])
	assert.deepEqual(MAIN_RUNTIME_DEPENDENCIES, [
		"@cocode-agency/host-supervisor",
		"electron-updater",
		"pino",
		"better-sqlite3",
		"node-addon-api",
	])
	const runtimeDependencies = new Set<string>(MAIN_RUNTIME_DEPENDENCIES)
	for (const dependency of MAIN_BUNDLED_DEPENDENCIES)
		assert.equal(runtimeDependencies.has(dependency), false)
})

test("bundles preload dependencies for Electron sandbox compatibility", () => {
	assert.equal(electronViteConfig.preload?.build?.externalizeDeps, false)
})
