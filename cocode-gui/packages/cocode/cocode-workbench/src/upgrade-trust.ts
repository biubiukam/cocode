import type { IncomingMessage } from "node:http"

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

/**
 * Reject a drive-by connection from a foreign web page. Browsers always send
 * an Origin on the handshake, so a same-origin or loopback one is the app's
 * own shell (desktop, dev server, LAN-served web) while an absent one is a
 * non-browser client that never carried an ambient cookie in the first place.
 *
 * Both workbench sockets share this: one spawns shells and the other drives a
 * browser holding the user's logins, so their trust boundary must be one
 * decision rather than two that can drift apart.
 */
export function isTrustedUpgrade(request: Pick<IncomingMessage, "headers">): boolean {
  if (request.headers["sec-fetch-site"] === "cross-site") return false
  const origin = request.headers.origin
  if (origin === undefined || origin === "null") return true
  try {
    const url = new URL(origin)
    if (url.protocol === "file:") return true
    return url.host === request.headers.host || LOOPBACK_HOSTS.has(url.hostname)
  } catch {
    return false
  }
}
