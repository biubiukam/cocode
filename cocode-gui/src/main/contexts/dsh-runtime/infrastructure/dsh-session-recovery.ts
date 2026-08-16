import { readdirSync, renameSync, mkdirSync, readFileSync, statSync } from "node:fs"
import { zstdDecompressSync } from "node:zlib"
import path from "node:path"

const SESSION_FILE = /^session\.jsonl(?:\.zstd)?$/

/**
 * Keep one broken session from preventing the whole GUI from starting.
 * Files are moved, never deleted, so recovery remains possible.
 */
export function quarantineCorruptDshSessions(home: string): string[] {
	const corrupted: string[] = []
	for (const file of findSessionFiles(path.join(home, "sessions"))) {
		try {
			if (isCorruptSession(file)) corrupted.push(file)
		} catch (error) {
			if (isCorruptionError(error)) corrupted.push(file)
		}
	}
	if (corrupted.length === 0) return []

	const recoveryRoot = path.join(
		home,
		"recovery",
		`corrupt-sessions-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`,
	)
	const moved: string[] = []
	for (const file of corrupted) {
		const destination = uniqueDestination(recoveryRoot, path.basename(path.dirname(file)), path.basename(file))
		mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 })
		renameSync(file, destination)
		moved.push(destination)
		console.warn(`[dsh] quarantined corrupt session ${path.basename(path.dirname(file))} -> ${destination}`)
	}
	return moved
}

function findSessionFiles(root: string): string[] {
	const files: string[] = []
	let entries
	try { entries = readdirSync(root, { withFileTypes: true }) } catch { return files }
	for (const entry of entries) {
		const entryPath = path.join(root, entry.name)
		if (entry.isDirectory()) files.push(...findSessionFiles(entryPath))
		else if (entry.isFile() && SESSION_FILE.test(entry.name)) files.push(entryPath)
	}
	return files
}

function isCorruptSession(file: string): boolean {
	const raw = readFileSync(file)
	const plain = file.endsWith(".zstd") ? zstdDecompressSync(raw) : raw
	const lines = plain.toString("utf8").split("\n").filter(Boolean)
	if (lines.length === 0) throw new Error("corrupt session log: empty log")
	JSON.parse(lines[0])
	let expected = 0
	for (const line of lines.slice(1)) {
		const record = JSON.parse(line)
		const count = storedRecordLength(record)
		if (count === undefined) throw new Error("corrupt session log: unparsable committed event")
		const firstSeq = typeof record?.seq === "number" ? record.seq : record.seq0
		if (firstSeq !== expected) return true
		expected += count
	}
	return false
}

function storedRecordLength(record: any): number | undefined {
	if (record && typeof record === "object" && typeof record.seq === "number") return 1
	if (!record || typeof record !== "object") return undefined
	if (record.type === "text-chunks" || record.type === "reasoning-chunks") {
		return Array.isArray(record.data?.texts) ? record.data.texts.length : undefined
	}
	if (record.type === "tool-call-chunks") {
		return Array.isArray(record.data?.args) ? record.data.args.length : undefined
	}
	return undefined
}

function isCorruptionError(error: unknown): boolean {
	return error instanceof Error && /corrupt session log|Zstandard session log|empty or header-less/i.test(error.message)
}

function uniqueDestination(root: string, sessionDir: string, filename: string): string {
	let destination = path.join(root, sessionDir, filename)
	let suffix = 1
	while (exists(destination)) {
		destination = path.join(root, sessionDir, `${filename}.${suffix}`)
		suffix += 1
	}
	return destination
}

function exists(file: string): boolean {
	try { statSync(file); return true } catch { return false }
}
