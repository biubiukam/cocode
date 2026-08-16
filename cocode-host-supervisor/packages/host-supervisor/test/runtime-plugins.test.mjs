import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertBuiltRuntimePlugin } from '../scripts/runtime-plugins.mjs'

test('rejects a runtime plugin without its host entry', () => {
  const root = mkdtempSync(join(tmpdir(), 'cocode-runtime-plugin-test-'))
  try {
    assert.throws(
      () => assertBuiltRuntimePlugin(root, 'cocode-shortcuts'),
      /Missing built runtime plugin: cocode-shortcuts\/lib\/index\.js\./,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
