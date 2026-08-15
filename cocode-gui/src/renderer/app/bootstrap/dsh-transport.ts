const TRANSPORT_PATCH_MARKER = "__DSH_DESKTOP_TRANSPORT__"

interface DesktopTransportState {
	readonly origin: string
	readonly fetch: typeof window.fetch
	readonly WebSocket: typeof window.WebSocket
	readonly EventSource: typeof window.EventSource
}

interface DesktopTransportWindow extends Window {
	[TRANSPORT_PATCH_MARKER]?: DesktopTransportState
}

export function installDshTransport(runtimeOrigin: string): void {
	const target = window as DesktopTransportWindow
	const current = target[TRANSPORT_PATCH_MARKER]
	if (current?.origin === runtimeOrigin) return

	const currentOrigin = window.location.origin
	const currentHref = window.location.href
	const previousFetch = current?.fetch ?? window.fetch.bind(window)
	const PreviousWebSocket = current?.WebSocket ?? window.WebSocket
	const PreviousEventSource = current?.EventSource ?? window.EventSource
	target[TRANSPORT_PATCH_MARKER] = {
		origin: runtimeOrigin,
		fetch: previousFetch,
		WebSocket: PreviousWebSocket,
		EventSource: PreviousEventSource,
	}

	window.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const inputUrl = input instanceof Request ? input.url : String(input)
		const rewritten = rewriteDshHttpUrl(inputUrl, currentOrigin, currentHref, runtimeOrigin)
		if (rewritten === undefined) return previousFetch(input, init)

		const baseRequest =
			input instanceof Request ? new Request(rewritten, input) : new Request(rewritten, init)
		const request =
			input instanceof Request && init !== undefined
				? new Request(baseRequest, init)
				: baseRequest
		const requestId = crypto.randomUUID()
		const signal = request.signal
		if (signal.aborted) throw abortReason(signal)
		const cancel = (): void => window.desktopApi.dsh.cancelRequest(requestId)
		signal.addEventListener("abort", cancel, { once: true })
		try {
			const response = await window.desktopApi.dsh.request({
				requestId,
				path: `${new URL(rewritten).pathname}${new URL(rewritten).search}`,
				method: request.method as "GET" | "HEAD" | "POST",
				headers: [...request.headers.entries()],
				body:
					request.method === "GET" || request.method === "HEAD"
						? undefined
						: new Uint8Array(await request.arrayBuffer()),
			})
			if (signal.aborted) throw abortReason(signal)
			const headers = new Headers()
			for (const [name, value] of response.headers) headers.append(name, value)
			const bodyAllowed =
				request.method !== "HEAD" && ![204, 205, 304].includes(response.status)
			return new Response(bodyAllowed ? response.body : null, {
				status: response.status,
				statusText: response.statusText,
				headers,
			})
		} finally {
			signal.removeEventListener("abort", cancel)
		}
	}) as typeof window.fetch

	class DshWebSocket extends PreviousWebSocket {
		public constructor(url: string | URL, protocols?: string | string[]) {
			super(rewriteDshWebSocketUrl(url, currentOrigin, currentHref, runtimeOrigin), protocols)
		}
	}
	window.WebSocket = DshWebSocket

	class DshEventSource extends PreviousEventSource {
		public constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
			super(rewriteEventSourceUrl(url, currentOrigin, runtimeOrigin), eventSourceInitDict)
		}
	}
	window.EventSource = DshEventSource
}

export function rewriteDshHttpUrl(
	input: string,
	currentOrigin: string,
	currentHref: string,
	runtimeOrigin: string,
): string | undefined {
	let url: URL
	try {
		url = new URL(input, currentHref)
	} catch {
		return undefined
	}
	if (
		(url.origin !== currentOrigin && url.origin !== runtimeOrigin) ||
		!isDshDesktopHttpPath(url.pathname)
	)
		return undefined
	const runtimeUrl = new URL(url.pathname, runtimeOrigin)
	runtimeUrl.search = url.search
	return runtimeUrl.href
}

export function rewriteDshWebSocketUrl(
	input: string | URL,
	currentOrigin: string,
	currentHref: string,
	runtimeOrigin: string,
): string {
	const url = new URL(input, currentHref)
	if (
		(url.origin !== currentOrigin && url.origin !== runtimeOrigin) ||
		!isDshDesktopWebSocketPath(url.pathname)
	)
		return url.href
	const runtimeUrl = new URL(url.pathname, runtimeOrigin)
	runtimeUrl.protocol = runtimeUrl.protocol === "https:" ? "wss:" : "ws:"
	runtimeUrl.search = url.search
	return runtimeUrl.href
}

/**
 * Keep the HMR SSE channel on the DSH sidecar. The client-hmr bundle uses a
 * relative `/plugins/events` URL, which would otherwise resolve against the
 * Vite renderer server and return its 404 fallback.
 */
export function rewriteEventSourceUrl(
	input: string | URL,
	currentOrigin: string,
	runtimeOrigin: string,
): string {
	const url = new URL(input, `${currentOrigin}/`)
	if (url.origin !== currentOrigin || url.pathname !== "/plugins/events") return url.href
	const runtimeUrl = new URL(url.pathname, runtimeOrigin)
	runtimeUrl.search = url.search
	return runtimeUrl.href
}

function isDshDesktopHttpPath(pathname: string): boolean {
	return (
		pathname === "/api" ||
		pathname.startsWith("/api/") ||
		pathname === "/sidebar" ||
		pathname.startsWith("/sidebar/")
	)
}

function isDshDesktopWebSocketPath(pathname: string): boolean {
	return isDshDesktopHttpPath(pathname)
}

function abortReason(signal: AbortSignal): unknown {
	return signal.reason ?? new DOMException("The operation was aborted.", "AbortError")
}
