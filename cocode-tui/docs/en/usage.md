# Cocode TUI usage

[中文](../zh/usage.md) · [English](./usage.md)

## Install a release package

Requires Node.js 22.19.x or Node.js 24 and later.

The release package contains the terminal client. The shared Supervisor pulls
the versioned `@deepseek-ai/dsh` runtime from npm and starts or discovers one
Host per profile:

```sh
cd /path/to/cocode-tui
pnpm run build
npm pack
npm install --global ./cocode-tui-0.1.0.tgz
```

After publication, install it directly with `npm install --global @cocode/tui`.

Verify the Supervisor, Host descriptor, JSON-RPC service, and lease lifecycle:

```sh
cocode --doctor
cocode
```

The CLI uses the current directory as the Agent workspace. Set `COCODE_HOME` to
isolate the Cocode account, `DSH_HOME`/`DSH_PROFILE` to select the shared Host
scope, or `DSH_SESSION_ROOT` to move session files.

The first launch opens the authentication gate. Choose a DeepSeek API key or
sign in to Cocode. Later launches reuse the local configuration. The `cocode`
command's `--help`, `--version`, and `--doctor` options do not require a TTY and
are suitable for installation scripts and troubleshooting.

## Before launch

No Desktop installation or separate runtime checkout is required. The first TUI
or Desktop client for a scope starts the Supervisor and DSH Host; later clients
acquire another lease and connect to the existing Host. Configure `DSH_HOME`,
`DSH_PROFILE`, or `COCODE_HOST_CONFIG_FINGERPRINT` only when the default shared
scope is not appropriate.

The local Supervisor and DSH Host flow is currently verified on macOS. Windows,
Linux, and real terminal key combinations still require separate acceptance as
described in [platform notes](./platforms.md); automated tests are not a
substitute for a real TTY check.

