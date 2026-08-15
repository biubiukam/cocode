/**
 * Cocode TUI entry: TTY check, auth gate, start app, render Ink.
 */

import { readFileSync } from 'node:fs'
import { access as accessAsync } from 'node:fs/promises'
import { resolve } from 'node:path'
import { render } from 'ink'
import { parseInitFromEnv, parseLaunchFromEnv } from '@cocode/tui-connection'
import { createTuiApp } from './runtime/app.ts'
import { displayError, formatError } from './runtime/errors/index.ts'
import { P0_CAPABILITIES } from './runtime/capabilities.ts'
import { resolveSessionRoot } from './runtime/sessions-root.ts'
import { setTheme } from './present/theme.ts'
import {
  createAuthStore,
  saveByokKey,
  otherLiveCount,
  registerLiveInstance,
  releaseLiveInstance,
  releaseLiveInstanceSync,
  type AuthStore,
} from './runtime/auth/index.ts'
import { AuthGate } from './present/auth-gate.tsx'
import { Chat } from './present/chat.tsx'
import { clearViewport, enterScreen, parseScreenMode } from './present/clear-screen.ts'
import { resolveUiLocale } from './runtime/ui-locale.ts'
import { detectTerminalEnvironment } from './runtime/platform.ts'

loadDotenv(resolve(process.cwd(), '.env'))

if (process.stdin.isTTY !== true || process.stdout.isTTY !== true) {
  process.stderr.write('Cocode TUI requires a TTY.\n')
  process.exitCode = 1
} else {
  void main().catch((error: unknown) => {
    process.stderr.write(`Cocode TUI failed to start: ${displayError(error)}\n`)
    process.exitCode = 1
  })
}

async function main(): Promise<void> {
  const launch = parseLaunchFromEnv()
  if ('code' in launch) {
    process.stderr.write(`${formatError(launch.code)}\n`)
    process.exitCode = 1
    return
  }

  const leaveScreen = enterScreen(parseScreenMode(process.env.COCODE_TUI_SCREEN))
  const terminal = detectTerminalEnvironment({
    stdinIsTTY: process.stdin.isTTY === true,
    stdoutIsTTY: process.stdout.isTTY === true,
    stdoutColumns: process.stdout.columns,
    stdoutRows: process.stdout.rows,
  })
  process.once('exit', () => leaveScreen())

  const auth = await createAuthStore()
  if (auth.snapshot().phase !== 'ready') {
    const gated = await runAuthGate(auth)
    if (!gated) {
      leaveScreen()
      process.exitCode = 0
      return
    }
  }

  const resolved = auth.resolved()
  await registerLiveInstance(resolved.dshHome)
  process.on('exit', () => {
    releaseLiveInstanceSync(resolved.dshHome)
  })
  const init = parseInitFromEnv({
    ...process.env,
    COCODE_PROVIDER: resolved.provider,
    COCODE_MODEL: resolved.model,
  })
  const { createTuiRuntime } = await import('@cocode/tui-connection')
  const sessionRoot = resolveSessionRoot({
    env: process.env,
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
      exclusiveHome: async () => (await otherLiveCount(resolved.dshHome)) === 0,
      selectMode: (mode) => auth.selectMode(mode),
      login: () => auth.dispatch({ type: 'chooseCocode' }),
      submitByok: (key) => saveByokKey(resolved.dshHome, key),
      resolved: () => auth.resolved(),
      snapshot: () => auth.snapshot(),
      subscribe: (listener) => auth.subscribe(listener),
    },
    capabilities: { ...P0_CAPABILITIES, sessionList },
    diagnostics: {
      tty: process.stdin.isTTY === true && process.stdout.isTTY === true,
      launchConfigured: nonempty(process.env.COCODE_HARNESS_CMD),
      argsConfigured: nonempty(process.env.COCODE_HARNESS_ARGS),
      sessionRoot: sessionRoot.path,
    },
    locale: resolveUiLocale(process.env),
    setTheme,
  })

  clearViewport()
  const screen = render(<Chat app={app} mouseSupported={terminal.supportsMouse} />)
  let exitStarted = false
  const finish = async (): Promise<void> => {
    if (exitStarted) return
    exitStarted = true
    stop()
    process.stdin.off('end', onInputClosed)
    process.stdin.off('close', onInputClosed)
    process.stdout.off('resize', onResize)
    process.off('SIGTERM', onTerminate)
    process.off('SIGHUP', onTerminate)
    await screen.unmount()
    leaveScreen()
    try {
      await releaseLiveInstance(resolved.dshHome)
      await app.close()
      process.exit(0)
    } catch (error) {
      await releaseLiveInstance(resolved.dshHome).catch(() => undefined)
      process.stderr.write(`Cocode TUI shutdown failed: ${displayError(error)}\n`)
      process.exit(1)
    }
  }
  const stop = app.subscribe(() => {
    if (app.snapshot().exiting) void finish()
  })
  const onInputClosed = (): void => {
    if (!exitStarted) app.dispatch({ type: 'quit' })
  }
  const onResize = (): void => {
    if (!exitStarted) app.dispatch({ type: 'redraw' })
  }
  const onTerminate = (): void => {
    if (!exitStarted) app.dispatch({ type: 'quit' })
  }
  process.stdin.once('end', onInputClosed)
  process.stdin.once('close', onInputClosed)
  process.stdout.on('resize', onResize)
  process.once('SIGTERM', onTerminate)
  process.once('SIGHUP', onTerminate)
  try {
    await app.start()
  } catch (error: unknown) {
    process.stderr.write(`Cocode TUI failed to initialize: ${displayError(error)}\n`)
    await finish()
    return
  }
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
    let unsubscribe: () => void = () => undefined
    let screen: ReturnType<typeof render> | undefined = undefined
    const view = (snapshot = store.snapshot()) => (
      <AuthGate
        snapshot={snapshot}
        dispatch={(action) => store.dispatch(action)}
        onQuit={() => finish(false)}
      />
    )

    const onInputClosed = (): void => finish(false)
    const onInterrupt = (): void => finish(false)
    const onTerminate = (): void => finish(false)
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      process.stdin.off('end', onInputClosed)
      process.stdin.off('close', onInputClosed)
      process.off('SIGINT', onInterrupt)
      process.off('SIGTERM', onTerminate)
      process.off('SIGHUP', onTerminate)
      unsubscribe()
      void screen?.unmount()
      resolveDone(ok)
    }

    process.stdin.once('end', onInputClosed)
    process.stdin.once('close', onInputClosed)
    process.once('SIGINT', onInterrupt)
    process.once('SIGTERM', onTerminate)
    process.once('SIGHUP', onTerminate)

    clearViewport()
    screen = render(view())
    unsubscribe = store.subscribe(() => {
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
