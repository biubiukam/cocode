import test from "node:test"
import assert from "node:assert/strict"
import {
	parseDiagnosticsLogQuery,
	parseRendererLogBatch,
	parseTemporaryDebugRequest,
} from "../../../src/contracts/schemas/diagnostics.schema"

test("diagnostics schema accepts bounded renderer records", () => {
	const records = parseRendererLogBatch([
		{ level: "warn", eventName: "renderer.test", attributes: { count: 1 } },
	])
	assert.equal(records.length, 1)
})

test("diagnostics schema rejects oversized batches and invalid debug duration", () => {
	assert.throws(() =>
		parseRendererLogBatch(
			Array.from({ length: 51 }, (_, index) => ({
				level: "debug",
				eventName: `event-${index}`,
			})),
		),
	)
	assert.throws(() => parseTemporaryDebugRequest({ durationMinutes: 15 }))
})

test("diagnostics schema rejects oversized records even when the count is valid", () => {
	assert.throws(() =>
		parseRendererLogBatch([
			{ level: "debug", eventName: "large", attributes: { value: "x".repeat(16 * 1024) } },
		]),
	)
})

test("diagnostics schema bounds unified log queries", () => {
	const query = parseDiagnosticsLogQuery({
		from: "2026-08-18T00:00:00.000Z",
		sources: ["desktop", "host"],
		processTypes: ["main", "dsh-host"],
		text: "startup",
		limit: 50,
	})
	assert.deepEqual(query.sources, ["desktop", "host"])
	assert.throws(() => parseDiagnosticsLogQuery({ limit: 201 }))
})