Configure a key on the first-run gate, or set `DEEPSEEK_API_KEY` for this process.
For development, point `COCODE_HOME` and `DSH_HOME` at separate directories.
DSH settings and credentials follow the official `$DSH_HOME` layout; sessions
default to `$DSH_HOME/sessions`, or `~/.dsh/sessions` when `DSH_HOME` is unset.
`DSH_SESSION_ROOT` can override the session directory.

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
- `Ctrl+V` reads a PNG, JPEG, WebP, or GIF from the system clipboard; `/paste-image` provides the same action when a terminal reserves that key. Images remain local drafts until send, and deleting their `[Image: ...]` marker removes them. The limit is 5 MiB per image and 20 images per prompt.
- `Shift+↑` enters message selection; use `↑` `↓` to move, Enter to expand or collapse the current message, and `Esc` to exit.
- Mouse tracking stays off in narrow layouts. At 120 columns or wider, the Inspector enables mouse tracking for resize and panel interaction, which can affect native drag-selection in some terminals. Models, commands, questions, and message actions remain keyboard accessible; open the command menu with `Ctrl+P`, or press `Shift+↑` and then `m` for message actions.
- Press `c` in message selection to copy the current node, or use `/copy` to copy the latest assistant reply. The TUI tries macOS `pbcopy`, Windows `clip.exe`, then Linux `wl-copy`, `xclip`, and `xsel`; an unavailable command produces a notice without interrupting the session.
- `/focus` toggles a local latest-turn view. When enabled, the transcript shows the most recent user message and every node after it, and the status line shows `focus: latest turn`. It only changes the projection, so `/clear`, `/resume`, `/rewind`, export, and the persisted session log keep their existing semantics. Toggle it again to return to the normal full-transcript view.
- `/lang zh` or `/lang en` switches the interface immediately; startup language follows `COCODE_LANG`, `LANG`, and related locale variables.
- `/model` and `/models` without arguments open the model picker; `/model <model-id>` switches the current provider directly. The picker can switch provider and model together. When the restarted runtime supports durable session open, the current session is reopened so its context remains available; otherwise the TUI starts a new session. A failed switch attempts to restore the previous provider/model. Older runtimes without a model catalog still accept a manually entered model id.
- Reasoning is expanded by default while it streams, then folds back to a summary when the reply is complete; `Ctrl+O` keeps full reasoning and tool I/O expanded.
- While a turn is running, the status line shows `thinking…` so a quiet interval before the next stream chunk is distinguishable from an idle runtime. It also shows the latest assistant input/output usage and current subagent activity when the wire reports it. When optional events are present, it also shows decode TPS, cache hit rate, context-window percentage, reasoning effort, current working activity, compact context segments (`S/P/A/T/X` for system, prompt, assistant, thinking, and tools), todo progress, goal phase, and the active agent preset. Segment values are estimates based on text length, not provider billing data.
- When the runtime supports plan mode, press `Tab` while idle to switch the composer between `Build` and `Plan`. Open Slash-command and `@` file pickers keep using `Tab` for selection.
- `/permissions` cycles the current session through `read-only`, `workspace-write`, and `danger-full-access`. New sessions default to `workspace-write`; set `DSH_PERMISSION_MODE` to change it. Shell and file writes share the same session policy. A one-off escalation from `workspace-write` requires approval; `danger-full-access` does not prompt.
- While a turn is running, the footer changes to `esc interrupt`; type a draft and press `Tab` to queue it. Up to eight queued prompts are sent in order after `session.status=idle`; this is local queuing, not steer or cancellation.
- Use `/queue` while prompts are queued to inspect them. Type to filter, use `↑`/`↓` to select, `Enter` to move the selected prompt to the front, and `Ctrl+D` to remove it. When the runtime is idle after a send failure, `Enter` retries the selected prompt immediately. The picker closes with `Esc`; an empty queue produces a notice instead of an empty overlay. Queued text is not written to the session log until it is actually sent. If sending fails, the prompt is restored to the front. The local queue is cleared when the runtime restarts or the session changes.
- The main area keeps a compact Checklist summary below the conversation. Use `/todos` to open the full current-turn Checklist. It shows each task as completed, in progress, or pending; use `↑`/`↓` to select and press `Esc` to close. The list is driven by Host `todo/write` events rather than local edits, and is cleared when the next turn starts.
- `/review` opens a read-only Git review. Choose `working-tree`, `staged`, `last-commit`, or `branch`; inspect the bounded summary, then press Enter to send the structured review context to the current session.
- `Esc` closes overlays (help, command menu) first; while a turn is running, the first press requests cancellation and the second exits. When idle, press twice to quit.
- `Ctrl+L` opens the model picker, matching Crush's model-switch workflow. Use `/redraw` to redraw the screen without clearing the session.
- Set `COCODE_TUI_KEYMAP` to a JSON object to override shortcuts, for example
  `COCODE_TUI_KEYMAP='{"historySearch":"ctrl+f","editorOpen":"alt+e"}'`. Keys may use the command id shown by help (such as
  `history.search`) or its camel-case alias. Only existing command ids are accepted; invalid JSON, command names, or key values keep the defaults and write a diagnostic to stderr. Use the platform-neutral `ctrl`, `alt`, `shift`, and names such as `enter`, `escape`, `up`, and `down`; the same parser is used on Windows, macOS, and Linux.
