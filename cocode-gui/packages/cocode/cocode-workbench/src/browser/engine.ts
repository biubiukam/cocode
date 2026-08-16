/**
 * Chromium ownership: the workbench host owns a real browser so the Web and
 * desktop carriers deliver the same capability from one implementation.
 *
 * A locally installed Chrome or Edge is preferred over a Playwright download,
 * because a 150MB first-run fetch is the single worst moment in this feature.
 * The download stays available as an explicit, user-confirmed fallback.
 */
import { execFile } from "node:child_process"
import { access, mkdir } from "node:fs/promises"
import { constants } from "node:fs"
import { homedir } from "node:os"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { promisify } from "node:util"
import type { BrowserContext } from "playwright-core"
import { BrowserError, type BrowserEngineSource, type BrowserEngineStatus } from "./protocol.ts"

const exec = promisify(execFile)

/** Shared with the agent profile so a login survives a restart. */
export const DEFAULT_PROFILE = "default"
/** Opt-in profile that inherits no human login state. */
export const AGENT_PROFILE = "agent"

interface Candidate {
  readonly source: BrowserEngineSource
  readonly path: string
}

function dshHome(): string {
  const configured = process.env.DSH_HOME
  const selected = configured !== undefined && configured.trim() !== "" ? configured.trim() : join(homedir(), ".dsh")
  return resolve(selected.startsWith("~") ? join(homedir(), selected.slice(1)) : selected)
}

export function browsersRoot(): string {
  return join(dshHome(), "browsers")
}

function profileDir(profile: string): string {
  return join(browsersRoot(), "profiles", profile)
}

function downloadsDir(profile: string): string {
  return join(browsersRoot(), "downloads", profile)
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK)
    return true
  } catch { return false }
}

