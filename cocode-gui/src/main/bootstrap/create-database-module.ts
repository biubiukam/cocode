import { DatabaseService } from "../contexts/database/application/use-cases/database-service"
import { DatabasePathResolver } from "../contexts/database/infrastructure/persistence/database-path-resolver"
import { BetterSqliteDatabaseRepositoryProvider } from "../contexts/database/infrastructure/repositories/better-sqlite-database-repository-provider"
import {
	registerDatabaseIpc,
	unregisterDatabaseIpc,
} from "../contexts/database/presentation/ipc/register-database-ipc"

export interface DatabaseModule {
	initialize(): void
	dispose(): void
}

export function createDatabaseModule(homeDirectory: string): DatabaseModule {
	const provider = new BetterSqliteDatabaseRepositoryProvider(
		new DatabasePathResolver(homeDirectory),
	)
	const service = new DatabaseService(provider)

	return {
		initialize(): void {
			provider.getGlobalRepository()
			registerDatabaseIpc(service)
		},
		dispose(): void {
			unregisterDatabaseIpc()
			provider.closeAll()
		},
	}
}
