# 权限与审批

[中文](./permissions.md) · [English](../en/permissions.md)

权限策略由 harness 执行，TUI 只显示当前模式并转发审批结果。下面列出常见模式示例，实际可选项以 runtime 返回的 `supportedModes` 为准。Runtime 没有提供对应 capability 时，权限入口不会显示为可用。

## 模式

| 模式        | 含义                                             |
| ----------- | ------------------------------------------------ |
| `manual`    | 写入和高风险工具需要用户确认                     |
| `auto-edit` | 允许受策略约束的文件编辑，其他高风险操作仍需确认 |
| `plan`      | 只规划和读取，写入由 harness 阻止                |
| `auto`      | 仅在 runtime 明确支持时提供                      |

使用 `Shift+Tab` 循环模式。部分终端无法可靠传递该组合键时，可以使用 `Ctrl+M`。审批面板支持「允许一次」（回车或 `a`）、「允许本轮」（`t`）、「拒绝」和取消。

审批超时、runtime 断开或重复响应都按拒绝处理，不会让 Composer 接收误输入。旧 session 没有权限字段时显示为 `manual`。
