# TUI 错误码

[中文](./errors.md) · [English](../en/errors.md)

TUI 自己产生的失败会显示为 `CODE · 解释`。语言由 `COCODE_LANG` 决定，未设置时再看 `LANG` / `LC_MESSAGES`；`zh*` 为中文，其余为英文。

这里只收录 **TUI 客户端** 的错误。Harness / 工具卡上的 `error.code` 仍原样显示，不进本目录。

密钥不会出现在解释里。

## AUTH

登录、设备授权、凭证与 Agency 地址。

| Code                          | 何时出现                            | 解释                                                         |
| ----------------------------- | ----------------------------------- | ------------------------------------------------------------ |
| `AUTH_NOT_READY`              | 授权尚未完成就读取已解析配置        | 授权尚未就绪。                                               |
| `AUTH_BYOK_EMPTY`             | 粘贴的 API Key 为空                 | 请粘贴 API Key。                                             |
| `AUTH_HOME_BUSY`              | 同一产品家目录已有其它 TUI 在跑     | 其它 Cocode TUI 还在运行。先关掉它们，再切换通道或退出账号。 |
| `AUTH_LOGIN_FAILED`           | 登录失败且没有更具体的 code         | 登录失败。                                                   |
| `AUTH_LOGIN_CANCELLED`        | 用户取消 device flow                | 已取消登录。                                                 |
| `AUTH_BROWSER_OPEN_FAILED`    | 无法打开设备确认页面                | 无法打开验证页面，请手动打开上方的 URL。                     |
| `AUTH_DEVICE_START_FAILED`    | 无法开始设备登录                    | 无法开始设备登录。                                           |
| `AUTH_DEVICE_INVALID`         | Agency 返回的设备授权不完整         | 服务返回了无效的设备授权。                                   |
| `AUTH_DEVICE_EXPIRED`         | 设备授权超时                        | 设备登录已过期。                                             |
| `AUTH_DEVICE_DENIED`          | 浏览器里未批准登录                  | 设备登录未获批准。                                           |
| `AUTH_SESSION_EXPIRED`        | 身份会话过期                        | 登录会话已过期。                                             |
| `AUTH_ACCOUNT_LOAD_FAILED`    | 无法读取账号资料                    | 无法加载账号信息。                                           |
| `AUTH_ACCOUNT_INVALID`        | 账号资料格式无效                    | 服务返回了无效的账号信息。                                   |
| `AUTH_KEY_CREATE_FAILED`      | 无法 mint 个人 Key                  | 无法创建 API Key。                                           |
| `AUTH_MODELS_LIST_FAILED`     | 无法列出托管模型                    | 无法获取托管模型列表。                                       |
| `AUTH_MODELS_INVALID`         | 模型目录格式无效                    | 服务返回了无效的模型目录。                                   |
| `AUTH_NO_HOSTED_MODELS`       | 账号没有可用托管模型                | 这个账号还没有可用的托管模型。                               |
| `AUTH_ORIGIN_INVALID`         | `COCODE_AGENCY_ORIGIN` 不是 URL     | Agency 地址不是合法 URL。                                    |
| `AUTH_ORIGIN_CREDENTIALS`     | origin 带了账号或查询串             | Agency 地址不能包含账号信息或查询参数。                      |
| `AUTH_ORIGIN_PATH`            | origin 带了路径                     | Agency 地址不能包含路径。                                    |
| `AUTH_ORIGIN_HTTPS`           | origin 不是 https（本机 http 除外） | Agency 地址必须使用 https。                                  |
| `AUTH_VERIFY_URL_INVALID`     | 设备确认地址不是 URL                | {field} 不是合法 URL。                                       |
| `AUTH_VERIFY_URL_CREDENTIALS` | 设备确认地址带账号信息              | {field} 不能包含账号信息。                                   |
| `AUTH_VERIFY_URL_HTTPS`       | 设备确认地址不是 https              | {field} 必须使用 https。                                     |
| `AUTH_CREDENTIAL_REF`         | 凭证键名不合法                      | 非法的凭证引用：{ref}。                                      |
| `AUTH_CREDENTIAL_EMPTY`       | 凭证值为空                          | 凭证值为空。                                                 |
| `AUTH_CREDENTIALS_PARSE`      | `.credentials.yaml` 不是合法映射    | 无法解析凭证文件。                                           |
| `AUTH_SETTINGS_PARSE`         | `settings.yaml` 无法解析            | 无法解析 settings.yaml。                                     |

## RUNTIME

共享 Host JSON-RPC 的启动、停止和未分类失败。

| Code                  | 何时出现                     | 解释                                                                                        |
| --------------------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| `RUNTIME_INIT_FAILED` | `initialize` 失败            | 初始化失败。请检查共享 DSH Host 与 Supervisor，然后 /exit。{detail}                 |
| `RUNTIME_STOPPED`     | Host 连接或传输断开          | 运行时已停止：{detail}                                                              |
| `RUNTIME_UNKNOWN`     | 非 `TuiError` 的失败落到界面 | 未预期的错误：{detail}。                                                                    |

## COMMAND

本地 slash 解析。

| Code              | 何时出现                  | 解释               |
| ----------------- | ------------------------- | ------------------ |
| `COMMAND_INVALID` | 输入以 `/` 开头但不是命令 | 不是有效命令。     |
| `COMMAND_UNKNOWN` | 未知 slash 命令           | 未知命令 /{name}。 |

## SESSION

本地会话目录与导出。

| Code                       | 何时出现                   | 解释                     |
| -------------------------- | -------------------------- | ------------------------ |
| `SESSION_ROOT_UNAVAILABLE` | `/resume` 时没有会话根目录 | 会话目录不可用。         |
| `SESSION_EXPORT_FAILED`    | `/export` 无法分配文件名   | 无法分配会话导出文件名。 |

## CONFIG

启动配置。

TUI 不需要运行时命令或 sibling checkout。它通过 `DSH_HOME`、`DSH_PROFILE`
以及可选的 Host fingerprint 环境变量发现共享 Supervisor 与 DSH Host。

| Code                  | 何时出现                              | 解释                              |
| --------------------- | ------------------------------------- | --------------------------------- |
| `CONFIG_PROVIDER_REF` | 提供方 `apiKeyEnv` 不是合法环境变量名 | 提供方 {provider} 的凭证引用无效。 |

## IO

产品家目录里的文件读写。

| Code          | 何时出现                | 解释                      |
| ------------- | ----------------------- | ------------------------- |
| `IO_SYMLINK`  | 拒绝读写符号链接        | 拒绝使用符号链接 {path}。 |
| `IO_NOT_FILE` | 路径存在但不是文件      | {path} 不是文件。         |
| `IO_NOT_DIR`  | 路径存在但不是目录      | {path} 不是目录。         |
| `IO_MODE`     | 秘密文件权限不是 `0600` | {path} 权限必须为 0600。  |
| `IO_PARSE`    | YAML 无法解析           | 无法解析 {path}。         |
