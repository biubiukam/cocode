# Getting started with Cocode in the terminal

[中文](../zh/login.md) · [English](./login.md)

If this machine cannot call a model yet, TUI pauses on first launch and asks one question:

**Use your own API key, or a Cocode account?**

You enter the conversation only after that choice. Both setups can stay on this computer; switch with `/use` in the chat. Secrets are never written into the transcript, and the UI never shows a full key again.

## Your own key

Use `↑` `↓` to select **Paste API Key**, then Enter. Or press `1`. Paste a DeepSeek API key and press Enter.

Later launches skip this step. If you already saved the same key in the desktop GUI, the terminal usually does not ask again — both clients read the same local config.

If you are already in a conversation and have no key yet, type `/use byok` and paste when prompted.

## Cocode account

Use `↑` `↓` to select **Sign in to Cocode**, then Enter. Or press `2`. The terminal shows a short code and usually opens the confirmation page. Sign in on the web (email, Google, or GitHub; 2FA stays in the browser), allow access, then return to the terminal.

If you are already in a conversation, `/login` adds the account. You do not need to quit first.

After sign-in, chat uses Cocode-hosted models. A key you pasted earlier stays; it is not replaced by the account key.

Running out of quota only means models cannot run for a while. It is not a sign-out, and TUI does not silently switch to your key.

## Switching when both are configured

In the conversation:

- `/use byok` — switch to your key (new session; the on-screen transcript is cleared)
- `/use cocode` — switch to Cocode (also a new session)
- `/status` — see the current channel and whether the other one is configured (no secrets)
- `/logout` — sign out of Cocode. Your key stays; if a key exists, TUI switches to it and does not quit
- `/login` — sign in or refresh Cocode without deleting your key

When `COCODE_PROVIDER` is set in the environment, `/use` does not change the default channel on disk. With several TUI windows open, these commands also refuse, so they cannot rewrite config another window is using.

## Relation to the desktop app

The GUI and terminal share DSH settings, credentials, and business data under
`~/.dsh`. Cocode identity tokens stay in `~/.cocode/account.yaml`; the TUI
builds the Cocode provider route only for the current process.

## Configuration directories

Your API key is stored in the shared DSH credentials file at
`~/.dsh/.credentials.yaml`. Cocode reads and writes that file directly; there
is no one-time import or `.cocode/credentials` fallback. The TUI does not copy
the file-backed key into the process environment.

Set `COCODE_HOME` (default `~/.cocode`) for account/runtime data or
`COCODE_DSH_HOME` (default `~/.dsh`) for the shared DSH Home. Development launch
flags are documented in `.env.example`.

Sign-in or channel-switch failures show `CODE · explanation` on the status line. See [error codes](./errors.md).
