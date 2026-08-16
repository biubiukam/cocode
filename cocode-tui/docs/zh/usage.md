# Cocode TUI 使用指南

[中文](./usage.md) · [English](../en/usage.md)

## 发布版安装

要求 Node.js 22.19.x 或 24 及以上版本。

发布包通过 `@cocode/host-supervisor` 直接获得版本化的
`@deepseek-ai/dsh` runtime。Supervisor 会按 profile 启动或发现共享 Host：

```sh
cd /path/to/cocode-tui
pnpm run build
npm pack
npm install --global ./cocode-tui-0.1.0.tgz
```

正式发布后可直接执行 `npm install --global @cocode/tui`。

检查 Supervisor、Host descriptor、JSON-RPC 服务和 lease 生命周期：

```sh
cocode --doctor
cocode
```

CLI 会把当前目录作为 Agent 工作区。需要隔离凭据时设置 `COCODE_HOME`，需要
选择共享 Host 范围时设置 `DSH_HOME`/`DSH_PROFILE`，需要修改会话目录时设置
`DSH_SESSION_ROOT`。

首次启动会进入登录引导，可选择粘贴 DeepSeek API Key 或登录 Cocode 账号。
后续启动会复用本机配置。`cocode --help`、`--version` 和 `--doctor` 不要求
TTY，可以用于安装脚本和故障排查。

## 启动前

不需要安装 Desktop，也不需要额外的 runtime checkout。第一个 TUI 或 Desktop
客户端会为当前 scope 启动 Supervisor 与 DSH Host，后续客户端只获取新的 lease
并连接同一个 Host。只有在需要自定义 Host 组合时才设置 `DSH_HOME`、`DSH_PROFILE`
或 `COCODE_HOST_CONFIG_FINGERPRINT`。

当前已验证的是 macOS 上的本地 Supervisor 与 DSH Host 流程。Windows、Linux 和真实终端组合键仍需按 [平台说明](./platforms.md) 单独验收；自动化测试不会替代真实 TTY 验收。

密钥可以通过首屏登录配置，也可以临时设置 `DEEPSEEK_API_KEY`。开发环境可用 `COCODE_HOME` 和 `DSH_HOME` 指向彼此隔离的目录。DSH 配置和凭据遵循官方 `$DSH_HOME` 目录规范。会话目录默认使用 `$DSH_HOME/sessions`；未设置 `DSH_HOME` 时使用 `~/.dsh/sessions`，也可以用 `DSH_SESSION_ROOT` 覆盖。

同一份程序支持 Windows、macOS 和 Linux。Windows 未配置 `$VISUAL` 或 `$EDITOR` 时使用 `notepad.exe`；WSL 使用 Linux 进程语义，并可回退到 `clip.exe` 和 `explorer.exe`。使用 VS Code 等图形编辑器时，请配置带等待参数的命令。

## 界面分区

终端呈现方式由 `COCODE_TUI_SCREEN` 控制：`inline`（默认）保留主屏和滚动历史，`alternate` 使用全屏备用缓冲区，退出时恢复原终端。Windows 旧版控制台不支持备用缓冲区时会自动回退到 `inline`。

在 `tmux` 或 `screen` 中，TUI 会自动使用 inline 呈现并关闭终端通知，因为嵌套备用屏幕和 OSC 控制序列在这些环境下不稳定。

- 顶部显示工作区、git 分支、session、provider、model 和实时 Agent 状态。
- 中间是会话投影：`you`、`cocode`、思考内容和工具结果按节点分组显示。
- 底部状态栏显示运行状态、notice 以及已有的输入/输出 token 用量。
- 输入区使用带边框的 `prompt` 面板，并显示当前 `Build` / `Plan` 模式；runtime 不可用时会显示 `locked`，不会继续伪装成可编辑状态。
- `/` 命令菜单、选择器和确认面板使用居中浮窗显示；消息区会先缩小，浮窗高度也会受剩余空间限制。
- 多行草稿最多显示光标附近 6 行，完整草稿不会被删除；终端高度连固定区域都无法容纳时，会显示调整尺寸提示并暂停普通输入。

