import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import * as path from "pathe"
import test from "node:test"

const workflowPath = path.resolve("..", ".github/workflows/cocode-gui-release.yml")

test("publishes both Windows MSIX architectures from the main repository", () => {
	const workflow = readFileSync(workflowPath, "utf8")
	assert.match(workflow, /arch: arm64[\s\S]+runner: \[self-hosted, windows, ARM64\]/)
	assert.match(workflow, /-name '\*\.msix'/)
	assert.match(workflow, /win32-arm64[\s\S]+-name '\*\.msix'/)
	assert.doesNotMatch(workflow, /COCODE_GUI_ARM64_UPDATE_REPOSITORY/)
	assert.doesNotMatch(workflow, /COCODE_GUI_ARM64_RELEASE_TOKEN/)
	assert.doesNotMatch(workflow, /ELECTRON_UPDATE_REPOSITORY_WIN32_ARM64/)
})

test("keeps x64 Squirrel metadata but excludes ARM64 Squirrel feed metadata", () => {
	const workflow = readFileSync(workflowPath, "utf8")
	assert.match(workflow, /win32-x64[\s\S]+-name 'RELEASES'[\s\S]+-name '\*\.nupkg'/)
	assert.match(workflow, /win32-arm64[\s\S]+-name '\*\.msix'[\s\S]+-name 'SHA256SUMS\*\.txt'/)
})
