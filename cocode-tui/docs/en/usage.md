# Cocode TUI usage

[中文](../zh/usage.md) · [English](./usage.md)

## Before launch

Prepare a sibling `cocode-harness` clone, then set `cocode-tui/.env`:

```dotenv
COCODE_HARNESS_CMD=node
COCODE_HARNESS_ARGS=--import,tsx/esm,../../cocode-harness/packages/examples/jsonrpc-demo/src/bin.ts
DSH_CORDIS_CONFIG=../../cocode-harness/examples/jsonrpc-agent/cordis.cocode.yml
```

Configure a key on the first-run gate, or set `DEEPSEEK_API_KEY` for this process. For development, point `COCODE_HOME` at a separate config directory. Sessions default to `$DSH_HOME/sessions`, or `~/.dsh/sessions` when `DSH_HOME` is unset; `DSH_SESSION_ROOT` can override it.

## Screen regions

Set `COCODE_TUI_SCREEN=inline` (the default) to keep the main screen and scrollback, or `alternate` for a fullscreen alternate buffer that is restored on exit. Legacy Windows consoles without alternate-buffer support fall back to `inline`.

- The header shows the workspace, git branch, session, provider, model, and live Agent state.
- The transcript projects `you`, `cocode`, reasoning, and tool results as separate node groups.
- The status bar shows runtime state, notices, and input/output token usage when supplied by the runtime.
- The composer is a bordered `prompt` panel; a dead runtime is shown as `locked` instead of looking editable.
- The `/` command menu and `?` help panel reserve their own rows, so the composer stays visible when the transcript is crowded.

## Editing

- `Enter` sends; `Shift+Enter` inserts a newline.
- `←` `→` move the cursor; `Backspace` deletes the character before it.
- `↑` `↓` walk local input history.
- `Ctrl+R` opens history search; type to filter recent messages, use `↑` `↓` to select, Enter to restore the draft, and `Esc` to close.
- `Shift+↑` enters message selection; use `↑` `↓` to move, Enter to expand or collapse the current message, and `Esc` to exit.
- `/lang zh` or `/lang en` switches the interface immediately; startup language follows `COCODE_LANG`, `LANG`, and related locale variables.
- `/model <model-id>` restarts the runtime with a new model and starts a new session; a failed switch attempts to restore the previous model.
- `Ctrl+O` toggles verbose mode for full reasoning and tool I/O.
- `Esc` closes overlays (help, command menu) first; in the normal view, press twice to quit.
- `Ctrl+L` redraws the screen without clearing the session.
- Type `@` at any position in the message to search workspace files and directories; use `Tab`, `↑`, or `↓` to select, then Enter to insert the reference.
- On send, selected files are appended with their contents and selected directories with a bounded listing; references must stay inside the workspace.

Tool output is truncated by display mode; the raw payload stays in the session projection. When the transcript is tight, the composer stays visible.

Assistant messages render common Markdown including headings, lists, quotes, inline code, fenced code, tables, and links. During streaming, completed Markdown blocks stay stable and only the growing final block is reparsed, so long replies do not reparse their full history for every token.

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
| `/lang zh` / `/lang en`        | Switch between Chinese and English UI                                       |
| `/model <model-id>`            | Switch models and start a new session                                       |
| `/resume`                      | Open the read-only local session picker for this workspace                  |
| `/use byok` / `/use cocode`    | Switch between your key and Cocode; switching starts a new session          |
| `/login` / `/logout`           | Sign in or out of Cocode Cloud; logout keeps your key and stays in chat     |
| `/exit`                        | Shut down TUI and restore the terminal                                      |

`/resume` reads local session headers and supports text filtering plus `↑` `↓` selection. Enter only explains that the current harness SDK has no `session/open` or `session/resume` wire; it does not change the active session.

## Errors

Failures show `CODE · explanation` on the status line. Language follows `COCODE_LANG`, then `LANG` / `LC_MESSAGES`. Full catalog: [error codes](./errors.md).

## Several terminals

You can run several TUI windows against the same home and the same channels. Each window is its own process and `sessionId`; in-flight turns do not affect each other.

If another TUI window is still open, `/use`, `/login`, and `/logout` refuse so they cannot rewrite the machine-wide default channel or tear down the Cloud slot. Close the other windows, then switch or sign out in the one that remains. Different providers per window is not a current product capability.

## Not wired yet

Cancel/steer, approvals, rewind, the skills menu, copy selection, and `Ctrl+G` external editor are not bound in TUI. Those need a harness wire, an explicit manifest, or later interaction work. The UI does not draw fake controls.