## 对话编辑

- `Enter` 发送；`Shift+Enter` 换行。
- `←` `→` 移动光标，`Backspace` 删除光标前的字符。
- `↑` `↓` 查看本地输入历史。
- `Ctrl+R` 打开历史搜索；输入文字过滤最近消息，使用 `↑` `↓` 选择，回车回填到输入区，`Esc` 关闭。
- `Ctrl+G` 使用 `$VISUAL` 或 `$EDITOR` 打开临时 Markdown 草稿；退出编辑器后内容回填到输入区。编辑器退出码非 0、草稿不是 UTF-8 或超过 256 KiB 时会显示错误。
- `Ctrl+V` 从系统剪贴板读取 PNG、JPEG、WebP 或 GIF 图片，也可以执行 `/paste-image`。图片先保留在本地草稿中，发送时才写入 Host attachment store；删除输入区中的 `[Image: ...]` 标记会移除对应草稿图片。单张图片上限为 5 MiB，一条输入最多 20 张。部分终端会占用 `Ctrl+V`，此时使用 `/paste-image`。
- `Shift+↑` 进入消息选择模式；使用 `↑` `↓` 移动，回车展开或收起当前消息，`Esc` 退出。
- 窄屏布局不开启鼠标追踪。终端宽度达到 120 列时，Inspector 会启用鼠标以支持调整宽度和面板交互，部分终端的原生拖动选择可能受影响。模型、命令、问题和消息操作仍可使用键盘；命令菜单使用 `Ctrl+P` 打开，消息操作可通过 `Shift+↑` 进入消息选择模式后按 `m` 打开。
- 在消息选择模式按 `c` 可复制当前消息；也可以使用 `/copy` 复制最近一条 assistant 回复。复制依次尝试 macOS `pbcopy`、Windows `clip.exe`，以及 Linux 的 `wl-copy`、`xclip`、`xsel`；命令不可用时只显示提示，不影响会话。
- `/focus` 切换本地「最近一轮」视图。开启后，对话区只显示最近一条用户消息及其后续节点，状态栏显示「聚焦：最近一轮」。它只改变界面投影，不修改 `/clear`、`/resume`、`/rewind`、导出或持久化 session log 的语义；再次执行可恢复完整会话视图。
- `/lang zh` 或 `/lang en` 立即切换界面语言；未指定时启动语言由 `COCODE_LANG`、`LANG` 等环境变量决定。
- `/model` 和 `/models` 无参数时打开模型选择器；`/model <model-id>` 直接切换当前 provider 下的模型。选择器可以同时切换 provider 和 model；如果重启后的 runtime 支持持久会话重新打开，TUI 会恢复当前 session 上下文，否则才创建新 session。失败会尝试恢复原 provider/model。旧 runtime 没有模型目录时仍可手动输入 model id。
- 思考内容在流式生成期间默认展开，回复完成后自动收起为摘要；`Ctrl+O` 可保持完整思考内容和工具输入输出展开。
- 对话运行中，状态栏会显示「思考中…」。即使下一段流式输出暂时没有到达，也能和空闲状态区分开。状态栏还会显示最近一次 assistant 的输入/输出 token，以及 wire 已报告的当前子代理活动。收到可选事件后，还会显示解码 TPS、缓存命中率、上下文窗口占用比例、推理等级、当前工作状态、紧凑的上下文分段（`S/P/A/T/X` 分别表示系统、输入、回复、思考和工具）、待办进度、目标阶段和当前 agent preset。分段数值按文本长度估算，不代表 provider 的计费数据。
- runtime 支持计划模式时，输入区空闲状态按 `Tab` 可在 `Build` 与 `Plan` 之间切换；Slash 命令和 `@` 文件选择器打开时，`Tab` 仍用于移动选项。
- `/permissions` 在 `read-only`、`workspace-write` 和 `danger-full-access` 之间切换当前会话的权限。默认值为 `workspace-write`，可通过 `DSH_PERMISSION_MODE` 修改；Shell 与文件写入使用同一份会话权限。`workspace-write` 下的单次越界升级需要审批，`danger-full-access` 不再询问。
- 当前任务运行时，底部提示改为「按 Esc 终止」；此时输入草稿并按 `Tab` 可加入队列，最多 8 条。收到 `session.status=idle` 后按顺序自动发送。这是本地排队，不会打断当前任务，也不是 steer。
- 队列中有输入时使用 `/queue` 管理。输入文字可过滤，使用 `↑`/`↓` 选择，按 `Enter` 将选中项恢复到队首，按 `Ctrl+D` 删除，按 `Esc` 关闭。发送失败且 runtime 已空闲时，按 `Enter` 会立即重试选中项。队列为空时只显示提示，不打开空弹层。输入实际发送前不会写入 session log；发送失败会自动恢复到队首。runtime 重启或切换 session 时，本地队列会清空。
- 主区域会在对话内容下方持续显示当前回合的 Checklist 摘要；`/todos` 可打开完整清单面板。面板显示每项任务的完成、进行中或待处理状态，使用 `↑`/`↓` 选择，按 `Esc` 关闭。任务清单由 Host 的 `todo/write` 事件驱动，TUI 不直接修改任务；下一回合开始时清空上一回合的清单。
- `/review` 打开只读 Git Review。选择 `working-tree`、`staged`、`last-commit` 或 `branch`，查看受限的文件与 Diff 摘要后按回车，将结构化 Review 上下文发送到当前会话。
- `Esc` 在帮助、命令菜单等弹层中先关闭弹层；任务运行时第一次请求取消，第二次退出；空闲时连续按两次退出 TUI。
- `Ctrl+L` 打开模型切换面板，对齐 Crush 的模型切换流程；使用 `/redraw` 可以在不清除会话内容的情况下重绘界面。
- 可用 `COCODE_TUI_KEYMAP` 以 JSON 对象覆盖快捷键，例如
  `COCODE_TUI_KEYMAP='{"historySearch":"ctrl+f","editorOpen":"alt+e"}'`。键名支持帮助中的 command id（如
  `history.search`）和对应的驼峰别名。只有已存在的 command id 会生效；JSON、键名或按键格式非法时保留默认键位，并向 stderr 输出诊断。配置使用 `ctrl`、`alt`、`shift` 与 `enter`、`escape`、`up`、`down` 等跨平台写法，Windows、macOS、Linux 均按同一规则解析。
