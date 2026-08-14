/**
 * Ensures the sibling harness checkout is installed and built before embedded mode starts.
 * Skipped when connect mode is configured via env.
 */

import { ensureHarness, isConnectMode } from './harness-dev.mjs'

export { ensureHarness, isConnectMode }

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  ensureHarness()
}
