import { app, type WebContents } from "electron"
import type { DesktopLogger } from "../logging/desktop-logger"

export function registerElectronObservers(logger: DesktopLogger): () => void {
	const onRenderProcessGone = (...args: unknown[]) => {
		const details = args[1]
		if (!isRecord(details)) return
		logger.log("error", "electron.render-process-gone", {
			attributes: {
				reason: stringValue(details.reason),
				exitCode: numberValue(details.exitCode),
			},
		})
	}
	const onChildProcessGone = (...args: unknown[]) => {
		const details = args[1]
		if (!isRecord(details)) return
		logger.log("error", "electron.child-process-gone", {
			attributes: {
				type: stringValue(details.type),
				reason: stringValue(details.reason),
				exitCode: numberValue(details.exitCode),
			},
		})
	}
	const onWebContentsCreated = (...args: unknown[]) => {
		const contents = args[1] as WebContents | undefined
		if (contents === undefined) return
		const contentsId = contents.id
		contents.on(
			"did-fail-load",
			(_loadEvent, errorCode, errorDescription, validatedURL, isMainFrame) => {
				logger.log("warn", "electron.web-contents.did-fail-load", {
					attributes: {
						contentsId,
						errorCode,
						errorDescription,
						validatedURL: redactUrl(validatedURL),
						isMainFrame,
					},
				})
			},
		)
		contents.on("unresponsive", () =>
			logger.log("warn", "electron.web-contents.unresponsive", {
				attributes: { contentsId },
			}),
		)
		contents.on("responsive", () =>
			logger.log("info", "electron.web-contents.responsive", { attributes: { contentsId } }),
		)
		contents.on("preload-error", (_preloadEvent, preloadPath, error) => {
			logger.log("error", "electron.web-contents.preload-error", {
				attributes: { contentsId, preloadPath: "<preload>" },
				error,
			})
		})
		contents.on("console-message", (_messageEvent, level, message, line, sourceId) => {
			if (level < 2) return
			logger.log(level >= 3 ? "error" : "warn", "renderer.console-message", {
				message,
				attributes: { contentsId, line, sourceId: redactUrl(sourceId) },
			})
		})
	}

	const eventApp = app as unknown as {
		on: (event: string, listener: (...args: unknown[]) => void) => void
		off: (event: string, listener: (...args: unknown[]) => void) => void
	}
	eventApp.on("render-process-gone", onRenderProcessGone)
	eventApp.on("child-process-gone", onChildProcessGone)
	eventApp.on("web-contents-created", onWebContentsCreated)
	return () => {
		eventApp.off("render-process-gone", onRenderProcessGone)
		eventApp.off("child-process-gone", onChildProcessGone)
		eventApp.off("web-contents-created", onWebContentsCreated)
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value : "unknown"
}

function numberValue(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : -1
}

function redactUrl(value: string): string {
	try {
		const url = new URL(value)
		return `${url.origin}${url.pathname}`
	} catch {
		return "<invalid-url>"
	}
}
