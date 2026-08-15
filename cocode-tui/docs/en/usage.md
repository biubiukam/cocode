# Cocode TUI usage

[中文](../zh/usage.md) · [English](./usage.md)

## Install a release package

Requires Node.js 22.19.x or Node.js 24 and later.

The release package contains the terminal client and Cocode companion plugin.
The Harness model, tool, and session runtime is built separately:

```sh
cd /path/to/cocode-harness
pnpm install --frozen-lockfile
pnpm run build

cd /path/to/cocode-tui
pnpm run build
npm pack
npm install --global ./cocode-tui-0.1.0.tgz
```

After publication, install it directly with `npm install --global @cocode/tui`.

Point the CLI at the built runtime and verify the installation:

```sh
export COCODE_HARNESS_ROOT=/path/to/cocode-harness
cocode --doctor
cocode
```

`COCODE_HARNESS_ROOT` must point to a built Harness checkout containing
`packages/examples/jsonrpc-demo/src/runner.ts` (or its built runner) and
`examples/package.json`.
The CLI uses the current directory as the Agent workspace. Set `COCODE_HOME` to
isolate the Cocode account, `DSH_HOME` to isolate the official Harness home,
or `DSH_SESSION_ROOT` to move session files.

The first launch opens the authentication gate. Choose a DeepSeek API key or
sign in to Cocode. Later launches reuse the local configuration. The `cocode`
command's `--help`, `--version`, and `--doctor` options do not require a TTY and
are suitable for installation scripts and troubleshooting.

## Before launch

Prepare a sibling `cocode-harness` clone, then set `cocode-tui/.env`:

```dotenv
COCODE_HARNESS_CMD=node
COCODE_HARNESS_ARGS=--import,tsx/esm,scripts/companion-runner.mjs
DSH_CORDIS_CONFIG=companion/cordis.yml
```

Both `scripts/companion-runner.mjs` and `companion/cordis.yml` belong to `cocode-tui`. The runner only calls the sibling Harness generic boot entry and uses the sibling Harness as the bare-module resolution base. The companion is the sole stdio JSON-RPC owner, so the official `sdk-jsonrpc-server` is not loaded. The plugin source does not need to be copied into `cocode-harness`, and no Harness source is modified.

The local sibling-Harness composition is currently verified on macOS. Windows, Linux, and real terminal key combinations still require separate acceptance as described in [platform notes](./platforms.md); automated tests are not a substitute for a real TTY check.

Configure a key on the first-run gate, or set `DEEPSEEK_API_KEY` for this process. For development, point `COCODE_HOME` at a separate account directory and `DSH_HOME` at a separate Harness directory. DSH settings and credentials follow the official `$DSH_HOME` layout; sessions default to `$DSH_HOME/sessions`, or `~/.dsh/sessions` when `DSH_HOME` is unset. `DSH_SESSION_ROOT` can override the session directory.

The same build runs on Windows, macOS, and Linux. On Windows, `notepad.exe` is used when neither `$VISUAL` nor `$EDITOR` is configured. WSL uses Linux process semantics and can fall back to `clip.exe` and `explorer.exe`; configure a GUI editor with a wait flag when using an editor such as VS Code.

## Screen regions

Set `COCODE_TUI_SCREEN=inline` (the default) to keep the main screen and scrollback, or `alternate` for a fullscreen alternate buffer that is restored on exit. Legacy Windows consoles without alternate-buffer support fall back to `inline`.

Inside `tmux` or `screen`, the TUI automatically uses inline rendering and suppresses terminal notifications because nested alternate-screen and OSC sequences are not reliable there.

- The header shows the workspace, git branch, session, provider, model, and live Agent state.
- The transcript projects `you`, `cocode`, reasoning, and tool results as separate node groups.
- The status bar shows runtime state, notices, and input/output token usage when supplied by the runtime.
- The composer is a bordered `prompt` panel that shows the current `Build` / `Plan` mode; a dead runtime is shown as `locked` instead of looking editable.
- The `/` command menu, pickers, and confirmation panels open as centered floating popups. The transcript shrinks first, then popup height is bounded by the remaining rows.
- A multiline draft shows at most six logical lines around the cursor without deleting the full draft. If the fixed chrome cannot fit, the TUI asks for a taller terminal and pauses ordinary input.

