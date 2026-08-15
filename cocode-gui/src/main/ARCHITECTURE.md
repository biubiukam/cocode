# Main process architecture

`main` owns trusted desktop capabilities and the authoritative business model.

## Directories

- `bootstrap`: composition root. It wires dependencies and starts the process.
- `shell`: Electron-specific lifecycle, windows, menus, tray and platform APIs.
- `contexts`: bounded business contexts. Rename `_template` when introducing a real context.
- `shared`: main-process technical capabilities shared by multiple contexts.

Each bounded context is split into:

- `domain`: aggregates, entities, value objects, domain events and repository interfaces.
- `application`: commands, queries, use cases, DTOs and outbound ports.
- `infrastructure`: adapters for persistence, files, network and repository implementations.
- `presentation`: inbound adapters such as IPC handlers and response presenters.

Dependencies point inward: `presentation -> application -> domain`. Infrastructure
implements ports declared by the domain or application layers. Domain code must not
import Electron, IPC, databases, file-system APIs or renderer code.
