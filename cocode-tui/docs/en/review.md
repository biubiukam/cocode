# Code review

[中文](../zh/review.md) · [English](./review.md)

`/review` starts a read-only review in the current Git workspace. The TUI does not edit files, stage changes, or create commits.

## Review scopes

| Command                | Scope                                            |
| ---------------------- | ------------------------------------------------ |
| `/review`              | Open the scope picker                            |
| `/review working-tree` | Unstaged and staged local changes                |
| `/review staged`       | Staged changes                                   |
| `/review last-commit`  | The latest commit                                |
| `/review branch`       | The current branch compared with its base branch |

The preview reports files, added and removed lines, and a bounded patch. Binary files, oversized files, and truncated content are marked explicitly. After confirmation, the review context is sent into the current session and the result remains a normal assistant message.

Review output asks for severity, file, line, problem, reason, and a concrete fix. When no findings exist, the response should say so instead of adding filler findings.

## Safety limits

- Git commands are read-only and never run through a shell.
- Patch size is capped so a large repository cannot fill the terminal or context.
- A non-Git directory, missing base branch, or Git failure produces a notice without disabling ordinary chat.
