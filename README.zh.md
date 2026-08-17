# Cocode

**开箱即用的 DeepSeek Harness 发行版。**

[English](README.md) · [简体中文](README.zh.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **项目状态：** 开发者预览版。仓库支持在 macOS、Windows 和 Linux 上进行源码构建；
> 当前发布脚本面向 macOS 和 Windows 安装包。Cocode 是独立发行版，本仓库不包含托管
> 后端，也不包含 Harness 的 vendored 副本。

DeepSeek Harness 是一个可组合的 Agent 运行时——一切都是插件，靠配置拼装。Cocode
则是已经拼装好的发行版：模型、工具、技能、会话和权限边界都已配置完毕，打开就能
从任务开始，而不是从插件树开始。

Cocode 把编码目标交给一个可恢复、可验证、可控的工作台。它会持续推进任务，在写文件、
执行命令、访问网络，在执行危险动作之前停下来等你确认，最后把改动、跑过的测试和结论一起带回来——
全部落在同一条可审计的任务时间线上。

> Cocode 基于 DeepSeek Harness 开发者预览版构建，不是 DeepSeek 官方产品；上游仍可能
> 出现兼容性变化。

---

## 两个入口，同一个会话

| | |
| --- | --- |
| **Cocode GUI** | 基于 Electron 的桌面工作台。会话、文件、终端和运行时状态在同一个界面里，代码 diff 与附件在预览面板中打开，确认之前就能看清改了什么。 |
| **Cocode TUI** | 面向键盘流和远程场景的终端客户端。SSH 上去就能继续推进任务，不需要图形环境。 |

两者通过 `@cocode/host-supervisor` 接到同一个 Host；只有使用相同的 `DSH_HOME`、profile
和 Host 配置作用域时，才会共享会话与任务状态。在同一作用域内从桌面端切换到终端，
不会让工作重来一遍。

## 仓库结构

这个仓库不是单一 workspace。三个组件各自是独立的 pnpm workspace，有各自的 lockfile
和工具链，由根目录的 `Makefile` 串起来。

```text
cocode/
├── cocode-gui/               # Electron 桌面 / Web GUI  (@cocode/gui-root)
├── cocode-tui/               # 终端客户端                (@cocode/tui)
├── cocode-host-supervisor/   # 共享 DSH Host 生命周期     (@cocode/host-supervisor)
├── Makefile                  # 根级开发快捷命令
└── AGENTS.md                 # 面向贡献者与 agent 的工程约定
```

运行时本身不在这里。`@cocode/host-supervisor` 从 npm 固定依赖 `@deepseek-ai/dsh`，
并负责 Supervisor 服务、本地 IPC 与 lease 协议、运行时槽位物化，以及 Cocode 的
JSON-RPC Host 插件。GUI 和 TUI 自己不启动 Harness 进程——它们为一个规范化的
`DSH_HOME + profile + Host 配置` 作用域申请 lease，然后连到 Host 广播出来的端点。

```text
Cocode GUI ─┐
            ├─→ @cocode/host-supervisor ─→ @deepseek-ai/dsh (npm) ─→ 模型 · 工具 · 会话
Cocode TUI ─┘
```

如果你要改 Harness 运行时本身，请用同级 clone `../cocode-harness`。仓库内的嵌套副本
是有意被 gitignore 掉的，不属于公开源码树。

## 环境要求

三个组件的工具链基线并不统一，按你要构建的那个来：

| 组件 | Node.js | pnpm |
| --- | --- | --- |
| `cocode-gui` | `>=22.12.0`（见 `.nvmrc`） | 精确 `10.34.5` |
| `cocode-tui` | `^22.19` 或 `>=24` | 任意较新版本 |
| `cocode-host-supervisor` | `>=22.12.0` | 任意较新版本 |

GUI 还需要 Python 3 用于构建原生模块，源码构建支持 macOS 12+、Windows 10+ 或 64 位
Linux，架构为 `x64` 和 `arm64`。当前发布脚本面向 macOS 和 Windows；Linux 用户应使用
源码构建，除非对应 Release 明确提供 Linux 安装包。

用 Corepack 拿到 GUI 固定的 pnpm 版本：

```sh
corepack pnpm@10.34.5 --version
```

## 快速开始

下面的目标都在仓库根目录执行。

```sh
# 桌面工作台：Electron 客户端 + Vite，端口 5273
make install-gui
make dev gui

# 终端客户端（需要 TTY；preflight 会装依赖并在必要时刷新 Host 运行时）
make install-tui
make dev tui

# 纯浏览器 GUI，适合调设计系统
make dev gui-web

# 单独跑 Host，用于调试 wire 协议
make install-dsh
make dev dsh
```

直接执行 `make` 会列出所有目标。

GUI 会复用系统缓存目录里已暂存的运行时。缓存过期时有两个逃生口：

```sh
DSH_FORCE_RESTAGE=1 make dev gui          # 刷新缓存
DSH_DISABLE_RUNTIME_CACHE=1 make dev gui  # 隔离运行时，不走缓存
```

### 提 PR 之前的检查

```sh
cd cocode-gui  && corepack pnpm@10.34.5 typecheck && corepack pnpm@10.34.5 lint && corepack pnpm@10.34.5 test
cd cocode-tui  && pnpm typecheck && pnpm lint && pnpm test
cd cocode-host-supervisor && pnpm typecheck && pnpm test
```

### 构建安装包

```sh
make gui-build      # 当前平台的 Electron Forge 安装包
```

分平台的发布构建在 `cocode-gui` 里，脚本为 `release:mac:x64`、`release:mac:arm64`、
`release:win:x64`、`release:win:arm64`。

GUI 是私有的 Electron workspace，而不是 npm 应用包。TUI 和 Host Supervisor 已配置公开
发布流程，但从 registry 安装前，应只使用同一个 GitHub Release 和 npm 发布中的匹配版本。

## 模型与凭据

Cocode 不内置模型，也不包含托管后端，你有两种方式提供访问能力：

- **自带 Key。** 首次启动时粘贴 DeepSeek API key，存在 `$DSH_HOME` 下的 DSH 凭据
  文件里，不会进入会话日志。
- **可用时使用 Cocode 托管账号。** 托管服务的可用性、模型、价格和账号要求由独立服务
  决定，不属于本仓库。身份令牌存在 `~/.cocode` 下的 `account.yaml`。详见
  [托管服务文档](https://cocode.agency/nut)。

相关环境变量：`DSH_HOME` 和 `DSH_PROFILE` 决定共享 Host 的作用域，
`COCODE_HOST_CONFIG_FINGERPRINT` 用于固定自定义 Host 组合，`COCODE_HOME` 隔离
Cocode 凭据，`DSH_SESSION_ROOT` 用于迁移会话文件位置。

## 文档

| | |
| --- | --- |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | 贡献流程、检查项和改动边界 |
| [`SECURITY.md`](SECURITY.md) | 漏洞报告流程 |
| [`cocode-tui/docs/`](cocode-tui/docs/) | TUI 用户指南，含中英文 |
| [`cocode-host-supervisor/README.md`](cocode-host-supervisor/README.md) | Supervisor lease 协议与客户端 API |
| [`cocode-gui/README.md`](cocode-gui/README.md) | GUI 开发、打包和更新行为 |
| [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) | 第三方来源与许可证说明 |

产品文档见 [doc.cocode.agency](https://doc.cocode.agency)。

## 参与贡献

先读 [CONTRIBUTING.md](CONTRIBUTING.md)——里面说明了提交信息规范、哪些检查是必须的，
以及改动如何在三个组件之间划分范围。请将改动限制在对应组件内，不要提交本地运行时、
缓存、凭据或生成产物。

报告安全漏洞请走 [SECURITY.md](SECURITY.md) 的流程，不要开公开 issue。

## 许可证

[MIT](LICENSE) © 2026 Cocode Agency。

第三方组件（包括 DeepSeek Harness 和以源码形式内置的 Cordis 框架）各自保留其许可证，
详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

---

[cocode.agency](https://cocode.agency) · [文档](https://doc.cocode.agency) · [下载](https://cocode.agency/download)
