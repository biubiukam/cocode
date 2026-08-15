# Database context

This bounded context provides the application's minimal local persistence example.
It owns `better-sqlite3`, database file paths, connection caching, key-value CRUD and
the Main-process IPC handlers.

## Files and responsibilities

```text
contexts/database/
├── domain/
│   ├── entities/key-value-record.ts
│   ├── repositories/key-value-repository.ts
│   └── value-objects/session-id.ts
├── application/
│   ├── ports/database-repository-provider.ts
│   └── use-cases/database-service.ts
├── infrastructure/
│   ├── persistence/database-path-resolver.ts
│   └── repositories/
│       ├── better-sqlite-record-repository.ts
│       └── better-sqlite-database-repository-provider.ts
└── presentation/ipc/register-database-ipc.ts
```

- `domain`: transport- and database-independent record abstractions.
- `application`: routes global/session operations to a repository provider.
- `infrastructure`: owns native SQLite connections and filesystem paths.
- `presentation`: validates IPC requests and invokes the application service.

`src/contracts/ipc/database.contract.ts` is the only cross-process protocol. The
Preload bridge exposes that protocol as `window.desktopApi.database`.

## On-disk layout

The Main process uses `app.getPath('home')` and creates:

```text
<user-home>/.magic/global.db
<user-home>/.magic/sessions/<sessionId>/user.db
```

The global database is initialized during Main `ready`. A Session database is created
lazily on the first operation for that Session. Session IDs accept only letters,
numbers, `-` and `_`, so they cannot escape the sessions directory.

## Schema

This example intentionally uses one table in every database:

```sql
CREATE TABLE IF NOT EXISTS records (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
)
```

Values are JSON-serializable data. CRUD is parameterized and key-based. There is no
arbitrary SQL API exposed to Preload or Renderer.

## Extension rules

- Do not import `better-sqlite3` outside this context's infrastructure layer.
- Do not expose database file paths, database instances, SQL strings or prepared
  statements through IPC.
- Add business-specific tables and repositories under the owning bounded context when
  the application grows; do not turn this example into a global table dumping ground.
- Keep `DatabaseService` free of filesystem and SQLite details.
- Close all cached repositories through the database module's `dispose()` hook before
  application exit.
