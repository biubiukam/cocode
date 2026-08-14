# Cocode TUI 使用指南

[中文](./usage.md) · [English](../en/usage.md)

## 启动前

先准备 sibling `cocode-harness`，然后在 `cocode-tui/.env` 中设置：

```dotenv
COCODE_HARNESS_CMD=node
COCODE_HARNESS_ARGS=--import,tsx/esm,../../cocode-harness/packages/examples/jsonrpc-demo/src/bin.ts
DSH_CORDIS_CONFIG=../../cocode-harness/examples/jsonrpc-agent/cordis.cocode.yml
```

密钥可以通过首屏登录配置，也可以临时设置 `DEEPSEEK_API_KEY`。开发环境可用 `COCODE_HOME` 指向单独目录；会话目录默认使用该目录下的 `sessions`，也可以用 `DSH_SESSION_ROOT` 覆盖。

## 界面分区

- 顶部显示工作区、git 分支、session、provider、model 和实时 Agent 状态。
- 中间是会话投影：`you`、`cocode`、思考内容和工具结果按节点分组显示。
- 底部状态栏显示运行状态、notice 以及已有的输入/输出 token 用量。
- 输入区使用带边框的 `prompt` 面板；runtime 不可用时会显示 `locked`，不会继续伪装成可编辑状态。
- `/` 命令菜单和 `?` 帮助面板会占用自己的布局空间，消息区会自动缩小以保持输入区可见。

## 对话编辑

- `Enter` 发送；`Shift+Enter` 换行。
- `←` `→` 移动光标，`Backspace` 删除光标前的字符。
- `↑` `↓` 查看本地输入历史。
- `Ctrl+O` 切换详细模式，查看完整思考内容和工具输入输出。
- `Esc` 在帮助、命令菜单等弹层中先关闭弹层；普通状态下按两次退出或结束当前 TUI。
- `Ctrl+L` 重绘界面，不清除会话内容。

工具输出会按显示模式截断，原始内容仍保留在会话投影中。对话区空间不足时，输入区保持可见。

## Slash 命令

输入 `/` 会打开命令菜单。继续输入可按前缀过滤，使用 `Tab` 或方向键选择，回车执行；输入空格后回到普通文本编辑。

| 命令                           | 作用                                                      |
| ------------------------------ | --------------------------------------------------------- |
| `/help`                        | 查看快捷键和当前可用命令                                  |
| `/status`                      | 查看会话、模型、运行时和授权模式                          |
| `/doctor`                      | 查看 TTY、启动参数、初始化结果、会话根和关闭的 capability |
| `/clear`                       | 清除当前屏幕投影，不删除 session log                      |
| `/new`                         | 创建新的 session id，不复制旧会话                         |
| `/export`                      | 将当前投影导出为 Markdown 文件                            |
| `/init`                        | 仅在缺少 `AGENTS.md` 时创建最小工作区模板                 |
| `/theme dark` / `/theme light` | 切换显示主题                                              |
| `/resume`                      | 列出当前工作区的本地 session 历史                         |
| `/use byok` / `/use cocode`    | 在自己的 Key 和 Cocode 之间切换；切换即新会话             |
| `/login` / `/logout`           | 登录或退出 Cocode Cloud；退出时若还有 Key 则留在对话里    |
| `/exit`                        | 关闭 TUI 并恢复终端                                       |

`/resume` 当前只读取并列出历史。现有 harness SDK 没有 `session/open` 或 `session/resume` wire，因此不会伪装成可以继续旧会话。

## 错误

失败时状态栏显示 `CODE · 解释`。语言由 `COCODE_LANG` 决定，未设置时跟随 `LANG` / `LC_MESSAGES`。完整目录见 [错误码](./errors.md)。

## 多个终端

可以同时开多个 TUI，共用同一份家目录和同一套通道。每个窗口是独立进程、独立 `sessionId`，互不影响正在进行的对话。

若还有其它 TUI 窗口开着，`/use`、`/login`、`/logout` 会拒绝执行，避免改掉全机默认通道或拆掉 Cloud 槽。先关掉其它窗口，再在留下的那个窗口里切换或退出。多个窗口各用不同 provider 不是当前产品能力。

## 当前未接入的交互

取消/steer、审批、rewind、技能菜单、`@` 文件补全、`Ctrl+R` 历史搜索和 `Ctrl+G` 外部编辑器尚未绑定到 TUI 交互。这些能力需要对应的 harness wire、显式 manifest 或后续交互接线；界面不会显示假控件。
