import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { addRuntimePluginDependencies, createRuntimePatch, mergeHostRuntimeEnv, prepareRuntimeSlot } from '../lib/index.js'

const runtimeRoot = fileURLToPath(new URL('../../../runtime/', import.meta.url))

test('the shared Host bundle includes the Cocode vision bridge', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../../runtime/plugins.json', import.meta.url), 'utf8'))

  assert.ok(manifest.plugins.includes('cocode-vision'))
  assert.equal(existsSync(`${runtimeRoot}plugins/cocode-vision/lib/index.js`), true)
})

test('the Cocode vision bridge loads in the same pure ESM mode as DSH', () => {
  const runtimeHome = mkdtempSync(join(tmpdir(), 'cocode-runtime-test-'))
  const previousRuntimeHome = process.env.COCODE_HOST_RUNTIME_HOME
  process.env.COCODE_HOST_RUNTIME_HOME = runtimeHome
  try {
    const pluginPath = fileURLToPath(new URL('../lib/host-jsonrpc-plugin.js', import.meta.url))
    const slot = prepareRuntimeSlot({
      dshHome: '/tmp/cocode-test-dsh',
      profile: 'web',
      hostConfigFingerprint: 'test',
      runtimeChannel: 'stable',
    }, '/tmp/cocode-test-jsonrpc.sock', pluginPath)
    const plugin = join(slot.root, 'node_modules', 'cocode-vision', 'lib', 'index.js')
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `await import(${JSON.stringify(plugin)})`], {
      encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
  } finally {
    if (previousRuntimeHome === undefined) delete process.env.COCODE_HOST_RUNTIME_HOME
    else process.env.COCODE_HOST_RUNTIME_HOME = previousRuntimeHome
    rmSync(runtimeHome, { recursive: true, force: true })
  }
})

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

test('mergeHostRuntimeEnv preserves base credentials while overlaying the route', () => {
  const env = mergeHostRuntimeEnv(
    { PATH: '/usr/bin', COCODE_CLOUD_API_KEY: 'ck_live_secret' },
    { COCODE_LLM_PROVIDERS: '{"cocode-cloud":{}}' },
    '/tmp/cocode-home',
  )

  assert.equal(env.DSH_HOME, '/tmp/cocode-home')
  assert.equal(env.COCODE_LLM_PROVIDERS, '{"cocode-cloud":{}}')
  assert.equal(env.COCODE_CLOUD_API_KEY, 'ck_live_secret')
})
