# Cocode TUI 使用指南

[中文](./usage.md) · [English](../en/usage.md)

## 启动前

先准备 sibling `cocode-harness`，然后在 `cocode-tui/.env` 中设置：

```dotenv
COCODE_HARNESS_CMD=node
COCODE_HARNESS_ARGS=--import,tsx/esm,../../cocode-harness/packages/examples/jsonrpc-demo/src/bin.ts
DSH_CORDIS_CONFIG=../../cocode-harness/examples/jsonrpc-agent/cordis.cocode.yml
```

密钥可以通过首屏登录配置，也可以临时设置 `DEEPSEEK_API_KEY`。开发环境可用 `COCODE_HOME` 指向单独的配置目录。会话目录默认使用 `$DSH_HOME/sessions`；未设置 `DSH_HOME` 时使用 `~/.dsh/sessions`，也可以用 `DSH_SESSION_ROOT` 覆盖。

## 界面分区

终端呈现方式由 `COCODE_TUI_SCREEN` 控制：`inline`（默认）保留主屏和滚动历史，`alternate` 使用全屏备用缓冲区，退出时恢复原终端。Windows 旧版控制台不支持备用缓冲区时会自动回退到 `inline`。

- 顶部显示工作区、git 分支、session、provider、model 和实时 Agent 状态。
- 中间是会话投影：`you`、`cocode`、思考内容和工具结果按节点分组显示。
- 底部状态栏显示运行状态、notice 以及已有的输入/输出 token 用量。
- 输入区使用带边框的 `prompt` 面板；runtime 不可用时会显示 `locked`，不会继续伪装成可编辑状态。
- `/` 命令菜单和 `?` 帮助面板显示在状态栏与输入区之间；消息区会先缩小，弹层高度也会受剩余空间限制。
- 多行草稿最多显示光标附近 6 行，完整草稿不会被删除；终端高度连固定区域都无法容纳时，会显示调整尺寸提示并暂停普通输入。

## 对话编辑

- `Enter` 发送；`Shift+Enter` 换行。
- `←` `→` 移动光标，`Backspace` 删除光标前的字符。
- `↑` `↓` 查看本地输入历史。
- `Ctrl+R` 打开历史搜索；输入文字过滤最近消息，使用 `↑` `↓` 选择，回车回填到输入区，`Esc` 关闭。
- `Ctrl+G` 使用 `$VISUAL` 或 `$EDITOR` 打开临时 Markdown 草稿；退出编辑器后内容回填到输入区。编辑器退出码非 0、草稿不是 UTF-8 或超过 256 KiB 时会显示错误。
- `Shift+↑` 进入消息选择模式；使用 `↑` `↓` 移动，回车展开或收起当前消息，`Esc` 退出。
- `/lang zh` 或 `/lang en` 立即切换界面语言；未指定时启动语言由 `COCODE_LANG`、`LANG` 等环境变量决定。
- `/model <model-id>` 通过 runtime restart 切换当前模型，并创建新 session；切换失败会尝试恢复原模型。
- `Ctrl+O` 切换详细模式，查看完整思考内容和工具输入输出。
- 对话运行中，状态栏会显示「思考中…」。即使下一段流式输出暂时没有到达，也能和空闲状态区分开。状态栏还会显示最近一次 assistant 的输入/输出 token，以及 wire 已报告的当前子代理活动。收到可选事件后，还会显示解码 TPS、缓存命中率、上下文窗口占用比例、推理等级、当前工作状态、紧凑的上下文分段（`S/P/A/T/X` 分别表示系统、输入、回复、思考和工具）、待办进度、目标阶段和当前 agent preset。分段数值按文本长度估算，不代表 provider 的计费数据。
- 当前任务运行时按 `Tab` 可将输入加入队列，最多 8 条；收到 `session.status=idle` 后按顺序自动发送。这是本地排队，不会打断当前任务，也不是 steer。
- `Esc` 在帮助、命令菜单等弹层中先关闭弹层；任务运行时第一次请求取消，第二次退出；空闲时连续按两次退出 TUI。
- `Ctrl+L` 重绘界面，不清除会话内容。
- 在消息任意位置输入 `@` 可搜索工作区文件和目录；使用 `Tab`、`↑`、`↓` 选择，回车插入引用。
- 发送时会在消息末尾附加选中文件内容，目录则附加受限的目录列表；文件必须位于当前工作区内。
- 当 runtime 挂载 Skills registry 时，`/skills` 会打开可搜索的工作区技能目录。选择技能后会向输入区插入 `/技能名 `，可以继续编辑 prompt 再发送；未挂载 registry 时不会显示该命令。
- Agent 调用 `ask_user_question` 时，输入区会切换为问卷面板。使用 `↑` `↓` 移动，空格勾选多个选项，`Tab` 切换到自定义答案，回车回答，`Esc` 取消。批量问题和并发请求按 FIFO 顺序显示。

