import assert from "node:assert/strict"
import test from "node:test"
import type {
	ExternalDshChange,
	ExternalDshReadSource,
	ExternalDshSourceStatus,
} from "@cocode-agency/host-supervisor"
import {
	externalDshChannels,
	sharedDshChannels,
} from "../../../src/contracts/ipc/external-dsh.contract"
import { SharedDshCatalog } from "../../../src/main/contexts/dsh-runtime/infrastructure/external-dsh-catalog"

test("shared DSH IPC uses shared naming and preserves the legacy alias", () => {
	assert.equal(sharedDshChannels.catalog, "external-dsh:catalog")
	assert.equal(sharedDshChannels.conflictStatus, "external-dsh:conflict-status")
	assert.equal(externalDshChannels, sharedDshChannels)
})

test("SharedDshCatalog keeps shared data marked writable with a single-writer policy", async () => {
	const source = fakeSource({
		source: "shared-dsh",
		sourceHome: "/official",
		canMutate: true,
		concurrency: "no-concurrent-writes",
		sharedWritePolicy: "enabled",
		concurrentMutation: "unsupported",
		homePatch: "shared",
		homePatchIsolation: "unavailable",
		profileFallback: "shared",
		state: "available",
		sessionCount: 1,
		workspaceCount: 1,
	})
	const catalog = new SharedDshCatalog(source)

	assert.deepEqual(await catalog.catalog(), {
		source: "shared-dsh",
		canMutate: true,
		concurrency: "no-concurrent-writes",
		status: await source.getStatus(),
		sessions: [
			{
				source: "shared-dsh",
				canMutate: true,
				concurrency: "no-concurrent-writes",
				id: "session-1",
				createdAt: 1,
				path: "/official/sessions/project/session-1/session.jsonl",
			},
		],
		workspaces: [
			{
				source: "shared-dsh",
				canMutate: true,
				concurrency: "no-concurrent-writes",
				workspaceId: "workspace-1",
				path: "/workspace",
				sessionIds: ["session-1"],
				archivedSessionIds: [],
			},
		],
	})
})

test("SharedDshCatalog fails soft when optional shared files are unavailable", async () => {
	const source = fakeSource({
		source: "shared-dsh",
		sourceHome: "/missing",
		canMutate: true,
		concurrency: "no-concurrent-writes",
		sharedWritePolicy: "enabled",
		concurrentMutation: "unsupported",
		homePatch: "shared",
		homePatchIsolation: "unavailable",
		profileFallback: "shared",
		state: "unavailable",
		reason: "source-missing",
	})
	source.listSessions = async () => {
		throw new Error("missing")
	}
	source.listWorkspaces = async () => {
		throw new Error("missing")
	}

	const result = await new SharedDshCatalog(source).catalog()
	assert.equal(result.status.state, "unavailable")
	assert.deepEqual(result.sessions, [])
	assert.deepEqual(result.workspaces, [])
})

function fakeSource(status: ExternalDshSourceStatus): ExternalDshReadSource {
	const listeners = new Set<(change: ExternalDshChange) => void>()
	return {
		source: "shared-dsh",
		sourceHome: status.sourceHome,
		getStatus: async () => status,
		listSessions: async () => [
			{
				source: "shared-dsh",
				canMutate: true,
				concurrency: "no-concurrent-writes",
				id: "session-1",
				createdAt: 1,
				path: "/official/sessions/project/session-1/session.jsonl",
			},
		],
		readSessionHistory: async () => {
			throw new Error("not used")
		},
		listWorkspaces: async () => ({
			source: "shared-dsh",
			canMutate: true,
			concurrency: "no-concurrent-writes",
			revision: "1",
			workspaces: [
				{
					source: "shared-dsh",
					canMutate: true,
					concurrency: "no-concurrent-writes",
					workspaceId: "workspace-1",
					path: "/workspace",
					sessionIds: ["session-1"],
					archivedSessionIds: [],
				},
			],
		}),
		subscribe: (listener) => {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
		dispose: async () => {
			listeners.clear()
		},
	}
}
