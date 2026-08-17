import { mkdirSync } from "node:fs"
import * as path from "pathe"
import type { SessionId } from "../../domain/value-objects/session-id"

export class DatabasePathResolver {
	private readonly magicDirectory: string

	public constructor(homeDirectory: string) {
		this.magicDirectory = path.join(homeDirectory, ".magic")
	}

	public globalDatabasePath(): string {
		return path.join(this.magicDirectory, "global.db")
	}

	public sessionDatabasePath(sessionId: SessionId): string {
		return path.join(this.magicDirectory, "sessions", sessionId.value, "user.db")
	}

	public ensureGlobalDirectory(): void {
		mkdirSync(this.magicDirectory, { recursive: true })
	}

	public ensureSessionDirectory(sessionId: SessionId): void {
		mkdirSync(path.dirname(this.sessionDatabasePath(sessionId)), {
			recursive: true,
		})
	}
}
