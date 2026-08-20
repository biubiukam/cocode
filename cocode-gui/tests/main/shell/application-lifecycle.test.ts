import assert from "node:assert/strict"
import test from "node:test"
import { ApplicationQuitCoordinator } from "../../../src/main/shell/lifecycle/application-quit-coordinator"
import { runCleanupStep } from "../../../src/main/shell/lifecycle/run-cleanup-step"

test("restart completion runs once after the shared cleanup gate", () => {
	const coordinator = new ApplicationQuitCoordinator()
	let cleanupCount = 0
	let relaunchCount = 0
	const exitCodes: number[] = []

	assert.equal(
		coordinator.requestCompletion(() => {
			relaunchCount += 1
			exitCodes.push(0)
		}),
		true,
	)
	assert.equal(
		coordinator.requestCompletion(() => undefined),
		false,
	)
	assert.equal(coordinator.handleQuitAttempt(), "start-cleanup")
	assert.equal(coordinator.handleQuitAttempt(), "prevent")

	const completion = coordinator.complete(() => undefined)
	cleanupCount += 1
	completion()
	assert.equal(coordinator.handleQuitAttempt(), "allow")

	assert.equal(cleanupCount, 1)
	assert.equal(relaunchCount, 1)
	assert.deepEqual(exitCodes, [0])
})

test("cleanup step failures are reported without skipping later cleanup", async () => {
	const completed: string[] = []
	const failures: Array<[string, unknown]> = []

	await runCleanupStep(
		"database",
		() => {
			completed.push("database")
			throw new Error("database close failed")
		},
		(name, error) => failures.push([name, error]),
	)
	await runCleanupStep(
		"host",
		() => {
			completed.push("host")
		},
		(name, error) => failures.push([name, error]),
	)

	assert.deepEqual(completed, ["database", "host"])
	assert.equal(failures.length, 1)
	assert.equal(failures[0]?.[0], "database")
	assert.match(String(failures[0]?.[1]), /database close failed/)
})
