# TUI error codes

[中文](../zh/errors.md) · [English](./errors.md)

Failures produced by TUI itself show as `CODE · explanation`. Language follows `COCODE_LANG`, then `LANG` / `LC_MESSAGES`. `zh*` is Chinese; everything else is English.

This catalog covers **TUI client** errors only. Harness / tool-card `error.code` values still display as-is.

Secrets never appear in the explanation.

## AUTH

Sign-in, device authorization, credentials, and the agency origin.

| Code                          | When it happens                                    | Message                                                                          |
| ----------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------- |
| `AUTH_NOT_READY`              | Reading resolved auth before it is ready           | Auth is not ready.                                                               |
| `AUTH_BYOK_EMPTY`             | The pasted API key is empty                        | Paste an API key.                                                                |
| `AUTH_HOME_BUSY`              | Another TUI is using the same product home         | Another Cocode TUI is using this home. Close it before switching or signing out. |
| `AUTH_LOGIN_FAILED`           | Sign-in failed without a more specific code        | Sign-in failed.                                                                  |
| `AUTH_LOGIN_CANCELLED`        | The user cancelled device flow                     | Sign-in cancelled.                                                               |
| `AUTH_BROWSER_OPEN_FAILED`    | The verification page could not be opened          | Could not open the verification page. Open the URL shown above manually.         |
| `AUTH_DEVICE_START_FAILED`    | Device login could not start                       | Could not start device login.                                                    |
| `AUTH_DEVICE_INVALID`         | Agency returned an incomplete device authorization | Agency returned an invalid device authorization.                                 |
| `AUTH_DEVICE_EXPIRED`         | Device authorization timed out                     | Device authorization expired.                                                    |
| `AUTH_DEVICE_DENIED`          | The browser did not approve login                  | Device login was not approved.                                                   |
| `AUTH_SESSION_EXPIRED`        | The identity session expired                       | Session expired.                                                                 |
| `AUTH_ACCOUNT_LOAD_FAILED`    | Account profile could not be loaded                | Could not load account.                                                          |
| `AUTH_ACCOUNT_INVALID`        | Account payload was malformed                      | Agency returned an invalid account.                                              |
| `AUTH_KEY_CREATE_FAILED`      | A personal API key could not be minted             | Could not create an API key.                                                     |
| `AUTH_MODELS_LIST_FAILED`     | Hosted models could not be listed                  | Could not list hosted models.                                                    |
| `AUTH_MODELS_INVALID`         | The model catalog was malformed                    | Agency returned an invalid model catalog.                                        |
| `AUTH_NO_HOSTED_MODELS`       | The account has no hosted models                   | This account has no hosted models.                                               |
| `AUTH_ORIGIN_INVALID`         | `COCODE_AGENCY_ORIGIN` is not a URL                | Agency origin is not a URL.                                                      |
| `AUTH_ORIGIN_CREDENTIALS`     | Origin includes credentials or a query string      | Agency origin must not contain credentials or query parameters.                  |
| `AUTH_ORIGIN_PATH`            | Origin includes a path                             | Agency origin must not contain a path.                                           |
| `AUTH_ORIGIN_HTTPS`           | Origin is not https (except local http)            | Agency origin must be https.                                                     |
| `AUTH_VERIFY_URL_INVALID`     | Device confirmation URL is not a URL               | {field} is not a URL.                                                            |
| `AUTH_VERIFY_URL_CREDENTIALS` | Device confirmation URL includes credentials       | {field} must not contain credentials.                                            |
| `AUTH_VERIFY_URL_HTTPS`       | Device confirmation URL is not https               | {field} must use https.                                                          |
| `AUTH_CREDENTIAL_REF`         | Credential key name is illegal                     | Illegal credential ref: {ref}.                                                   |
| `AUTH_CREDENTIAL_EMPTY`       | Credential value is empty                          | Credential value is empty.                                                       |
| `AUTH_CREDENTIALS_PARSE`      | `.credentials.yaml` is not a string mapping        | Could not parse credentials.                                                     |
| `AUTH_SETTINGS_PARSE`         | `settings.yaml` could not be parsed                | Could not parse settings.yaml.                                                   |

## RUNTIME

Shared Host JSON-RPC startup, stop, and unclassified failures.

| Code                  | When it happens                              | Message                                                                                        |
| --------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `RUNTIME_INIT_FAILED` | `initialize` failed                          | Initialize failed. Check the shared DSH Host and Supervisor, then /exit. {detail}              |
| `RUNTIME_STOPPED`     | Host connection closed or the transport closed | Runtime stopped: {detail}.                                                                     |
| `RUNTIME_UNKNOWN`     | A non-`TuiError` failure reached the UI      | Unexpected error: {detail}.                                                                    |

## COMMAND

Local slash parsing.

| Code              | When it happens                            | Message                  |
| ----------------- | ------------------------------------------ | ------------------------ |
| `COMMAND_INVALID` | Input starts with `/` but is not a command | Not a command.           |
| `COMMAND_UNKNOWN` | Unknown slash command                      | Unknown command /{name}. |

## SESSION

Local session directory and export.

| Code                       | When it happens                         | Message                                       |
| -------------------------- | --------------------------------------- | --------------------------------------------- |
| `SESSION_ROOT_UNAVAILABLE` | `/resume` has no session root           | Session root is unavailable.                  |
| `SESSION_EXPORT_FAILED`    | `/export` could not allocate a filename | Could not allocate a session export filename. |

## CONFIG

Launch configuration.

No runtime command or sibling checkout is required. The TUI discovers the
shared Supervisor from `DSH_HOME`, `DSH_PROFILE`, and the optional Host
fingerprint environment variables.

| Code                  | When it happens                              | Message                                         |
| --------------------- | -------------------------------------------- | ----------------------------------------------- |
| `CONFIG_PROVIDER_REF` | Provider `apiKeyEnv` is not a legal env name | Invalid credential ref for provider {provider}. |

## IO

Reads and writes under the product home.

| Code          | When it happens                     | Message                               |
| ------------- | ----------------------------------- | ------------------------------------- |
| `IO_SYMLINK`  | Refusing to read or write a symlink | Refusing to use symbolic link {path}. |
| `IO_NOT_FILE` | Path exists but is not a file       | {path} is not a file.                 |
| `IO_NOT_DIR`  | Path exists but is not a directory  | {path} is not a directory.            |
| `IO_MODE`     | Secret file mode is not `0600`      | {path} must have mode 0600.           |
| `IO_PARSE`    | YAML could not be parsed            | Could not parse {path}.               |