## Editing

- `Enter` sends; `Shift+Enter` inserts a newline.
- `←` `→` move the cursor; `Backspace` deletes the character before it.
- `↑` `↓` walk local input history.
- `Ctrl+R` opens history search; type to filter recent messages, use `↑` `↓` to select, Enter to restore the draft, and `Esc` to close.
- `Ctrl+G` opens the draft in `$VISUAL` or `$EDITOR`; the edited Markdown is restored to the composer when the editor exits. Non-zero exits, invalid UTF-8, and drafts over 256 KiB are reported as errors.
- `Shift+↑` enters message selection; use `↑` `↓` to move, Enter to expand or collapse the current message, and `Esc` to exit.
- On terminals that support mouse reporting, the TUI captures mouse drags and selects text inside the Transcript. The selection is clipped to the message area, so the right-side Inspector is not included. Releasing the mouse copies the selection; `Ctrl+C` or `Ctrl+Y` copies it again, and `Esc` clears it. Press `Alt+M` to toggle mouse menu mode; clicking the underlined model name opens the model picker, while clicking elsewhere in the header opens the command menu. The picker groups models by provider and supports filtering, arrow keys, Enter, and mouse selection; runtimes without a model catalog fall back to manual model-id input. Switching still restarts the runtime and starts a new session. Popups temporarily suspend message text selection and restore it when they close. Message actions remain available through `Shift+↑`, then `m`.
- Press `c` in message selection to copy the current node, or use `/copy` to copy the latest assistant reply. The TUI tries macOS `pbcopy`, Windows `clip.exe`, then Linux `wl-copy`, `xclip`, and `xsel`; an unavailable command produces a notice without interrupting the session.
- `/focus` toggles a local latest-turn view. When enabled, the transcript shows the most recent user message and every node after it, and the status line shows `focus: latest turn`. It only changes the projection, so `/clear`, `/resume`, `/rewind`, export, and the persisted session log keep their existing semantics. Toggle it again to return to the normal full-transcript view.
- `/lang zh` or `/lang en` switches the interface immediately; startup language follows `COCODE_LANG`, `LANG`, and related locale variables.
- `/model` and `/models` without arguments open the model picker; `/model <model-id>` switches the current provider directly. The picker can switch provider and model together. Every switch restarts the runtime and starts a new session; a failed switch attempts to restore the previous provider/model. Older runtimes without a model catalog still accept a manually entered model id.
- Reasoning is expanded by default while it streams, then folds back to a summary when the reply is complete; `Ctrl+O` keeps full reasoning and tool I/O expanded.
- While a turn is running, the status line shows `thinking…` so a quiet interval before the next stream chunk is distinguishable from an idle runtime. It also shows the latest assistant input/output usage and current subagent activity when the wire reports it. When optional events are present, it also shows decode TPS, cache hit rate, context-window percentage, reasoning effort, current working activity, compact context segments (`S/P/A/T/X` for system, prompt, assistant, thinking, and tools), todo progress, goal phase, and the active agent preset. Segment values are estimates based on text length, not provider billing data.
- When the runtime supports plan mode, press `Tab` while idle to switch the composer between `Build` and `Plan`. Open Slash-command and `@` file pickers keep using `Tab` for selection.
- While a turn is running, the footer changes to `esc interrupt`; type a draft and press `Tab` to queue it. Up to eight queued prompts are sent in order after `session.status=idle`; this is local queuing, not steer or cancellation.
- Use `/queue` while prompts are queued to inspect them. Type to filter, use `↑`/`↓` to select, `Enter` to move the selected prompt to the front, and `Ctrl+D` to remove it. When the runtime is idle after a send failure, `Enter` retries the selected prompt immediately. The picker closes with `Esc`; an empty queue produces a notice instead of an empty overlay. Queued text is not written to the session log until it is actually sent. If sending fails, the prompt is restored to the front. The local queue is cleared when the runtime restarts or the session changes.
- The main area keeps a compact Checklist summary below the conversation. Use `/todos` to open the full current-turn Checklist. It shows each task as completed, in progress, or pending; use `↑`/`↓` to select, click a row in mouse mode, and press `Esc` to close. The list is driven by Harness `todo/write` events rather than local edits, and is cleared when the next turn starts.
- `/review` opens a read-only Git review. Choose `working-tree`, `staged`, `last-commit`, or `branch`; inspect the bounded summary, then press Enter to send the structured review context to the current session.
- `Esc` closes overlays (help, command menu) first; while a turn is running, the first press requests cancellation and the second exits. When idle, press twice to quit.
- `Ctrl+L` redraws the screen without clearing the session.
- Set `COCODE_TUI_KEYMAP` to a JSON object to override shortcuts, for example
  `COCODE_TUI_KEYMAP='{"historySearch":"ctrl+f","editorOpen":"alt+e"}'`. Keys may use the command id shown by help (such as
  `history.search`) or its camel-case alias. Only existing command ids are accepted; invalid JSON, command names, or key values keep the defaults and write a diagnostic to stderr. Use the platform-neutral `ctrl`, `alt`, `shift`, and names such as `enter`, `escape`, `up`, and `down`; the same parser is used on Windows, macOS, and Linux.
