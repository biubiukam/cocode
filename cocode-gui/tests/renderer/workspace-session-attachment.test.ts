import assert from "node:assert/strict"
import test from "node:test"
import { Context } from "@deepseek-ai/cordis"
import { createSnapshotStore } from "../../packages/client/runtime/src/client/contract/store"
import type { SessionsPort } from "../../packages/client/runtime/src/client/contract/sessions-port"
import { WorkspaceRuntime } from "../../packages/client/runtime/src/client/workspaces/service"

test("new sessions stay in the selected workspace before host frames arrive", async () => {
	const workspaceId = "ws-test"
	const workspacePath = "/tmp/cocode-workspace-test"
	const workspace = {
		workspaceId,
		path: workspacePath,
		title: "cocode-workspace-test",
		sessionIds: [] as string[],
		createdAt: "2026-08-16T00:00:00.000Z",
		updatedAt: "2026-08-16T00:00:00.000Z",
	}
	const api = {
		workspace: {
			list: async () => ({
				result: {
					ok: true as const,
					value: { items: [workspace], archivedSessionIds: [] as string[] },
				},
			}),
		},
	}
	const sessionsList = createSnapshotStore({
		ids: [] as string[],
		byId: {},
		current: undefined,
		phase: "ready" as const,
	})
	let createdCount = 0
	const sessions: SessionsPort = {
		list: sessionsList,
		async create({ workspaceId: target, cwd }) {
			assert.equal(target, workspaceId)
			const sessionId = `session-new-${++createdCount}`
			sessionsList.update((draft) => {
				draft.ids = [sessionId, ...draft.ids]
				draft.byId[sessionId] = {
					id: sessionId,
					blank: true,
					...(cwd === undefined ? {} : { cwd }),
					updatedAt: Date.now(),
				}
			})
			return sessionId
		},
		open: () => {},
		clear: () => {},
	}
	const runtime = new WorkspaceRuntime(new Context(), api as never, sessions)

	await runtime.refresh()
	const first = await runtime.connectWorkspace(workspaceId)

	assert.deepEqual(
		runtime.list.getSnapshot().items.find(item => item.workspaceId === workspaceId)?.sessionIds,
		[first],
	)
	assert.equal(sessionsList.getSnapshot().byId[first]?.cwd, workspacePath)

	const second = await runtime.connectWorkspace(workspaceId)
	assert.equal(second, first)
	assert.equal(createdCount, 1)
})
