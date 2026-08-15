import type { DatabaseRepositoryProvider } from "../../application/ports/database-repository-provider"
import type { KeyValueRepository } from "../../domain/repositories/key-value-repository"
import { SessionId } from "../../domain/value-objects/session-id"
import type { DatabasePathResolver } from "../persistence/database-path-resolver"
import { BetterSqliteRecordRepository } from "./better-sqlite-record-repository"

export class BetterSqliteDatabaseRepositoryProvider implements DatabaseRepositoryProvider {
	private globalRepository: BetterSqliteRecordRepository | null = null
	private readonly sessionRepositories = new Map<string, BetterSqliteRecordRepository>()

	public constructor(private readonly pathResolver: DatabasePathResolver) {}

	public getGlobalRepository(): KeyValueRepository {
		if (!this.globalRepository) {
			this.pathResolver.ensureGlobalDirectory()
			this.globalRepository = new BetterSqliteRecordRepository(
				this.pathResolver.globalDatabasePath(),
			)
		}

		return this.globalRepository
	}

	public getSessionRepository(sessionIdValue: string): KeyValueRepository {
		const sessionId = SessionId.create(sessionIdValue)
		const existing = this.sessionRepositories.get(sessionId.value)
		if (existing) {
			return existing
		}

		this.pathResolver.ensureSessionDirectory(sessionId)
		const repository = new BetterSqliteRecordRepository(
			this.pathResolver.sessionDatabasePath(sessionId),
		)
		this.sessionRepositories.set(sessionId.value, repository)
		return repository
	}

	public closeAll(): void {
		this.globalRepository?.close()
		this.globalRepository = null

		for (const repository of this.sessionRepositories.values()) {
			repository.close()
		}
		this.sessionRepositories.clear()
	}
}
