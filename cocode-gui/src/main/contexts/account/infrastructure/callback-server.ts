import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { renderCallbackPage } from "./callback-page"
import { SignInCancelledError } from "./sign-in-cancelled-error"

/**
 * Serve one loopback authorization callback.
 *
 * `close` doubles as the abort handle: a browser round trip can legitimately
 * take minutes, so the only way to release a caller blocked in `wait` is to
 * shut the listener down under it. On the success path `wait` has already
 * settled and the rejection below is a no-op.
 */
export async function listenForCallback(
	pathname: string,
	timeoutMs = 600_000,
): Promise<{
	readonly redirectUri: string
	wait(): Promise<URL>
	close(): void
}> {
	return new Promise((resolve, reject) => {
		const server = createServer()
		let timer: NodeJS.Timeout | undefined
		let settled = false
		let abort: (error: Error) => void = () => undefined
		const pending = new Promise<URL>((resolveWait, rejectWait) => {
			abort = rejectWait
			timer = setTimeout(() => {
				rejectWait(new Error("login timed out"))
				server.close()
			}, timeoutMs)
			server.on("request", (request: IncomingMessage, response: ServerResponse) => {
				const host = request.headers.host ?? "127.0.0.1"
				const arrived = new URL(request.url ?? "/", `http://${host}`)
				const acceptLanguage = request.headers["accept-language"]
				if (arrived.pathname !== pathname || arrived.hostname !== "127.0.0.1") {
					response.writeHead(404, { "content-type": "text/html; charset=utf-8" })
					response.end(renderCallbackPage("unknown", acceptLanguage))
					return
				}
				if (timer !== undefined) clearTimeout(timer)
				response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
				response.end(renderCallbackPage("done", acceptLanguage))
				resolveWait(arrived)
				server.close()
			})
		})
		// A caller that never reaches `wait` (authorization itself failed) still
		// runs `close`, so the rejection needs an owner from the start.
		void pending.catch(() => undefined)
		server.on("error", (error) => {
			if (!settled) reject(error)
		})
		server.listen(0, "127.0.0.1", () => {
			const address = server.address()
			if (address === null || typeof address === "string") {
				reject(new Error("could not bind loopback callback"))
				return
			}
			settled = true
			resolve({
				redirectUri: `http://127.0.0.1:${String(address.port)}${pathname}`,
				wait: () => pending,
				close: () => {
					if (timer !== undefined) clearTimeout(timer)
					abort(new SignInCancelledError())
					server.close()
				},
			})
		})
	})
}