- 在消息任意位置输入 `@` 可搜索工作区文件和目录；使用 `Tab`、`↑`、`↓` 选择，回车插入引用。
- 发送时会在消息末尾附加选中文件内容，目录则附加受限的目录列表；文件必须位于当前工作区内。
- Host 提供可由用户调用的 Skill 时，`/skills` 会打开可搜索的工作区技能目录；选择后向输入区插入 `/技能名 `，可以继续编辑 prompt 再发送。可由用户调用的 Skill 也会出现在 `/` 命令菜单中，执行时通过 `session.prompt` 文本路径发送。目录为空时不会显示该命令。
- Agent 调用 `ask_user_question` 时，会先在消息区流式显示正在生成的问题；完整请求到达后，输入区切换为问卷面板。使用 `↑` `↓` 移动，空格勾选多个选项，`Tab` 切换到自定义答案，回车回答，`Backspace` 或 `Delete` 删除自定义输入，`Esc` 取消。批量问题和并发请求按 FIFO 顺序显示。

工具输出会按显示模式截断；未被投影缓存淘汰时，原始内容仍保留在节点状态，完整事件始终保存在 session log 中。对话区空间不足时，输入区保持可见。

长会话使用有界投影缓存：默认最多保留 2048 个已完成节点和约 8 MiB 的节点状态。正在流式输出的 assistant 或尚未返回结果的工具不会被淘汰；超过预算后会优先移除最早的已完成节点，状态栏会显示隐藏数量。持久化 JSONL 仍是完整真源，`/resume` 会重新回放被隐藏的历史。

