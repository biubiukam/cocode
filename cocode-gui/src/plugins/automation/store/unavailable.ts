import type { RpcError } from '@cocode/gui-connection'

/** Live workflow handle already gone; GUI treats the run as interrupted. */
export function isNotRunning(error: RpcError): boolean {
  return error.code === 'not_running'
    || error.code === 'not-running'
    || /not[_ -]running/i.test(error.message)
}

/** Host refused the method because this deployment does not expose it. */
export function isCapabilityUnavailable(error: RpcError): boolean {
  // The gateway has no route for a method it never mounted, so a carrier 404 is
  // the same statement as `unknown_method`. Read the status the transport put in
  // `details` rather than scraping the message it built from it.
  if (error.details.status === 404) return true
  if (
    error.code === 'capability_unavailable'
    || error.code === 'capability-unavailable'
    || error.code === 'method_not_found'
    || error.code === 'unknown_method'
    || error.code === 'not_implemented'
  ) return true
  return /unknown method|no such method|not (found|implemented)/i.test(error.message)
}
