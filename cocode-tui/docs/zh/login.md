# 在终端里开始用 Cocode

[中文](./login.md) · [English](../en/login.md)

打开 TUI 之后，如果这台电脑还不能调用模型，屏幕上会先停一停，只问你一件事：

**这次用自己的 Key，还是用 Cocode 账号？**

选好了才会进入对话。两套可以同时留在这台电脑上，对话里用 `/use` 切换。密钥不会写进聊天记录，界面也不会把完整 Key 再显示出来。

## 用自己的 Key

按 `↑` `↓` 选到「粘贴 API Key」，回车。也可以直接按 `1`。把 DeepSeek 的 API Key 粘进去，再回车。

以后再打开，这一步会自动跳过。如果你已经在桌面版 GUI 里保存过同一把 Key，终端这边通常也不用再贴一遍——两边认的是同一份本机配置。

已经在对话里、还没贴过 Key 时，输入 `/use byok`，按提示粘贴即可。

## 用 Cocode 账号

按 `↑` `↓` 选到「登录 Cocode」，回车。也可以直接按 `2`。终端会给出一串短码，浏览器一般会自己打开确认页。在网页里登录（邮箱、Google 或 GitHub 都可以，有二次验证也在网页里完成），点允许后回到终端即可。

已经在对话里时，输入 `/login` 即可补上账号，不必先退出。

登录之后，对话走 Cocode 提供的模型。你自己贴过的 Key 还在，不会被换成账号里的那把。

额度用完了只是暂时跑不了模型，并不等于退出登录，也不会自动改用你的 Key。

## 两套都在时，怎么切换

在对话里输入：

- `/use byok` — 改用自己的 Key（新会话，屏幕上的上一轮对话会清掉）
- `/use cocode` — 改用 Cocode 账号（同样是新会话）
- `/status` — 看看现在走哪一套，另一套有没有配好（不会打印密钥）
- `/logout` — 退出 Cocode 账号。你自己的 Key 还留着；有 Key 就会切过去，TUI 不关
- `/login` — 登录或刷新 Cocode 账号，不删你的 Key

`COCODE_PROVIDER` 设在环境里时，`/use` 不会改文件里的默认通道。开着多个 TUI 窗口时，这几条命令也会拒绝，避免改到其它窗口还在用的配置。

## 和桌面版的关系

图形界面和终端共用 DSH 的 settings、credentials、会话和 Workspace 等业务
数据（默认在 `~/.dsh`）。Cocode 账号 token 保存在
`~/.cocode/account.yaml`；TUI 只在当前进程中动态生成 Cocode provider。

## 配置目录

自己的 API Key 会直接写入共享 DSH 凭据文件
`~/.dsh/.credentials.yaml`。不会从旧的 `.cocode/credentials` 自动迁移，也不会
把文件中的 Key 复制到进程环境中。

需要指定账号/runtime 目录时，可以设置 `COCODE_HOME`（默认 `~/.cocode`）；需要
指定共享 DSH Home 时设置 `COCODE_DSH_HOME`（默认 `~/.dsh`）。
开发启动参数见 `.env.example`。

登录或切换失败时，状态栏显示 `CODE · 解释`。完整目录见 [错误码](./errors.md)。