- Type `@` at any position in the message to search workspace files and directories; use `Tab`, `↑`, or `↓` to select, then Enter to insert the reference.
- On send, selected files are appended with their contents and selected directories with a bounded listing; references must stay inside the workspace.
- When the runtime exposes a Skills registry, `/skills` opens a searchable workspace catalog. Select a skill to insert `/skill-name ` into the composer, then edit the prompt before sending. The command stays hidden when the runtime does not mount a Skills registry.
- When an agent calls `ask_user_question`, the composer is replaced by a question panel. Use `↑` `↓` to move, `Space` to toggle multiple choices, `Tab` to reach the custom answer, `Enter` to answer, and `Esc` to cancel. Batched and concurrent requests are presented in FIFO order.

Tool output is truncated by display mode; while a node remains in the projection cache, its raw payload is retained in node state, and the complete event stays in the session log. When the transcript is tight, the composer stays visible.

Long sessions use a bounded projection cache: by default it retains up to 2,048 completed nodes and about 8 MiB of node state. A streaming assistant node or a tool waiting for its result is kept until it is complete; once a budget is exceeded, the oldest completed nodes are evicted first and the status line reports the hidden count. The persisted JSONL remains the full source of truth, and `/resume` replays hidden history again.

Assistant messages render common Markdown including headings, lists, quotes, inline code, fenced code, tables, and links. During streaming, completed Markdown blocks stay stable and only the growing final block is reparsed, so long replies do not reparse their full history for every token.

Assistant messages render common Markdown including headings, lists, quotes, inline code, fenced code, tables, and links. During streaming, completed Markdown blocks stay stable and only the growing final block is reparsed, so long replies do not reparse their full history for every token.

## Slash commands

Type `/` to open the command menu. Keep typing to filter by prefix. `Tab` or arrows select; Enter runs the command. A space returns you to ordinary text editing.

