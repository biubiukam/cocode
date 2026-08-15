# Cocode plugins

This directory is the home for Cocode Desktop-specific DSH plugins.

- One plugin per direct child directory.
- Packages are private workspace packages.
- Electron stages them into its embedded DSH runtime.
- Electron mounts them through its generated `--patch` overlay.
- The integration never runs `dsh plugin add` or writes plugin entries into the
  user's local DSH profile.

`cocode-sidebar` is based on
`omdsh-dev/DSH-better-sidebar@2bace68af8fa092a9a75070231bbf3488ee55a6b`.