助手消息支持标题、列表、引用、行内代码、代码块、表格和链接等常用 Markdown。流式输出时，已经结束的 Markdown 块会保持稳定，只有最后一个正在增长的块重新解析，避免长回复每个 token 都重算全文。

助手消息支持标题、列表、引用、行内代码、代码块、表格和链接等常用 Markdown。流式输出时，已经结束的 Markdown 块会保持稳定，只有最后一个正在增长的块重新解析，避免长回复每个 token 都重算全文。

## Slash 命令

输入 `/` 会打开命令菜单。继续输入可按前缀过滤，使用 `Tab` 或方向键选择，回车执行；输入空格后回到普通文本编辑。

| 命令                           | 作用                                                                 |
| ------------------------------ | -------------------------------------------------------------------- |
| `/help`                        | 查看快捷键和当前可用命令                                             |
| `/status`                      | 查看会话、模型、运行时和授权模式                                     |
| `/doctor`                      | 查看 TTY、启动参数、初始化结果、会话根，以及配置能力与运行时能力差异 |
| `/clear`                       | 清除当前屏幕投影，不删除 session log                                 |
| `/new`                         | 创建新的 session id，不复制旧会话                                    |
| `/compact`                     | 通过 prompt 路径请求 host 压缩当前会话                               |
| `/rewind`                      | 打开会话回滚选择器                                                     |
| `/export`                      | 将当前投影导出为 Markdown 文件                                       |
| `/copy`                        | 复制最近一条 assistant 回复到系统剪贴板                              |
| `/focus`                       | 显示或隐藏最近一轮用户消息及其后续节点                               |
| `/review`                      | 使用受限的只读 Diff 预览检查当前 Git 改动                            |
| `/queue`                       | 查看、调整顺序或删除本地待发送输入                                   |
| `/todos`                       | 查看当前回合的 Checklist 任务清单                                    |
| `/permissions` / `/plan`       | 在运行时支持时切换权限模式或计划模式                                 |
| `/fork`                        | 选择一条用户消息，再从该位置创建子会话                               |
| `/clone`                       | 从当前对话末尾创建子会话                                             |
| `/tree`                        | 显示会话树；优先使用 RPC 元数据，不可用时回退到 JSONL                |
| `/sessions`                    | 显示运行时会话列表；只有 runtime 广告 RPC 会话列表时可用             |
| `/init`                        | 仅在缺少 `AGENTS.md` 时创建最小工作区模板                            |
| `/theme dark` / `/theme light` | 切换显示主题                                                         |
| `/lang zh` / `/lang en`        | 切换中英文界面                                                       |
| `/model`                      | 打开模型选择器                                                         |
| `/models`                     | 打开模型选择器                                                         |
| `/redraw`                     | 在不清除会话内容的情况下重绘界面                                     |
| `/model <model-id>`            | 直接切换当前 provider 下的模型；支持持久会话时保留当前 session        |
| `/thinking`                    | 切换 thinking 和完整工具详情显示                                     |
| `/tokens` / `/cost`            | 查看最近一次 token、缓存和 context 用量                              |
| `/resume`                      | 打开当前工作区的 session 选择器并回放选中会话                        |
| `/skills`                      | 浏览当前工作区中可由用户调用的技能                                   |
| `/use byok` / `/use cocode`    | 在自己的 Key 和 Cocode 之间切换；切换即新会话                        |
| `/login` / `/logout`           | 登录或退出 Cocode Cloud；退出时若还有 Key 则留在对话里               |
| `/exit` / `/quit` / `/q`       | 关闭 TUI 并恢复终端                                                  |

`/resume` 会读取本地 session header，支持关键词过滤和 `↑` `↓` 选择，以流式方式将选中 JSONL 的事件回放到临时投影，并要求 runtime 重新打开同一个持久化 session 后再替换当前 TUI。后续输入会继续写入选中的 session id。TUI 不负责跨进程写入锁；如果其它客户端正在写同一 session，请不要同时恢复。

