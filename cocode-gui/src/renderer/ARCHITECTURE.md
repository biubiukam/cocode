# Renderer process architecture

`renderer` owns interaction and presentation. It consumes narrow APIs exposed by
preload and never imports Electron or Node.js privileged APIs directly.

## Directories

- `app`: renderer composition root, global providers, routing and layouts.
- `contexts`: UI-side bounded contexts. Rename `_template` for a real business context.
- `shared`: renderer-only UI primitives and generic utilities without business meaning.
- `styles`: global styles and design tokens.

Each UI bounded context is split into:

- `domain`: renderer-local interaction rules and models, not copies of main entities.
- `application`: UI use cases, commands, queries, DTOs and gateway ports.
- `infrastructure`: preload/IPC gateway adapters, persistence adapters and mappers.
- `presentation`: pages, components, view models, stores and routes.

Dependencies point inward: `presentation -> application -> domain`. Infrastructure
implements application ports. Cross-process values are DTOs defined by shared IPC
contracts; main-process domain entities never cross the process boundary.

The DSH Web migration is composed under `app/bootstrap`: it obtains the sidecar
boot manifest through `window.desktopApi.dsh`, installs the scoped transport
adapters, and starts the copied `AppWebEntry`. Renderer code does not import
Electron; `/api` requests are serialized through Preload and local client bundle
URLs are served by the Vite renderer plugin.
