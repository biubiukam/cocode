import type { Session } from "electron"

/**
 * Scope direct sidecar browser transport to loopback DSH downlinks, Cocode
 * plugin resources, and the development-only HMR SSE channel. JSON API fetches
 * still cross the narrow Preload/Main bridge; native WebSocket handshakes and
 * browser-owned resources such as iframe, image and script URLs reach the
 * sidecar directly with same-origin trust markers.
 */
export function registerDshWebSocketTransport(
	targetSession: Session,
	runtimeOrigin: string,
	rendererOrigin?: string,
): () => void {
	const websocketOrigin = new URL(runtimeOrigin)
	websocketOrigin.protocol = websocketOrigin.protocol === "https:" ? "wss:" : "ws:"
	const runtimeHttpOrigin = new URL(runtimeOrigin).origin
	const filter = {
		urls: [
			`${websocketOrigin.origin}/api/events.mux*`,
			`${websocketOrigin.origin}/api/events.host*`,
			`${websocketOrigin.origin}/sidebar/ws/*`,
			`${runtimeHttpOrigin}/sidebar/*`,
		],
	}
	const eventsFilter = { urls: [`${runtimeHttpOrigin}/plugins/events*`] }

	targetSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
		const requestHeaders = { ...details.requestHeaders }
		setHeader(requestHeaders, "Origin", runtimeOrigin)
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

	return () => {
		targetSession.webRequest.onBeforeSendHeaders(filter, null)
		if (rendererOrigin !== undefined)
			targetSession.webRequest.onHeadersReceived(eventsFilter, null)
	}
}

function setHeader(headers: Record<string, string | string[]>, name: string, value: string): void {
	const existing = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase())
	headers[existing ?? name] = value
}
