/**
 * Cocode GUI entry.
 * Connects to a running harness Host (dsh web) via @cocode/gui-connection.
 */

import type { HarnessHostEndpoint } from '@cocode/gui-connection'

const endpoint: HarnessHostEndpoint = {
  baseUrl: process.env.COCODE_HARNESS_URL ?? 'http://127.0.0.1:3080',
}

console.log(`Cocode GUI scaffold — harness endpoint: ${endpoint.baseUrl}`)
console.log('Start harness first: cd ../cocode-harness && pnpm dsh web')
