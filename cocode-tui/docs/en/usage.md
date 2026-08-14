# Cocode TUI usage

[中文](../zh/usage.md) · [English](./usage.md)

## Before launch

Prepare a sibling `cocode-harness` clone, then set `cocode-tui/.env`:

```dotenv
COCODE_HARNESS_CMD=node
COCODE_HARNESS_ARGS=--import,tsx/esm,../../cocode-harness/packages/examples/jsonrpc-demo/src/bin.ts
DSH_CORDIS_CONFIG=../../cocode-harness/examples/jsonrpc-agent/cordis.cocode.yml
```

Configure a key on the first-run gate, or set `DEEPSEEK_API_KEY` for this process. For development, point `COCODE_HOME` at a separate directory. Sessions default to `sessions` under that home; `DSH_SESSION_ROOT` can override it.

## Editing

- `Enter` sends; `Shift+Enter` inserts a newline.
- `←` `→` move the cursor; `Backspace` deletes the character before it.
- `↑` `↓` walk local input history.
- `Ctrl+O` toggles verbose mode for full reasoning and tool I/O.
- `Esc` closes overlays (help, command menu) first; in the normal view, press twice to quit.
- `Ctrl+L` redraws the screen without clearing the session.

Tool output is truncated by display mode; the raw payload stays in the session projection. When the transcript is tight, the composer stays visible.

## Slash commands

Type `/` to open the command menu. Keep typing to filter by prefix. `Tab` or arrows select; Enter runs the command. A space returns you to ordinary text editing.

| Command                        | What it does                                                                |
| ------------------------------ | --------------------------------------------------------------------------- |
| `/help`                        | Keyboard shortcuts and currently available commands                         |
| `/status`                      | Session, model, runtime, and auth mode                                      |
| `/doctor`                      | TTY, launch flags, initialize result, session root, and closed capabilities |
| `/clear`                       | Clear the on-screen projection; does not delete the session log             |
| `/new`                         | Start a new session id (not a fork)                                         |
| `/export`                      | Export the current projection as Markdown                                   |
| `/init`                        | Create a minimal `AGENTS.md` only when the workspace has none               |
| `/theme dark` / `/theme light` | Switch the display theme                                                    |
| `/resume`                      | List local session history for this workspace                               |
| `/use byok` / `/use cocode`    | Switch between your key and Cocode; switching starts a new session          |
| `/login` / `/logout`           | Sign in or out of Cocode Cloud; logout keeps your key and stays in chat     |
| `/exit`                        | Shut down TUI and restore the terminal                                      |

`/resume` currently lists history only. The harness SDK has no `session/open` or `session/resume` wire, so TUI does not pretend it can continue an old session.

## Errors

Failures show `CODE · explanation` on the status line. Language follows `COCODE_LANG`, then `LANG` / `LC_MESSAGES`. Full catalog: [error codes](./errors.md).

## Several terminals

You can run several TUI windows against the same home and the same channels. Each window is its own process and `sessionId`; in-flight turns do not affect each other.

If another TUI window is still open, `/use`, `/login`, and `/logout` refuse so they cannot rewrite the machine-wide default channel or tear down the Cloud slot. Close the other windows, then switch or sign out in the one that remains. Different providers per window is not a current product capability.

## Not wired yet

Cancel/steer, approvals, rewind, the skills menu, `@` file completion, `Ctrl+R` history search, and `Ctrl+G` external editor are not bound in TUI. Those need a harness wire, an explicit manifest, or later interaction work. The UI does not draw fake controls.
