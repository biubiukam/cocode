/**
 * Ownership of the real Chromium the sidebar browser drives.
 *
 * The binary is NOT an npm dependency: a browser build is hundreds of
 * megabytes and would bloat every install that never opens the panel. It is
 * fetched on first use into a shared cache under the DSH home, so the desktop
 * app and a standalone `dsh web` reuse one copy. The UI never blocks on this
 * silently — {@link BrowserEngine.status} drives an explicit install prompt.
 *
 * Chromium runs headless and is never shown natively: every pixel reaches the
 * user through the CDP screencast in the sidebar panel. That keeps the human
 * and the agent looking at literally the same page, and makes the feature
 * behave identically on a desktop build, a browser tab, and a headless server.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import type { BrowserContext } from 'playwright-core'
import type { BrowserEngineStatus } from './protocol.ts'

/** Chromium's own UA with the automation marker removed. */
const HEADLESS_MARKER = /HeadlessChrome/g

/**
 * Launch flags that keep an automated profile behaving like a normal browser.
 * Bot-protection vendors fingerprint the automation bit aggressively; this is
 * best-effort hardening, not a guarantee (see the open-in-system-browser
 * escape hatch in the UI).
 */
const LAUNCH_ARGS = [
  '--disable-blink-features=AutomationControlled',
  '--no-default-browser-check',
  '--no-first-run',
  '--disable-features=Translate,MediaRouter',
]

/** Resolve the Harness home with the same precedence the runtime uses. */
export function dshHome(): string {
  const fromEnv = process.env.DSH_HOME
  if (fromEnv !== undefined && fromEnv.trim() !== '') return fromEnv.trim()
  return join(homedir(), '.dsh')
}

/** Where downloaded browser builds are cached (shared across carriers). */
export function enginesDir(): string {
  return join(dshHome(), 'browsers', 'engines')
}

/** Where one named browser profile persists its cookies and storage. */
export function profileDir(profile: string): string {
  return join(dshHome(), 'browsers', 'profiles', profile)
}

/** Where a profile's downloads land (never the workspace). */
export function downloadsDir(profile: string): string {
  return join(profileDir(profile), 'downloads')
}

/** Tunables of the browser engine. */
export interface BrowserEngineOptions {
  /** Profile name; one persistent Chromium context per profile. */
  profile: string
  /**
   * Run Chromium with a visible window. Off by default (the screencast is the
   * only surface); the escape hatch for sites that refuse headless traffic.
   */
  headed: boolean
}

/**
 * The Chromium lifecycle owner: install state, a single persistent context,
 * and status fan-out to every connected viewport.
 */
export class BrowserEngine {
  private state: BrowserEngineStatus = { state: 'missing' }
  private contextPromise: Promise<BrowserContext> | null = null
  private installPromise: Promise<void> | null = null
  private readonly watchers = new Set<(status: BrowserEngineStatus) => void>()

  constructor(private readonly options: BrowserEngineOptions) {
    // PLAYWRIGHT_BROWSERS_PATH is read when playwright-core builds its
    // registry, so it must be set before the first dynamic import below.
    process.env.PLAYWRIGHT_BROWSERS_PATH ??= enginesDir()
  }

  /** Current engine readiness (cheap; safe to call per request). */
  get status(): BrowserEngineStatus {
    return this.state
  }

  /** Subscribe to readiness transitions; returns the disposer. */
  watch(listener: (status: BrowserEngineStatus) => void): () => void {
    this.watchers.add(listener)
    return () => { this.watchers.delete(listener) }
  }

  private setStatus(next: BrowserEngineStatus): void {
    this.state = next
    for (const listener of this.watchers) {
      try {
        listener(next)
      } catch {
        // A viewport that died mid-notify must not break the others.
      }
    }
  }

  /**
   * Refresh {@link status} from disk without downloading anything. Called
   * before the UI decides whether to show the install prompt.
   */
  async probe(): Promise<BrowserEngineStatus> {
    if (this.state.state === 'installing') return this.state
    this.setStatus(await this.detect())
    return this.state
  }

  private async detect(): Promise<BrowserEngineStatus> {
    try {
      const { chromium } = await import('playwright-core')
      const path = chromium.executablePath()
      if (path !== '' && existsSync(path)) return { state: 'ready' }
      return { state: 'missing' }
    } catch (error) {
      // executablePath() throws when the registry has no matching build —
      // that is the ordinary "not installed yet" case, not a failure.
      const message = error instanceof Error ? error.message : String(error)
      return /not installed|Executable doesn't exist|browserType\.executablePath/i.test(message)
        ? { state: 'missing' }
        : { state: 'error', message }
    }
  }

