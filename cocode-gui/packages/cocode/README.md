# Cocode plugins

This directory is the home for Cocode Desktop-specific DSH plugins.

- One plugin per direct child directory.
- Packages are private workspace packages.
- Electron stages them into its embedded DSH runtime.
- Electron mounts them through its generated `--patch` overlay.
- The integration never runs `dsh plugin add` or writes plugin entries into the
  user's local DSH profile.

`cocode-workbench` is Cocode's first-party Workbench implementation. It owns
the right and bottom docks, panel registry, host API, and persistence format.