- Type `@` at any position in the message to search workspace files and directories; use `Tab`, `↑`, or `↓` to select, then Enter to insert the reference.
- On send, selected files are appended with their contents and selected directories with a bounded listing; references must stay inside the workspace.
- When the Host exposes user-invocable Skills, `/skills` opens a searchable workspace catalog and inserts `/skill-name ` into the composer for further editing. User-invocable Skills also appear in the `/` command menu and are sent through `session.prompt` as text. The command stays hidden when the catalog is empty.
- When the Host exposes its human-command registry, registered commands appear in the `/` menu and execute through `commands/execute` against the current Agent instead of becoming model prompts. The base composition currently provides `/goal` with `/goal`, `/goal <objective>`, `/goal clear`, `/goal edit <objective>`, `/goal pause`, and `/goal resume`; the Host owns the result text.
- When an agent calls `ask_user_question`, the message area first streams the question being prepared; once the complete request arrives, the composer is replaced by a question panel. Use `↑` `↓` to move, `Space` to toggle multiple choices, `Tab` to reach the custom answer, `Enter` to answer, `Backspace` or `Delete` to edit custom input, and `Esc` to cancel. Batched and concurrent requests are presented in FIFO order.

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
| `/rewind`                      | Open the conversation rewind picker                                                               |
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
| `/redraw`                     | Redraw the terminal without clearing the session                                                    |
| `/model <model-id>`            | Switch the current provider's model; preserve the session when durable reopen is supported       |
| `/thinking`                    | Toggle detailed thinking and full tool output                                                     |
| `/tokens` / `/cost`            | Show the latest token, cache, and context usage                                                   |
| `/resume`                      | Open the local session picker and replay a selected session                                       |
| `/skills`                      | Browse user-invocable skills from the current workspace                                           |
| `/goal`                        | Inspect or change the current goal through the Host command registry                              |
| `/use byok` / `/use cocode`    | Switch between your key and Cocode; switching starts a new session                                |
| `/login` / `/logout`           | Sign in or out of Cocode Cloud; logout keeps your key and stays in chat                           |
| `/exit` / `/quit` / `/q`       | Shut down TUI and restore the terminal                                                            |

`/resume` reads local session headers, supports text filtering plus `↑` `↓` selection, streams the selected JSONL into a temporary projection, and asks the runtime to reopen the same persisted session before swapping it into the current TUI. Follow-up prompts use the selected session id and continue writing to that session. The TUI does not claim cross-process locking; avoid resuming a session that another client is currently writing.

The runtime session tree marks the attached session with `✓`, live sessions reported as running with `◉`, and known idle sessions with `·`. These activity markers are best-effort notifications from the current runtime and do not claim cross-process locking.

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

The `/skills` command is enabled only after `skills/list` returns a real catalog from the Host. A composition without a skills provider keeps the command hidden; an empty or failed probe is not presented as a usable feature.

The Host advertises the `commands` capability through `cocode/capabilities`. The TUI only shows descriptors returned by the Host and sends the complete command line to `commands/execute`; unknown or failed commands stay errors instead of falling back to a normal prompt.

The Host mounts Cocode's own `cocode-vision` plugin with `autoRead` enabled. `image` blocks are converted into visual evidence before the active text model runs, while the durable attachment reference is retained for native vision models. Choose `cocode` for the Cocode service, whose default vision model is `gpt-luna`, or `user` for a user-managed OpenAI-compatible endpoint. After switching the account to Cocode, the plugin automatically reuses the account-generated `COCODE_LLM_PROVIDERS.cocode-cloud` endpoint and credential reference; it does not select the first model from the cloud catalog. User settings can be persisted in `$COCODE_HOME/vision.yaml` (default `~/.cocode/vision.yaml`); use [vision.yaml.example](./vision.yaml.example) as a template. Environment variables such as `COCODE_VISION_PROVIDER` and `COCODE_VISION_USER_MODEL` override the file. Only credential references are configured here; Host credentials own the actual values, which never enter session logs or TUI settings.

In `/doctor`, `caps-configured` is what the TUI expects from local configuration and implementation, while `caps-runtime` is the result of probing the live JSON-RPC runtime after initialization. When they differ, the runtime result wins; `caps-errors` explains disabled capabilities. Probes use a random, non-existent session id and do not create or mutate a user session.

Interactive questions require the Host composition to mount the user-questions service and an ask-user consumer. The JSON-RPC service then forwards `question/ask` to the TUI and waits for the complete answer batch. A composition without that service does not register the terminal as a question provider.
