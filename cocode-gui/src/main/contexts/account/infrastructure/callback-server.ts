import { createServer, type IncomingMessage, type ServerResponse } from "node:http"

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
		const pending = new Promise<URL>((resolveWait, rejectWait) => {
			timer = setTimeout(() => {
				rejectWait(new Error("login timed out"))
				server.close()
			}, timeoutMs)
			server.on("request", (request: IncomingMessage, response: ServerResponse) => {
				const host = request.headers.host ?? "127.0.0.1"
				const arrived = new URL(request.url ?? "/", `http://${host}`)
				if (arrived.pathname !== pathname || arrived.hostname !== "127.0.0.1") {
					response.writeHead(404)
					response.end()
					return
				}
				if (timer !== undefined) clearTimeout(timer)
				response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
				response.end(
					'<!doctype html><meta charset="utf-8"><title>Cocode</title><p>可以回到 Cocode 了。</p>',
				)
				resolveWait(arrived)
				server.close()
			})
		})
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
					server.close()
				},
			})
		})
	})
}
