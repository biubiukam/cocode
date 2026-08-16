import { existsSync } from 'node:fs'
import { join } from 'node:path'

export function assertBuiltRuntimePlugin(source, name) {
  const output = join(source, 'lib', 'index.js')
  if (!existsSync(output)) {
    throw new Error(
      `Missing built runtime plugin: ${name}/lib/index.js. Run the Cocode GUI plugin build first.`,
    )
  }
}
