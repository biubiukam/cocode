# Cocode DSH plugins

`packages/cocode/*` contains project-owned DSH plugins that ship only with
Cocode Desktop. Each direct child is an independent Host/client plugin package.

The Electron packaging pipeline builds these packages, copies their runtime
closure into the staged DSH sidecar, and mounts them through the Electron-owned
`--patch` overlay. Do not install them with `dsh plugin add`, and do not edit a
user's local DSH profile, package manifest, lockfile, or `cordis.patch.yml`.

Plugin Host code runs inside the trusted DSH sidecar. Browser code must keep the
official DSH client-plugin ABI and use the desktop transport adapter for
sidecar-owned HTTP/WebSocket routes. Runtime dependencies must be declared in
the package manifest's `cocode.runtimeDependencies` allow-list so staging stays
auditable and does not copy the entire development dependency graph.
