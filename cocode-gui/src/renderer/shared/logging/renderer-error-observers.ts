import { RendererLogger } from "./renderer-logger"

export function installRendererErrorObservers(logger: RendererLogger): () => void {
	const onError = (event: ErrorEvent) => {
		logger.error("renderer.window.error", event.error ?? event.message, {
			component: "renderer",
			source: redactSource(event.filename || "unknown"),
			...(Number.isFinite(event.lineno) ? { line: event.lineno } : {}),
			...(Number.isFinite(event.colno) ? { column: event.colno } : {}),
		})
	}
	const onUnhandledRejection = (event: PromiseRejectionEvent) => {
		logger.error("renderer.unhandled-rejection", event.reason, { component: "renderer" })
	}
	window.addEventListener("error", onError)
	window.addEventListener("unhandledrejection", onUnhandledRejection)
	return () => {
		window.removeEventListener("error", onError)
		window.removeEventListener("unhandledrejection", onUnhandledRejection)
		logger.flush()
	}
}

function redactSource(value: string): string {
	try {
		const url = new URL(value)
		return `${url.origin}${url.pathname}`
	} catch {
		return value.replace(/[\\/][^\\/]+[\\/]src[\\/]/g, "<source>/")
	}
}
