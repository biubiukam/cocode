import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import * as path from "pathe"
import test from "node:test"

const repoRoot = path.resolve("..")
const releaseWorkflowPath = path.join(repoRoot, ".github/workflows/cocode-gui-release.yml")
const checkWorkflowPath = path.join(repoRoot, ".github/workflows/cocode-gui-check.yml")
const guiPackagePath = path.join(repoRoot, "cocode-gui/package.json")
const oxlintConfigPath = path.join(repoRoot, "cocode-gui/.oxlintrc.json")
const lintStagedConfigPath = path.join(repoRoot, "cocode-gui/lint-staged.config.cjs")

test("does not expose a public Desktop release workflow", () => {
	assert.equal(existsSync(releaseWorkflowPath), false)
})

test("keeps the public GUI workflow limited to checks and rebuildability", () => {
	const workflow = readFileSync(checkWorkflowPath, "utf8")

	assert.match(workflow, /pull_request:/)
	assert.match(workflow, /push:[\s\S]+branches:\s+- main/)
	assert.match(workflow, /typecheck:ci/)
	assert.match(workflow, /lint:ci/)
	assert.match(workflow, /build:cocode-plugins/)
	assert.match(workflow, /build:supervisor/)
	assert.match(workflow, /build:runtime/)
	assert.doesNotMatch(workflow, /RELEASE_REQUIRE_SIGNING/)
	assert.doesNotMatch(workflow, /MAC_SIGNING_IDENTITY/)
	assert.doesNotMatch(workflow, /CSC_LINK|WIN_CSC_LINK|AZURE_KEY_VAULT/)
	assert.doesNotMatch(workflow, /electron-forge (make|publish)|pnpm run (make|publish)/)
	assert.doesNotMatch(workflow, /create-release|upload-release-asset|softprops\/action-gh-release/)
})

test("uses oxlint as the GUI lint engine", () => {
	const packageJson = JSON.parse(readFileSync(guiPackagePath, "utf8")) as {
		scripts?: Record<string, string>
	}
	const oxlintConfig = readFileSync(oxlintConfigPath, "utf8")
	const lintStagedConfig = readFileSync(lintStagedConfigPath, "utf8")

	assert.match(packageJson.scripts?.lint ?? "", /oxlint/)
	assert.match(packageJson.scripts?.["lint:fix"] ?? "", /oxlint/)
	assert.match(packageJson.scripts?.["lint:ci"] ?? "", /check-changed-files\.mjs lint/)
	assert.doesNotMatch(packageJson.scripts?.lint ?? "", /eslint/)
	assert.doesNotMatch(packageJson.scripts?.["lint:fix"] ?? "", /eslint/)
	assert.match(lintStagedConfig, /oxlint --fix --deny-warnings/)
	assert.doesNotMatch(lintStagedConfig, /\beslint\b/)
	assert.match(oxlintConfig, /"typescript"/)
	assert.match(oxlintConfig, /"no-restricted-imports"/)
})
