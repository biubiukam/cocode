# Cocode TUI render contract PTY checklist

Automatic render contracts do not replace a real terminal pass. Record the terminal application,
shell, date, commit, and result for each run.

## Required viewports

- [x] 80×24: real PTY started and reached ready; compact layout had no Inspector.
- [x] 120×30: real PTY started and reached ready; wide Inspector was visible.
- [x] 160×35: real PTY started and reached ready; wide Inspector was visible.

## Required interactions

- [x] Entered Chinese text, emoji, and a combining character in a real 80×24 PTY without a
      runtime crash; the later escape/mouse bytes were typed literally by the PTY driver and are
      not claimed as successful Alt+Arrow/mouse decoding.
- [ ] Use mouse wheel/click/drag in transcript, overlay, and Inspector.
- [ ] Use Alt+Arrow for Inspector scrolling and the configured detail shortcuts.
- [x] Automated Ink resize coverage confirmed compact → wide → compact has no stale Inspector or
      duplicate footer; real PTY resize twice remains pending.
- [x] Automated blocking approval coverage confirmed Enter/action-menu and Esc cancellation.

## Evidence

| Field | Value |
| --- | --- |
| Date | 2026-08-16 |
| Commit | `aeff55723c0c3f43b599e721f6855475a3e5232b` (worktree dirty; not a release commit) |
| Terminal | macOS `script(1)` real PTY; Terminal.app Computer Use was safety-blocked |
| Shell | zsh → `script` → `sh -c 'stty columns … rows …; pnpm run dev'` |
| 80×24 | ready, max parsed frame width 80, no Inspector; `/tmp/cocode-pty-80.log` and interaction log |
| 120×30 | ready, max parsed frame width 120, Inspector visible; `/tmp/cocode-pty-120-real.log` |
| 160×35 | ready, max parsed frame width 160, Inspector visible; `/tmp/cocode-pty-160-real.log` |
| Notes / artifact path | logs are local temporary evidence; automated contract remains authoritative for deterministic states |

Until this checklist has current evidence, report only “automatic render contract passed”, not
“terminal experience fully accepted”.
