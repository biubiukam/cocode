import assert from "node:assert/strict"
import test from "node:test"
import { Session } from "../../packages/client/runtime/src/client/sessions/session"

function historyEntries(fromSeq: number, toSeq: number) {
	return Array.from({ length: toSeq - fromSeq + 1 }, (_, index) => {
		const seq = fromSeq + index
		return {
			event: {
				type: "turn/start" as const,
				seq,
				time: seq,
				data: { turn: seq },
			},
		}
	})
}

test("explicit history paging advances beyond a trimmed materialized tail", async () => {
	const requestedBeforeSeqs: Array<number | undefined> = []
	const api = {
		sessions: {
			history: async ({ beforeSeq }: { beforeSeq?: number }) => {
				requestedBeforeSeqs.push(beforeSeq)
				if (beforeSeq === undefined) {
					return {
						result: {
							ok: true as const,
							value: { events: historyEntries(1, 2_200), hasMore: true },
						},
					}
				}
				if (beforeSeq === 401) {
					return {
						result: {
							ok: true as const,
							value: { events: historyEntries(151, 400), hasMore: true },
						},
					}
				}
				if (beforeSeq === 151) {
					return {
						result: {
							ok: true as const,
							value: { events: historyEntries(1, 150), hasMore: false },
						},
					}
				}
				throw new Error(`unexpected beforeSeq: ${String(beforeSeq)}`)
			},
		},
	}
	const session = new Session("history-session", api as never, {} as never)

	await session.open()
	await session.loadOlder()
	await session.loadOlder()

	assert.deepEqual(requestedBeforeSeqs, [undefined, 401, 151])
	assert.equal(session.getSnapshot().hasMore, false)
})
