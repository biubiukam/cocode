/**
 * Stable TUI error codes, grouped by domain.
 */

export type Locale = 'en' | 'zh'

export type ErrorDomain = 'AUTH' | 'RUNTIME' | 'COMMAND' | 'SESSION' | 'CONFIG' | 'IO'

export type ErrorParams = Record<string, string | number>

export const ERROR_CATALOG = {
  AUTH_NOT_READY: {
    domain: 'AUTH',
    en: 'Auth is not ready.',
    zh: '授权尚未就绪。',
  },
  AUTH_BYOK_EMPTY: {
    domain: 'AUTH',
    en: 'Paste an API key.',
    zh: '请粘贴 API Key。',
  },
  AUTH_HOME_BUSY: {
    domain: 'AUTH',
    en: 'Another Cocode TUI is using this home. Close it before switching or signing out.',
    zh: '其它 Cocode TUI 还在运行。先关掉它们，再切换通道或退出账号。',
  },
  AUTH_LOGIN_FAILED: {
    domain: 'AUTH',
    en: 'Sign-in failed.',
    zh: '登录失败。',
  },
  AUTH_LOGIN_CANCELLED: {
    domain: 'AUTH',
    en: 'Sign-in cancelled.',
    zh: '已取消登录。',
  },
  AUTH_BROWSER_OPEN_FAILED: {
    domain: 'AUTH',
    en: 'Could not open the verification page. Open the URL shown above manually.',
    zh: '无法打开验证页面，请手动打开上方的 URL。',
  },
  AUTH_DEVICE_START_FAILED: {
    domain: 'AUTH',
    en: 'Could not start device login.',
    zh: '无法开始设备登录。',
  },
  AUTH_DEVICE_INVALID: {
    domain: 'AUTH',
    en: 'Agency returned an invalid device authorization.',
    zh: '服务返回了无效的设备授权。',
  },
  AUTH_DEVICE_EXPIRED: {
    domain: 'AUTH',
    en: 'Device authorization expired.',
    zh: '设备登录已过期。',
  },
  AUTH_DEVICE_DENIED: {
    domain: 'AUTH',
    en: 'Device login was not approved.',
    zh: '设备登录未获批准。',
  },
  AUTH_SESSION_EXPIRED: {
    domain: 'AUTH',
    en: 'Session expired.',
    zh: '登录会话已过期。',
  },
  AUTH_ACCOUNT_LOAD_FAILED: {
    domain: 'AUTH',
    en: 'Could not load account.',
    zh: '无法加载账号信息。',
  },
  AUTH_ACCOUNT_INVALID: {
    domain: 'AUTH',
    en: 'Agency returned an invalid account.',
    zh: '服务返回了无效的账号信息。',
  },
  AUTH_KEY_CREATE_FAILED: {
    domain: 'AUTH',
    en: 'Could not create an API key.',
    zh: '无法创建 API Key。',
  },
  AUTH_MODELS_LIST_FAILED: {
    domain: 'AUTH',
    en: 'Could not list hosted models.',
    zh: '无法获取托管模型列表。',
  },
  AUTH_MODELS_INVALID: {
    domain: 'AUTH',
    en: 'Agency returned an invalid model catalog.',
    zh: '服务返回了无效的模型目录。',
  },
  AUTH_NO_HOSTED_MODELS: {
    domain: 'AUTH',
    en: 'This account has no hosted models.',
    zh: '这个账号还没有可用的托管模型。',
  },
  AUTH_ORIGIN_INVALID: {
    domain: 'AUTH',
    en: 'Agency origin is not a URL.',
    zh: 'Agency 地址不是合法 URL。',
  },
  AUTH_ORIGIN_CREDENTIALS: {
    domain: 'AUTH',
    en: 'Agency origin must not contain credentials or query parameters.',
    zh: 'Agency 地址不能包含账号信息或查询参数。',
  },
  AUTH_ORIGIN_PATH: {
    domain: 'AUTH',
    en: 'Agency origin must not contain a path.',
    zh: 'Agency 地址不能包含路径。',
  },
  AUTH_ORIGIN_HTTPS: {
    domain: 'AUTH',
    en: 'Agency origin must be https.',
    zh: 'Agency 地址必须使用 https。',
  },
  AUTH_VERIFY_URL_INVALID: {
    domain: 'AUTH',
    en: '{field} is not a URL.',
    zh: '{field} 不是合法 URL。',
  },
  AUTH_VERIFY_URL_CREDENTIALS: {
    domain: 'AUTH',
    en: '{field} must not contain credentials.',
    zh: '{field} 不能包含账号信息。',
  },
  AUTH_VERIFY_URL_HTTPS: {
    domain: 'AUTH',
    en: '{field} must use https.',
    zh: '{field} 必须使用 https。',
  },
  AUTH_CREDENTIAL_REF: {
    domain: 'AUTH',
    en: 'Illegal credential ref: {ref}.',
    zh: '非法的凭证引用：{ref}。',
  },
  AUTH_CREDENTIAL_EMPTY: {
    domain: 'AUTH',
    en: 'Credential value is empty.',
    zh: '凭证值为空。',
  },
  AUTH_CREDENTIALS_PARSE: {
    domain: 'AUTH',
    en: 'Could not parse credentials.',
    zh: '无法解析凭证文件。',
  },
  AUTH_SETTINGS_PARSE: {
    domain: 'AUTH',
    en: 'Could not parse settings.yaml.',
    zh: '无法解析 settings.yaml。',
  },
  RUNTIME_INIT_FAILED: {
    domain: 'RUNTIME',
    en: 'Initialize failed. Build sibling cocode-harness, set COCODE_HARNESS_ARGS, then /exit. {detail}',
    zh: '初始化失败。请先构建 sibling cocode-harness，设置 COCODE_HARNESS_ARGS，然后 /exit。{detail}',
  },
  RUNTIME_STOPPED: {
    domain: 'RUNTIME',
    en: 'Runtime stopped: {detail}.',
    zh: '运行时已停止：{detail}。',
  },
  RUNTIME_UNKNOWN: {
    domain: 'RUNTIME',
    en: 'Unexpected error: {detail}.',
    zh: '未预期的错误：{detail}。',
  },
  COMMAND_INVALID: {
    domain: 'COMMAND',
    en: 'Not a command.',
    zh: '不是有效命令。',
  },
  COMMAND_UNKNOWN: {
    domain: 'COMMAND',
    en: 'Unknown command /{name}.',
    zh: '未知命令 /{name}。',
  },
  SESSION_ROOT_UNAVAILABLE: {
    domain: 'SESSION',
    en: 'Session root is unavailable.',
    zh: '会话目录不可用。',
  },
  SESSION_EXPORT_FAILED: {
    domain: 'SESSION',
    en: 'Could not allocate a session export filename.',
    zh: '无法分配会话导出文件名。',
  },
  CONFIG_HARNESS_ARGS_REQUIRED: {
    domain: 'CONFIG',
    en: 'COCODE_HARNESS_ARGS is required. See .env.example.',
    zh: '需要设置 COCODE_HARNESS_ARGS。见 .env.example。',
  },
  CONFIG_PROVIDER_REF: {
    domain: 'CONFIG',
    en: 'Invalid credential ref for provider {provider}.',
    zh: '提供方 {provider} 的凭证引用无效。',
  },
  IO_SYMLINK: {
    domain: 'IO',
    en: 'Refusing to use symbolic link {path}.',
    zh: '拒绝使用符号链接 {path}。',
  },
  IO_NOT_FILE: {
    domain: 'IO',
    en: '{path} is not a file.',
    zh: '{path} 不是文件。',
  },
  IO_NOT_DIR: {
    domain: 'IO',
    en: '{path} is not a directory.',
    zh: '{path} 不是目录。',
  },
  IO_MODE: {
    domain: 'IO',
    en: '{path} must have mode 0600.',
    zh: '{path} 权限必须为 0600。',
  },
  IO_PARSE: {
    domain: 'IO',
    en: 'Could not parse {path}.',
    zh: '无法解析 {path}。',
  },
} as const

export type ErrorCode = keyof typeof ERROR_CATALOG
