import { AppWebEntry } from "@deepseek-ai/dsh-client-web"
import type { DshThemePreference } from "../../../contracts/ipc/dsh-runtime.contract"
import { createDshBundleLoader } from "./dsh-bundle-loader"
import { selectDshBootEntries } from "./dsh-boot-entries"
import { installDshTransport } from "./dsh-transport"
import { resolveLocalDshClientBundleUrl } from "./local-dsh-client-bundles"

export async function startRenderer(element: HTMLElement): Promise<void> {
	try {
		const bootstrap = await window.desktopApi.dsh.getBootstrap()
		applyInitialTheme(bootstrap.themePreference)
		markThemeReady()
		const runtimeOrigin = new URL(bootstrap.origin).origin
		window.__DSH_DESKTOP_RUNTIME_ORIGIN__ = runtimeOrigin
		installDshTransport(runtimeOrigin)
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
	} catch (error) {
		markThemeReady()
		console.error("Failed to start the DeepSeek Harness Web UI:", error)
		element.replaceChildren(createFailureView(error))
	}
}

function markThemeReady(): void {
	document.documentElement.dataset.dshThemeReady = "true"
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
