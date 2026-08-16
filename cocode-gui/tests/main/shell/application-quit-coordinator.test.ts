import assert from "node:assert/strict"
import test from "node:test"
import { ApplicationQuitCoordinator } from "../../../src/main/shell/lifecycle/application-quit-coordinator"

test("runs normal cleanup once and allows the final quit", () => {
	const coordinator = new ApplicationQuitCoordinator()
	assert.equal(coordinator.handleQuitAttempt(), "start-cleanup")
	assert.equal(coordinator.handleQuitAttempt(), "prevent")
	let completed = false
	const finish = coordinator.complete(() => {
		completed = true
	})
	finish()
	assert.equal(completed, true)
	assert.equal(coordinator.handleQuitAttempt(), "allow")
})

test("uses the updater completion after safe cleanup", () => {
	const coordinator = new ApplicationQuitCoordinator()
	let installed = false
	assert.equal(
		coordinator.requestCompletion(() => {
			installed = true
		}),
		true,
	)
	assert.equal(
		coordinator.requestCompletion(() => undefined),
		false,
	)
	assert.equal(coordinator.handleQuitAttempt(), "start-cleanup")
	coordinator.complete(() => undefined)()
	assert.equal(installed, true)
})
