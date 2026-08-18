import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import * as path from "pathe"
import test from "node:test"
import { LogQueryService } from "../../../src/main/shared/observability/log-query-service"

test("queries and merges desktop, host and tui JSONL without exposing absolute paths", async () => {
	const root = await mkdtemp(path.join(tmpdir(), "cocode-query-"))
	const layout = {
		root,
		desktopApp: path.join(root, "desktop", "app"),
		desktopAudit: path.join(root, "desktop", "audit"),
		host: path.join(root, "host"),
		tui: path.join(root, "tui"),
		crashDumps: path.join(root, "crashDumps"),
		diagnostics: path.join(root, "diagnostics"),
	}
	try {
		await mkdir(path.join(layout.host, "host-a"), { recursive: true })
		await mkdir(layout.desktopApp, { recursive: true })
		await mkdir(layout.tui, { recursive: true })
		await writeFile(
			path.join(layout.desktopApp, "current.jsonl"),
			`${JSON.stringify({
				timestamp: "2026-08-18T00:00:02.000Z",
				eventName: "desktop.ready",
				source: "desktop",
				sequence: 2,
			})}\n`,
		)
		await writeFile(
			path.join(layout.host, "host-a", "current.jsonl"),
			`${JSON.stringify({
				timestamp: "2026-08-18T00:00:01.000Z",
				eventName: "dsh.host.ready",
				source: "host",
				hostKey: "host-a",
				processType: "dsh-host",
				sequence: 1,
			})}\n`,
		)
		await writeFile(
			path.join(layout.tui, "current.jsonl"),
			`${JSON.stringify({
				timestamp: "2026-08-18T00:00:03.000Z",
				eventName: "tui.start",
				source: "tui",
				processType: "tui",
				sequence: 1,
			})}\n`,
		)

		const service = new LogQueryService({ layout })
		const result = service.query({ hostKey: "host-a", limit: 10 })
		assert.equal(result.items.length, 1)
		assert.equal(result.items[0]?.eventName, "dsh.host.ready")
		assert.deepEqual(
			service
				.listSources()
				.map((item) => item.relativePath)
				.sort(),
			["desktop/app/current.jsonl", "host/host-a/current.jsonl", "tui/current.jsonl"],
		)
		assert.ok(!service.listSources().some((item) => item.relativePath.includes(root)))
	} finally {
		await rm(root, { recursive: true, force: true })
	}
})
