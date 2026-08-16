# Cocode TUI

Cocode TUI is a terminal client for sessions hosted by the shared Cocode DSH Host.

Requirements: Node.js 22.19.x or Node.js 24 and later. The TUI installs
`@cocode/host-supervisor`, which supplies the `@deepseek-ai/dsh` runtime and
shares its Host with Cocode Desktop when both use the same profile.

## Install from a release tarball

```sh
# Build and install the standalone TUI; Desktop is not required.
cd /path/to/cocode-tui
pnpm run build
npm pack
npm install --global ./cocode-tui-0.1.0.tgz

# The CLI discovers or starts the shared Supervisor automatically.
cocode --doctor
cocode
```

The CLI keeps the current working directory as the agent workspace. Set
`DSH_HOME` and `DSH_PROFILE` to select the shared Host scope, or set
`COCODE_HOST_CONFIG_FINGERPRINT` when a custom Host composition is required.
`COCODE_HOME` still isolates Cocode credentials, while `DSH_SESSION_ROOT` can
move session files when needed.

The first launch shows the authentication choice. You can paste a DeepSeek API
key or sign in to Cocode. DeepSeek keys use the DSH credentials file under
`$DSH_HOME`; Cocode identity tokens use `account.yaml` under
`~/.cocode`. Neither is stored in the session log.

After the package is published, the installation command becomes:

```sh
npm install --global @cocode/tui
```

Useful commands:

```sh
cocode --help
cocode --version
cocode --doctor
```

For source checkout development, see [docs/zh/usage.md](./docs/zh/usage.md)
or [docs/en/usage.md](./docs/en/usage.md).
