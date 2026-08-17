import type { Session, WebRequestFilter } from "electron"

/**
 * Scope direct sidecar browser transport to loopback DSH downlinks, Cocode
 * plugin resources, and the development-only HMR SSE channel. JSON API fetches
 * still cross the narrow Preload/Main bridge; native WebSocket handshakes and
 * browser-owned resources such as iframe, image and script URLs reach the
 * sidecar directly with same-origin trust markers.
 */
export interface DshWebSocketTransportController {
	updateRuntimeOrigin(origin: string): void
	dispose(): void
}

export function registerDshWebSocketTransport(
	targetSession: Session,
	runtimeOrigin: string,
	rendererOrigin?: string,
): DshWebSocketTransportController {
	let currentOrigin = new URL(runtimeOrigin).origin
	type InstalledFilters = { filter: WebRequestFilter; eventsFilter: WebRequestFilter }
	let installed: InstalledFilters

	const install = (origin: string): InstalledFilters => {
		const websocketOrigin = new URL(origin)
		websocketOrigin.protocol = websocketOrigin.protocol === "https:" ? "wss:" : "ws:"
		const filter: WebRequestFilter = {
			urls: [
				`${websocketOrigin.origin}/api/events.mux*`,
				`${websocketOrigin.origin}/api/events.host*`,
				`${origin}/sidebar/ws/*`,
				`${origin}/sidebar/*`,
			],
		}
		const eventsFilter: WebRequestFilter = { urls: [`${origin}/plugins/events*`] }

		targetSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
			const requestHeaders = { ...details.requestHeaders }
			setHeader(requestHeaders, "Origin", origin)
			setHeader(requestHeaders, "Sec-Fetch-Site", "same-origin")
			callback({ requestHeaders })
		})
		if (rendererOrigin !== undefined) {
			targetSession.webRequest.onHeadersReceived(eventsFilter, (details, callback) => {
				const responseHeaders = { ...details.responseHeaders }
				setHeader(responseHeaders, "Access-Control-Allow-Origin", rendererOrigin)
				callback({ responseHeaders })
			})
		}
		return { filter, eventsFilter }
	}

	const uninstall = (filters: InstalledFilters): void => {
		targetSession.webRequest.onBeforeSendHeaders(filters.filter, null)
		if (rendererOrigin !== undefined)
			targetSession.webRequest.onHeadersReceived(filters.eventsFilter, null)
	}

	installed = install(currentOrigin)
	return {
		updateRuntimeOrigin(origin) {
			const nextOrigin = new URL(origin).origin
			if (nextOrigin === currentOrigin) return
			const previous = installed
			currentOrigin = nextOrigin
			installed = install(nextOrigin)
			uninstall(previous)
		},
		dispose: () => uninstall(installed),
	}
}

function setHeader(headers: Record<string, string | string[]>, name: string, value: string): void {
	const existing = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase())
	headers[existing ?? name] = value
}