工具输出会按显示模式截断；未被投影缓存淘汰时，原始内容仍保留在节点状态，完整事件始终保存在 session log 中。对话区空间不足时，输入区保持可见。

长会话使用有界投影缓存：默认最多保留 2048 个已完成节点和约 8 MiB 的节点状态。正在流式输出的 assistant 或尚未返回结果的工具不会被淘汰；超过预算后会优先移除最早的已完成节点，状态栏会显示隐藏数量。持久化 JSONL 仍是完整真源，`/resume` 会重新回放被隐藏的历史。

助手消息支持标题、列表、引用、行内代码、代码块、表格和链接等常用 Markdown。流式输出时，已经结束的 Markdown 块会保持稳定，只有最后一个正在增长的块重新解析，避免长回复每个 token 都重算全文。

## Slash 命令

输入 `/` 会打开命令菜单。继续输入可按前缀过滤，使用 `Tab` 或方向键选择，回车执行；输入空格后回到普通文本编辑。

| 命令                           | 作用                                                      |
| ------------------------------ | --------------------------------------------------------- |
| `/help`                        | 查看快捷键和当前可用命令                                  |
| `/status`                      | 查看会话、模型、运行时和授权模式                          |
| `/doctor`                      | 查看 TTY、启动参数、初始化结果、会话根和关闭的 capability |
| `/clear`                       | 清除当前屏幕投影，不删除 session log                      |
| `/new`                         | 创建新的 session id，不复制旧会话                         |
| `/compact`                     | 通过 prompt 路径请求 host 压缩当前会话                    |
| `/export`                      | 将当前投影导出为 Markdown 文件                            |
| `/init`                        | 仅在缺少 `AGENTS.md` 时创建最小工作区模板                 |
| `/theme dark` / `/theme light` | 切换显示主题                                              |
| `/lang zh` / `/lang en`        | 切换中英文界面                                            |
| `/model <model-id>`            | 切换模型并创建新 session                                  |
| `/resume`                      | 打开当前工作区的 session 选择器并回放选中会话             |
| `/skills`                      | 浏览当前工作区中可由用户调用的技能                        |
| `/use byok` / `/use cocode`    | 在自己的 Key 和 Cocode 之间切换；切换即新会话             |
| `/login` / `/logout`           | 登录或退出 Cocode Cloud；退出时若还有 Key 则留在对话里    |
| `/exit`                        | 关闭 TUI 并恢复终端                                       |

`/resume` 会读取本地 session header，支持关键词过滤和 `↑` `↓` 选择，以流式方式将选中 JSONL 的事件回放到临时投影，并要求 runtime 重新打开同一个持久化 session 后再替换当前 TUI。后续输入会继续写入选中的 session id。TUI 不负责跨进程写入锁；如果其它客户端正在写同一 session，请不要同时恢复。

`/compact` 会向当前 session 发送字面量 `/compact` prompt。只有 host 的 compaction 插件识别该 prompt 时才会执行压缩；TUI 不会在缺少对应事件时宣称压缩成功。

## 错误

失败时状态栏显示 `CODE · 解释`。语言由 `COCODE_LANG` 决定，未设置时跟随 `LANG` / `LC_MESSAGES`。完整目录见 [错误码](./errors.md)。

## 多个终端

可以同时开多个 TUI，共用同一份家目录和同一套通道。每个窗口是独立进程、独立 `sessionId`，互不影响正在进行的对话。

若还有其它 TUI 窗口开着，`/use`、`/login`、`/logout` 会拒绝执行，避免改掉全机默认通道或拆掉 Cloud 槽。先关掉其它窗口，再在留下的那个窗口里切换或退出。多个窗口各用不同 provider 不是当前产品能力。

## Runtime capability 边界

只有 harness 的 `skills/list` 返回真实目录后，TUI 才会启用 `/skills`。如果 composition 没有挂载 `@deepseek-ai/dsh-skill` 及其 provider（例如 `@deepseek-ai/dsh-skill-filesystem`），命令会保持隐藏；探测失败或目录为空不会被展示成可用能力。

交互式问卷要求 harness composition 挂载 user-questions service 和对应的 ask-user consumer。SDK server 会把 `question/ask` 转发给 TUI，并等待完整答案批次；未挂载该 service 时不会把终端注册为问卷 provider。