/** Well-known install locations, checked before anything is downloaded. */
function systemCandidates(): readonly Candidate[] {
  const home = homedir()
  if (process.platform === "darwin") {
    return [
      { source: "system-chrome", path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" },
      { source: "system-chrome", path: join(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome") },
      { source: "system-edge", path: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" },
      { source: "system-edge", path: join(home, "Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge") },
    ]
  }
  if (process.platform === "win32") {
    const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter((value): value is string => typeof value === "string" && value !== "")
    return roots.flatMap(root => [
      { source: "system-chrome" as const, path: join(root, "Google/Chrome/Application/chrome.exe") },
      { source: "system-edge" as const, path: join(root, "Microsoft/Edge/Application/msedge.exe") },
    ])
  }
  return [
    { source: "system-chrome", path: "/opt/google/chrome/chrome" },
    { source: "system-chrome", path: "/usr/bin/google-chrome" },
    { source: "system-chrome", path: "/usr/bin/google-chrome-stable" },
    { source: "system-chrome", path: "/usr/bin/chromium" },
    { source: "system-chrome", path: "/usr/bin/chromium-browser" },
    { source: "system-edge", path: "/usr/bin/microsoft-edge" },
  ]
}

/** Last resort on Linux, where distributions move the binary around. */
async function whichCandidate(): Promise<Candidate | undefined> {
  if (process.platform === "win32") return undefined
  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"]) {
    try {
      const { stdout } = await exec("which", [name])
      const path = stdout.trim()
      if (path !== "" && await isExecutable(path)) {
        return { source: name.includes("edge") ? "system-edge" : "system-chrome", path }
      }
    } catch { /* not on PATH */ }
  }
  return undefined
}

async function findSystemBrowser(): Promise<Candidate | undefined> {
  for (const candidate of systemCandidates()) {
    if (await isExecutable(candidate.path)) return candidate
  }
  return whichCandidate()
}

function playwrightCliPath(): string {
  const require = createRequire(import.meta.url)
  return join(dirname(require.resolve("playwright-core/package.json")), "cli.js")
}

/** Resolve the downloaded Chromium, if a previous install already fetched one. */
async function findDownloadedChromium(): Promise<Candidate | undefined> {
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsersRoot()
  try {
    const { chromium } = await import("playwright-core")
    const path = chromium.executablePath()
    if (path !== "" && await isExecutable(path)) return { source: "playwright-chromium", path }
  } catch { /* not installed yet */ }
  return undefined
}

/**
 * Owns one persistent context per profile. Contexts are created lazily and
 * reused, so a login performed by the human is visible to the agent.
 */
export class BrowserEngine {
  private readonly contexts = new Map<string, Promise<BrowserContext>>()
  private resolved?: Candidate
  private installation?: Promise<void>
  private status: BrowserEngineStatus = { ready: false, installable: true, message: "Looking for a browser…" }

  constructor(private readonly onStatus: (status: BrowserEngineStatus) => void) {}

  describe(): BrowserEngineStatus {
    return this.status
  }

  private publish(status: BrowserEngineStatus): void {
    this.status = status
    this.onStatus(status)
  }

  /** Locate a usable binary without downloading anything. */
  async probe(): Promise<BrowserEngineStatus> {
    if (this.resolved !== undefined) return this.status
    const candidate = await findSystemBrowser() ?? await findDownloadedChromium()
    if (candidate === undefined) {
      this.publish({
        ready: false,
        installable: true,
        message: "No Chrome, Edge or Chromium was found on this machine.",
      })
      return this.status
    }
    this.resolved = candidate
    this.publish({ ready: true, source: candidate.source, executablePath: candidate.path, installable: false })
    return this.status
  }

  /** Download Playwright Chromium into the shared cache. Never implicit. */
  async install(): Promise<void> {
    if (this.resolved !== undefined) return
    this.installation ??= this.runInstall().finally(() => { this.installation = undefined })
    return this.installation
  }

  private async runInstall(): Promise<void> {
    const root = browsersRoot()
    await mkdir(root, { recursive: true })
    this.publish({ ready: false, installable: true, installing: { note: "Downloading Chromium…" } })
    try {
      await exec(process.execPath, [playwrightCliPath(), "install", "chromium"], {
        env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: root },
        maxBuffer: 8 * 1024 * 1024,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.publish({ ready: false, installable: true, message: `Chromium download failed: ${message}` })
      throw new BrowserError("BROWSER_ENGINE_NOT_READY", message)
    }
    const candidate = await findDownloadedChromium()
    if (candidate === undefined) {
      this.publish({ ready: false, installable: true, message: "Chromium was downloaded but could not be located." })
      throw new BrowserError("BROWSER_ENGINE_NOT_READY", "Chromium was downloaded but could not be located.")
    }
    this.resolved = candidate
    this.publish({ ready: true, source: candidate.source, executablePath: candidate.path, installable: false })
  }

  async context(profile: string = DEFAULT_PROFILE): Promise<BrowserContext> {
    const existing = this.contexts.get(profile)
    if (existing !== undefined) return existing
    const created = this.launch(profile).catch(error => {
      this.contexts.delete(profile)
      throw error
    })
    this.contexts.set(profile, created)
    return created
  }

  private async launch(profile: string): Promise<BrowserContext> {
    await this.probe()
    const candidate = this.resolved
    if (candidate === undefined) {
      throw new BrowserError("BROWSER_ENGINE_NOT_READY", this.status.message ?? "No browser engine is available.")
    }
    const userDataDir = profileDir(profile)
    const downloads = downloadsDir(profile)
    await mkdir(userDataDir, { recursive: true })
    await mkdir(downloads, { recursive: true })
    const { chromium } = await import("playwright-core")
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      executablePath: candidate.path,
      acceptDownloads: true,
      downloadsPath: downloads,
      // Permissions are granted per request, never inherited from the profile.
      permissions: [],
      viewport: { width: 1280, height: 800 },
      // Automation fingerprints that bot protection looks for first.
      ignoreDefaultArgs: ["--enable-automation"],
      args: ["--disable-blink-features=AutomationControlled", "--no-first-run", "--no-default-browser-check"],
    })
    context.on("close", () => { this.contexts.delete(profile) })
    return context
  }

  async dispose(): Promise<void> {
    const contexts = [...this.contexts.values()]
    this.contexts.clear()
    await Promise.allSettled(contexts.map(async pending => (await pending).close()))
  }
}