  /**
   * Download the Chromium build if it is missing. Concurrent callers share
   * one download. Resolves once the engine is ready; rejects with the install
   * failure so the caller can surface it verbatim.
   */
  async install(): Promise<void> {
    if ((await this.probe()).state === 'ready') return
    this.installPromise ??= this.runInstall().finally(() => { this.installPromise = null })
    await this.installPromise
  }

  private async runInstall(): Promise<void> {
    this.setStatus({ state: 'installing', message: 'downloading Chromium' })
    mkdirSync(enginesDir(), { recursive: true })
    const cli = resolvePlaywrightCli()
    if (cli === undefined) {
      const status: BrowserEngineStatus = { state: 'error', message: 'playwright-core CLI was not found in the installation' }
      this.setStatus(status)
      throw new Error(status.message)
    }
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [cli, 'install', 'chromium'], {
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: enginesDir() },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let tail = ''
      const absorb = (chunk: Buffer): void => {
        tail = `${tail}${chunk.toString('utf8')}`.slice(-4096)
        // Playwright prints percentage lines; surface the newest one so the
        // install prompt shows real progress instead of a frozen spinner.
        const progress = /(\d+)%/.exec(tail.split('\n').filter(Boolean).at(-1) ?? '')
        if (progress !== null) this.setStatus({ state: 'installing', message: `downloading Chromium ${progress[1]}%` })
      }
      child.stdout?.on('data', absorb)
      child.stderr?.on('data', absorb)
      child.once('error', reject)
      child.once('exit', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`chromium install exited with code ${String(code)}\n${tail}`))
      })
    }).then(
      async () => { this.setStatus(await this.detect()) },
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        this.setStatus({ state: 'error', message })
        throw error instanceof Error ? error : new Error(message)
      },
    )
  }

  /**
   * The shared persistent context, launched on first use. Cookies and login
   * state survive restarts, which is exactly what makes the agent useful —
   * and exactly why §credential-inheritance in the RFC is a deliberate
   * product decision rather than an accident.
   */
  async context(): Promise<BrowserContext> {
    this.contextPromise ??= this.launch().catch((error: unknown) => {
      this.contextPromise = null
      throw error
    })
    return await this.contextPromise
  }

  private async launch(): Promise<BrowserContext> {
    await this.install()
    const { chromium } = await import('playwright-core')
    const dir = profileDir(this.options.profile)
    mkdirSync(dir, { recursive: true })
    mkdirSync(downloadsDir(this.options.profile), { recursive: true })
    const context = await chromium.launchPersistentContext(dir, {
      headless: !this.options.headed,
      args: LAUNCH_ARGS,
      acceptDownloads: true,
      downloadsPath: downloadsDir(this.options.profile),
      viewport: { width: 1280, height: 800 },
      // Every capability a page may ask for starts denied; the UI grants
      // them one at a time.
      permissions: [],
    })
    const agent = await stripHeadlessMarker(context)
    if (agent !== undefined) await context.setExtraHTTPHeaders({ 'user-agent': agent })
    context.once('close', () => { this.contextPromise = null })
    return context
  }

  /** Close Chromium and forget the context (idempotent). */
  async dispose(): Promise<void> {
    const pending = this.contextPromise
    this.contextPromise = null
    if (pending === null) return
    await pending.then(
      async (context) => { await context.close() },
      () => { /* the launch already failed; nothing to close */ },
    )
  }
}

/**
 * Read Chromium's own UA and drop the `HeadlessChrome` token. Returning
 * undefined leaves the default in place rather than guessing a version.
 */
async function stripHeadlessMarker(context: BrowserContext): Promise<string | undefined> {
  const probe = await context.newPage()
  try {
    const agent = await probe.evaluate(() => navigator.userAgent)
    return HEADLESS_MARKER.test(agent) ? agent.replace(HEADLESS_MARKER, 'Chrome') : undefined
  } catch {
    return undefined
  } finally {
    await probe.close().catch(() => { /* the probe page is disposable */ })
  }
}

/** Locate playwright-core's installer CLI inside the resolved dependency. */
function resolvePlaywrightCli(): string | undefined {
  const require_ = createRequire(import.meta.url)
  try {
    return require_.resolve('playwright-core/cli')
  } catch {
    try {
      const manifest = require_.resolve('playwright-core/package.json')
      const candidate = join(manifest, '..', 'cli.js')
      return existsSync(candidate) ? candidate : undefined
    } catch {
      return undefined
    }
  }
}
