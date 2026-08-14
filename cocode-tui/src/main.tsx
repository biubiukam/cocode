/**
 * Cocode TUI entry: TTY check, auth gate, start app, render Ink.
 */

import { readFileSync } from 'node:fs'
import { access as accessAsync } from 'node:fs/promises'
import { resolve } from 'node:path'
import { render } from 'ink'
import { parseInitFromEnv, parseLaunchFromEnv } from '@cocode/tui-connection'
import { createTuiApp } from './runtime/app.ts'
import { P0_CAPABILITIES } from './runtime/capabilities.ts'
import { resolveSessionRoot } from './runtime/sessions-root.ts'
import { setTheme } from './present/theme.ts'
import { createAuthStore, type AuthStore } from './runtime/auth/index.ts'
import { AuthGate } from './present/auth-gate.tsx'
import { Chat } from './present/chat.tsx'
import { clearScreen } from './present/clear-screen.ts'

loadDotenv(resolve(process.cwd(), '.env'))

if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
  process.stderr.write('Cocode TUI requires a TTY.\n')
  process.exitCode = 1
} else {
  void main()
}

async function main(): Promise<void> {
  const launch = parseLaunchFromEnv()
  if ('error' in launch) {
    process.stderr.write(`${launch.error}\n`)
    process.exitCode = 1
    return
  }

  const auth = await createAuthStore()
  if (auth.snapshot().phase !== 'ready') {
    const gated = await runAuthGate(auth)
    if (!gated) {
      process.exitCode = 0
      return
    }
  }

  const resolved = auth.resolved()
  const init = parseInitFromEnv({
    ...process.env,
    COCODE_PROVIDER: resolved.provider,
    COCODE_MODEL: resolved.model,
  })
  const { createTuiRuntime } = await import('@cocode/tui-connection')
  const sessionRoot = resolveSessionRoot({
    env: process.env,
    productHome: resolved.home,
    cwd: init.cwd,
  })
  const sessionList = (await directoryExists(sessionRoot.path)) ? 'jsonl' : 'none'
  const runtime = createTuiRuntime({
    ...launch,
    env: {
      ...process.env,
      ...resolved.env,
      DSH_SESSION_ROOT: sessionRoot.path,
    },
  })
  const app = createTuiApp({
    runtime,
    cwd: init.cwd,
    provider: resolved.provider,
    model: resolved.model,
    auth: {
      mode: resolved.mode,
      envLocked: auth.snapshot().envLocked,
      accountLabel: auth.snapshot().profile?.displayName,
      logout: () => auth.logout(),
    },
    capabilities: { ...P0_CAPABILITIES, sessionList },
    diagnostics: {
      tty: process.stdin.isTTY === true && process.stdout.isTTY === true,
      launchConfigured: nonempty(process.env.COCODE_HARNESS_CMD),
      argsConfigured: nonempty(process.env.COCODE_HARNESS_ARGS),
      sessionRoot: sessionRoot.path,
    },
    setTheme,
  })

  clearScreen()
  const screen = render(<Chat app={app} />)
  let exitStarted = false
  const finish = async (): Promise<void> => {
    if (exitStarted) return
    exitStarted = true
    stop()
    await screen.unmount()
    try {
      await app.close()
      process.exit(0)
    } catch (error) {
      process.stderr.write(`Cocode TUI shutdown failed: ${errorMessage(error)}\n`)
      process.exit(1)
    }
  }
  const stop = app.subscribe(() => {
    if (app.snapshot().exiting) void finish()
  })
  await app.start()
  if (app.snapshot().exiting) await finish()
  else {
    await new Promise<void>(() => {
      // The process exits from finish() once the app requests shutdown.
    })
  }
}

function runAuthGate(store: AuthStore): Promise<boolean> {
  return new Promise((resolveDone) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      unsubscribe()
      void screen.unmount()
      resolveDone(ok)
    }

    const view = (snapshot = store.snapshot()) => (
      <AuthGate
        snapshot={snapshot}
        dispatch={(action) => store.dispatch(action)}
        onQuit={() => finish(false)}
      />
    )

    clearScreen()
    const screen = render(view())
    const unsubscribe = store.subscribe(() => {
      const snapshot = store.snapshot()
      if (snapshot.phase === 'ready') {
        finish(true)
        return
      }
      screen.rerender(view(snapshot))
    })
  })
}

function loadDotenv(path: string): void {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    await accessAsync(path)
    return true
  } catch {
    return false
  }
}

function nonempty(value: string | undefined): boolean {
  return value?.trim() !== undefined && value.trim() !== ''
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
