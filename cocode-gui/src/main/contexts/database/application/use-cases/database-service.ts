import type {
	DatabaseRecordDto,
	DatabaseScope,
	DeleteDatabaseRecordRequest,
	GetDatabaseRecordRequest,
	ListDatabaseRecordsRequest,
	SetDatabaseRecordRequest,
} from "../../../../../contracts/ipc/database.contract"
import type { KeyValueRecord } from "../../domain/entities/key-value-record"
import type { KeyValueRepository } from "../../domain/repositories/key-value-repository"
import type { DatabaseRepositoryProvider } from "../ports/database-repository-provider"

export class DatabaseService {
	public constructor(private readonly provider: DatabaseRepositoryProvider) {}

	public get(request: GetDatabaseRecordRequest): DatabaseRecordDto | null {
		return this.repositoryFor(request.scope).get(request.key)
	}

	public set(request: SetDatabaseRecordRequest): DatabaseRecordDto {
		return this.repositoryFor(request.scope).set(request.key, request.value)
	}

	public delete(request: DeleteDatabaseRecordRequest): boolean {
		return this.repositoryFor(request.scope).delete(request.key)
	}

	public list(request: ListDatabaseRecordsRequest): DatabaseRecordDto[] {
		return this.repositoryFor(request.scope)
			.list()
			.map((record) => this.toDto(record))
	}

	private repositoryFor(scope: DatabaseScope): KeyValueRepository {
		return scope.kind === "global"
			? this.provider.getGlobalRepository()
			: this.provider.getSessionRepository(scope.sessionId)
	}

	private toDto(record: KeyValueRecord): DatabaseRecordDto {
		return { ...record }
	}
}
