import assert from "node:assert/strict"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import * as path from "pathe"
import { afterEach, describe, it } from "node:test"
import { zstdCompressSync } from "node:zlib"
import { quarantineCorruptDshSessions } from "../../../src/main/contexts/dsh-runtime/infrastructure/dsh-session-recovery"

const roots: string[] = []

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe("quarantineCorruptDshSessions", () => {
	it("moves a corrupt compressed session and leaves valid sessions in place", () => {
		const home = mkdtempSync(path.join(os.tmpdir(), "cocode-dsh-recovery-"))
		roots.push(home)
		const valid = sessionFile(home, "valid", true)
		const corrupt = sessionFile(home, "corrupt", true)
		writeSession(valid, [0, 1])
		writeSession(corrupt, [0, 0])

		const moved = quarantineCorruptDshSessions(home)

		assert.equal(moved.length, 1)
		assert.equal(readFileSync(valid).length > 0, true)
		assert.equal(path.basename(path.dirname(moved[0]!)), "corrupt")
		assert.equal(readFileSync(moved[0]!).length > 0, true)
	})

	it("accepts packed chunk rows when their sequence is contiguous", () => {
		const home = mkdtempSync(path.join(os.tmpdir(), "cocode-dsh-recovery-"))
		roots.push(home)
		const file = sessionFile(home, "packed", false)
		writeFileSync(
			file,
			`${JSON.stringify(header("packed"))}\n${JSON.stringify({
				type: "text-chunks",
				seq0: 0,
				time0: 1,
				data: { turn: 0, step: 0, index: 0, dt: [1], texts: ["a", "b"] },
			})}\n${JSON.stringify({ type: "turn/end", seq: 2, time: 3, data: {} })}\n`,
		)

		assert.deepEqual(quarantineCorruptDshSessions(home), [])
	})
})

function sessionFile(home: string, id: string, compressed: boolean): string {
	const directory = path.join(home, "sessions", "project", id)
	mkdirSync(directory, { recursive: true })
	return path.join(directory, compressed ? "session.jsonl.zstd" : "session.jsonl")
}

function writeSession(file: string, sequences: number[]): void {
	const id = path.basename(path.dirname(file))
	const plain = `${JSON.stringify(header(id))}\n${sequences
		.map((seq) => JSON.stringify({ type: "event", seq, time: seq, data: {} }))
		.join("\n")}\n`
	writeFileSync(file, file.endsWith(".zstd") ? zstdCompressSync(plain) : plain)
}

function header(id: string): object {
	return { type: "session", version: 1, id, createdAt: 1, delegationDepth: 0 }
}
