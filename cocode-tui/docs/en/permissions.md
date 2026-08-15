# Permissions and approvals

[中文](../zh/permissions.md) · [English](./permissions.md)

The harness enforces permission policy. The TUI displays the active mode and returns approval decisions. Permission controls remain unavailable when the runtime does not advertise the required capability.

## Modes

| Mode        | Meaning                                                               |
| ----------- | --------------------------------------------------------------------- |
| `manual`    | File writes and high-risk tools require confirmation                  |
| `auto-edit` | Policy-approved file edits may proceed; other risky actions still ask |
| `plan`      | Planning and reads only; the harness blocks writes                    |
| `auto`      | Shown only when the runtime explicitly supports it                    |

Press `Shift+Tab` to cycle modes. Use `Ctrl+M` when a terminal cannot report that key combination reliably. The approval panel supports allow once (Enter or `a`), allow for the turn (`t`), deny, and cancel.

Timeouts, runtime disconnects, and duplicate responses fail closed. Composer input cannot leak into an active approval panel. Legacy sessions without a permission field display as `manual`.
