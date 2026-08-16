import { AppWebEntry } from "@deepseek-ai/dsh-client-web"
import type { DshThemePreference } from "../../../contracts/ipc/dsh-runtime.contract"
import { createDshBundleLoader } from "./dsh-bundle-loader"
import { selectDshBootEntries } from "./dsh-boot-entries"
import { installDshTransport } from "./dsh-transport"
import {
	isDesktopDshBridgeAvailable,
	loadDshBootstrap,
	resolveRendererRuntimeOrigin,
} from "./load-dsh-bootstrap"
import { resolveLocalDshClientBundleUrl } from "./local-dsh-client-bundles"
import { RendererLogger } from "../../shared/logging/renderer-logger"

const logger = new RendererLogger()

/** macOS traffic-light strip height; sidebar logo row starts below it. */
const DESKTOP_DARWIN_TITLEBAR_INSET_PX = 32

/**
 * Collapsed-sidebar rail width on macOS. The traffic lights reach x≈68, so the
 * rail widens past the cross-platform 56px to keep the whole light cluster on
 * the sidebar fill instead of straddling the conversation seam. Both the rail's
 * own padding and the shell's grid track derive from this one declaration.
 */
const DESKTOP_DARWIN_SIDEBAR_RAIL_PX = 90

export async function startRenderer(element: HTMLElement): Promise<void> {
	logger.info("renderer.start.started", { component: "renderer" })
	try {
		const bootstrap = await loadDshBootstrap()
		applyInitialTheme(bootstrap.themePreference)
		markDesktopHost()
		markThemeReady()
		const runtimeOrigin = resolveRendererRuntimeOrigin(bootstrap)
		window.__DSH_DESKTOP_RUNTIME_ORIGIN__ = runtimeOrigin
		if (isDesktopDshBridgeAvailable()) {
			installDshTransport(runtimeOrigin, logger)
		}
		const bootEntries = selectDshBootEntries(
			bootstrap.boot.entries,
			window.location.protocol === "file:",
		)
		window.__DSH_BOOT__ = {
			rev: bootstrap.boot.rev,
			entries: bootEntries.map((entry) => ({
				...entry,
				url:
					resolveLocalDshClientBundleUrl(entry.id) ??
					new URL(entry.url, runtimeOrigin).href,
			})),
		}

		await new AppWebEntry(element, {
			loadBundle: createDshBundleLoader(),
		}).run()
		logger.info("renderer.start.completed", { component: "renderer" })
	} catch (error) {
		markThemeReady()
		logger.error("renderer.start.failed", error, { component: "renderer" })
		element.replaceChildren(createFailureView(error))
	}
}

function markThemeReady(): void {
	document.documentElement.dataset.dshThemeReady = "true"
}

/** Reveal desktop titlebar geometry before the client plugin graph paints. */
function markDesktopHost(): void {
	if (!isDesktopDshBridgeAvailable()) return
	const html = document.documentElement
	const platform = resolveDesktopPlatform()
	html.dataset.dshDesktop = "true"
	html.dataset.dshDesktopPlatform = platform
	if (platform === "darwin") {
		html.style.setProperty(
			"--dsh-desktop-titlebar-inset",
			`${String(DESKTOP_DARWIN_TITLEBAR_INSET_PX)}px`,
		)
		html.style.setProperty(
			"--dsh-sidebar-rail-width",
			`${String(DESKTOP_DARWIN_SIDEBAR_RAIL_PX)}px`,
		)
	}
}

function resolveDesktopPlatform(): "darwin" | "linux" | "win32" {
	if (navigator.userAgent.includes("Windows")) return "win32"
	if (navigator.userAgent.includes("Mac")) return "darwin"
	return "linux"
}

/** Apply the host preference before React or the client plugin graph paints. */
function applyInitialTheme(preference: DshThemePreference): void {
	const dark =
		preference === "dark" ||
		(preference === "system" &&
			typeof matchMedia !== "undefined" &&
			matchMedia("(prefers-color-scheme: dark)").matches)
	const scheme = dark ? "dark" : "light"
	document.documentElement.style.colorScheme = scheme
	document.documentElement.dataset.theme = scheme
	document.documentElement.classList.toggle("dark", dark)
	document.body.toggleAttribute("data-ds-dark-theme", dark)
}

function createFailureView(error: unknown): HTMLElement {
	const container = document.createElement("main")
	container.className = "dsh-desktop-startup-error"
	const heading = document.createElement("h1")
	heading.textContent = "DeepSeek Harness 启动失败"
	const message = document.createElement("p")
	message.textContent = error instanceof Error ? error.message : String(error)
	container.append(heading, message)
	return container
}