| Command                        | What it does                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `/help`                        | Keyboard shortcuts and currently available commands                                               |
| `/status`                      | Session, model, runtime, and auth mode                                                            |
| `/doctor`                      | TTY, launch flags, initialize result, session root, and configured/runtime capability differences |
| `/clear`                       | Clear the on-screen projection; does not delete the session log                                   |
| `/new`                         | Start a new session id (not a fork)                                                               |
| `/compact`                     | Request host conversation compaction through the prompt path                                      |
| `/export`                      | Export the current projection as Markdown                                                         |
| `/copy`                        | Copy the latest assistant reply to the system clipboard                                           |
| `/focus`                       | Show or hide the latest user turn in the transcript                                               |
| `/review`                      | Review Git changes with a bounded, read-only diff preview                                         |
| `/queue`                       | Inspect, reorder, or remove local queued prompts                                                  |
| `/todos`                       | Show the current-turn Checklist                                                                  |
| `/permissions` / `/plan`       | Cycle permission mode or toggle plan mode when the runtime advertises them                        |
| `/fork`                        | Choose a user message, then create a child session from that boundary                             |
| `/clone`                       | Create a child session from the current conversation                                              |
| `/tree`                        | Show the session tree; uses RPC metadata first and JSONL fallback when available                  |
| `/sessions`                    | Show the runtime session list; available only when RPC session listing is advertised              |
| `/init`                        | Create a minimal `AGENTS.md` only when the workspace has none                                     |
| `/theme dark` / `/theme light` | Switch the display theme                                                                          |
| `/lang zh` / `/lang en`        | Switch between Chinese and English UI                                                             |
| `/model`                      | Open the model picker                                                                             |
| `/models`                     | Open the model picker                                                                             |
| `/model <model-id>`            | Switch the current provider's model and start a new session                                       |
| `/resume`                      | Open the local session picker and replay a selected session                                       |
| `/skills`                      | Browse user-invocable skills from the current workspace                                           |
| `/use byok` / `/use cocode`    | Switch between your key and Cocode; switching starts a new session                                |
| `/login` / `/logout`           | Sign in or out of Cocode Cloud; logout keeps your key and stays in chat                           |
| `/exit`                        | Shut down TUI and restore the terminal                                                            |

`/resume` reads local session headers, supports text filtering plus `↑` `↓` selection, streams the selected JSONL into a temporary projection, and asks the runtime to reopen the same persisted session before swapping it into the current TUI. Follow-up prompts use the selected session id and continue writing to that session. The TUI does not claim cross-process locking; avoid resuming a session that another client is currently writing.

`/fork` opens a picker of user messages, newest first. Press `↑`/`↓` to choose a boundary, then press Enter twice to confirm. The runtime creates the child session and replaces the current live session through the fork wire. Use `/clone` when you want to copy the complete current conversation without choosing a boundary.

Each picker row includes a short preview generated from the first user message in the session. Control characters and terminal escape sequences are removed, whitespace is collapsed, and the preview is capped at 72 visible characters so a long prompt cannot expand the picker. If the event cannot be read, the picker falls back to the session working directory; when neither value is available it shows `No summary`. The preview is display-only and does not modify the persisted JSONL.

`/compact` sends the literal `/compact` prompt to the current session. A host compaction plugin must recognize that prompt; the TUI does not claim compaction succeeded without a corresponding event.

When a turn changes from running to idle, the TUI sends an OSC 9 terminal notification by default. Set `COCODE_TUI_NOTIFY=off` to disable it, or `osc777` for terminals that support OSC 777. Notifications are best-effort terminal control sequences; a write failure does not affect the session.

## Errors

Failures show `CODE · explanation` on the status line. Language follows `COCODE_LANG`, then `LANG` / `LC_MESSAGES`. Full catalog: [error codes](./errors.md).

## Several terminals

You can run several TUI windows against the same home and the same channels. Each window is its own process and `sessionId`; in-flight turns do not affect each other.

If another TUI window is still open, `/use`, `/login`, and `/logout` refuse so they cannot rewrite the machine-wide default channel or tear down the Cloud slot. Close the other windows, then switch or sign out in the one that remains. Different providers per window is not a current product capability.

## Runtime capability boundaries

The `/skills` command is enabled only after `skills/list` returns a real catalog from the harness. A composition without `@deepseek-ai/dsh-skill` (and a provider such as `@deepseek-ai/dsh-skill-filesystem`) keeps the command hidden; an empty or failed probe is not presented as a usable feature.

In `/doctor`, `caps-configured` is what the TUI expects from local configuration and implementation, while `caps-runtime` is the result of probing the live JSON-RPC runtime after initialization. When they differ, the runtime result wins; `caps-errors` explains disabled capabilities. Probes use a random, non-existent session id and do not create or mutate a user session.

Interactive questions require the harness composition to mount the user-questions service and an ask-user consumer. The SDK server then forwards `question/ask` to the TUI and waits for the complete answer batch. A composition without that service does not register the terminal as a question provider.
