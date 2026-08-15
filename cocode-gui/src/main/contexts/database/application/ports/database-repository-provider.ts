import type { KeyValueRepository } from "../../domain/repositories/key-value-repository"

export interface DatabaseRepositoryProvider {
	getGlobalRepository(): KeyValueRepository
	getSessionRepository(sessionId: string): KeyValueRepository
}