运行时会话树会用 `✓` 标记当前附加的 session，用 `◉` 标记当前 runtime 报告为运行中的 session，用 `·` 标记已知空闲的 session。这些 activity 标记来自当前 runtime 的实时通知，不表示跨进程写入锁。

`/fork` 会打开用户消息选择器，按最新消息在前排列。使用 `↑`/`↓` 选择分支边界，再连续按两次回车确认。runtime 会通过 fork wire 创建子会话并替换当前活动 session。如果需要复制完整当前对话而不选择边界，使用 `/clone`。

选择器每一行会显示该会话首条用户消息的短摘要。系统会移除控制字符和终端转义序列、合并空白，并限制为最多 72 个可见字符，避免长 prompt 撑开选择器。如果事件读取失败，会回退显示会话工作目录；两者都没有时显示「无摘要」。摘要只用于界面展示，不会修改持久化 JSONL。

`/compact` 会向当前 session 发送字面量 `/compact` prompt。只有 host 的 compaction 插件识别该 prompt 时才会执行压缩；TUI 不会在缺少对应事件时宣称压缩成功。

回合从运行变为空闲时，TUI 默认发送 OSC 9 终端通知。设置 `COCODE_TUI_NOTIFY=off` 可关闭；需要 OSC 777 的终端可以设置为 `osc777`。通知是尽力而为的终端控制序列，写入失败不会影响会话。

## 错误

失败时状态栏显示 `CODE · 解释`。语言由 `COCODE_LANG` 决定，未设置时跟随 `LANG` / `LC_MESSAGES`。完整目录见 [错误码](./errors.md)。

## 多个终端

可以同时开多个 TUI，共用同一份家目录和同一套通道。每个窗口是独立进程、独立 `sessionId`，互不影响正在进行的对话。

若还有其它 TUI 窗口开着，`/use`、`/login`、`/logout` 会拒绝执行，避免改掉全机默认通道或拆掉 Cloud 槽。先关掉其它窗口，再在留下的那个窗口里切换或退出。多个窗口各用不同 provider 不是当前产品能力。

## Runtime capability 边界

只有 Host 的 `skills/list` 返回真实目录后，TUI 才会启用 `/skills`。如果 Host composition 没有挂载技能 provider，命令会保持隐藏；探测失败或目录为空不会被展示成可用能力。

Host 默认挂载 Cocode 自己的 `cocode-vision` 插件，并启用 `autoRead`。发送的 `image` block 会先转换为视觉证据，再交给当前文本模型；同时保留原始附件引用，支持原生视觉模型继续读取。视觉 provider 有两种：`cocode` 使用 Cocode 服务，默认视觉模型为 `gpt-luna`；`user` 使用用户配置的 OpenAI-compatible endpoint。用户配置可以写入 `$COCODE_HOME/vision.yaml`（默认 `~/.cocode/vision.yaml`），可参考 [vision.yaml.example](./vision.yaml.example)。`COCODE_VISION_PROVIDER`、`COCODE_VISION_USER_MODEL` 等环境变量优先级更高。账号切换到 Cocode 后，插件会自动复用账号生成的 `COCODE_LLM_PROVIDERS.cocode-cloud` endpoint 和 credential reference，不使用 cloud model 列表的首项。凭证只填写引用名，实际值由 Host credentials service 管理，不进入 session log 或 TUI 设置。

`/doctor` 中的 `caps-configured` 表示 TUI 根据配置和本地实现预期的能力，`caps-runtime` 表示初始化后对真实 JSON-RPC runtime 的探测结果。两者不一致时，以运行时结果为准；`caps-errors` 会列出被禁用能力的原因。探测使用随机、不存在的 session id，不会创建或修改用户会话。

交互式问卷要求 Host composition 挂载 user-questions service 和对应的 ask-user consumer。JSON-RPC service 会把 `question/ask` 转发给 TUI，并等待完整答案批次；未挂载该 service 时不会把终端注册为问卷 provider。
