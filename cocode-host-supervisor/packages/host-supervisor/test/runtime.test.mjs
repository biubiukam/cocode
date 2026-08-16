import test from 'node:test'
import assert from 'node:assert/strict'
import { addRuntimePluginDependencies, createRuntimePatch } from '../lib/index.js'

test('addRuntimePluginDependencies extends the DSH install closure', () => {
  const manifest = addRuntimePluginDependencies(
    {
      name: '@deepseek-ai/dsh',
      dependencies: { existing: '1.0.0' },
    },
    [
      { name: 'cocode-sidebar', version: '0.12.1-cocode.0' },
      { name: 'cocode-account', version: '0.1.0-cocode.0' },
    ],
  )

  assert.deepEqual(manifest.dependencies, {
    existing: '1.0.0',
    'cocode-sidebar': '0.12.1-cocode.0',
    'cocode-account': '0.1.0-cocode.0',
  })
})

test('createRuntimePatch registers Cocode plugins by package name', () => {
  const patch = createRuntimePatch(
    'file:///tmp/cocode-host-jsonrpc-plugin.mjs',
    'http://127.0.0.1:43123',
    [
      { name: 'cocode-sidebar', entry: '/tmp/cocode-sidebar/lib/index.js' },
      { name: 'cocode-account', entry: '/tmp/cocode-account/lib/index.js' },
      { name: 'cocode-shortcuts', entry: '/tmp/cocode-shortcuts/lib/index.js' },
    ],
  )

  assert.match(patch, /id: cocode-sidebar\n      name: "cocode-sidebar"/)
  assert.match(patch, /id: cocode-account\n      name: "cocode-account"/)
  assert.match(patch, /id: cocode-shortcuts\n      name: "cocode-shortcuts"/)
  assert.doesNotMatch(patch, /cocode-plugin-/)
  assert.doesNotMatch(patch, /file:\/\/.*cocode-(sidebar|account|shortcuts)/)
})
