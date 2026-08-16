import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canReuseOlderSupervisor,
  canonicalizeScope,
  hostKey,
  isHostDescriptorCompatible,
  stableJson,
} from '../lib/index.js'

const scope = {
  dshHome: '/tmp/cocode-dsh',
  profile: 'web',
  hostConfigFingerprint: 'cocode-web-jsonrpc-v1',
  runtimeChannel: 'stable',
}

function descriptor(overrides = {}) {
  return {
    schemaVersion: 1,
    hostKey: hostKey(scope),
    supervisorProtocolRevision: '1.0',
    hostPid: 123,
    supervisorPid: 456,
    dshHome: scope.dshHome,
    profile: scope.profile,
    runtimeVersion: '0.1.0-rc.6',
    hostProtocolRevision: '1.0',
    hostConfigFingerprint: scope.hostConfigFingerprint,
    services: [
      { service: 'web', transport: 'tcp', endpoint: 'http://127.0.0.1:3080', protocolRevision: '1.0' },
      { service: 'jsonrpc', transport: 'unix', endpoint: '/tmp/cocode-jsonrpc.sock', protocolRevision: '1.0' },
    ],
    capabilities: ['web', 'jsonrpc', 'session'],
    startedAt: '2026-08-15T00:00:00.000Z',
    ...overrides,
  }
}

test('canonicalizeScope normalizes paths, defaults, and channels', () => {
  assert.deepEqual(canonicalizeScope({
    dshHome: ' /tmp/cocode-dsh/../cocode-dsh ',
    profile: '  ',
    hostConfigFingerprint: '  ',
    runtimeChannel: 'unknown',
  }), {
    dshHome: '/tmp/cocode-dsh',
    profile: 'web',
    hostConfigFingerprint: 'default',
    runtimeChannel: 'stable',
  })
})

test('canonicalizeScope follows the official empty DSH_HOME fallback', () => {
  assert.equal(canonicalizeScope({
    dshHome: '',
    profile: 'web',
    hostConfigFingerprint: 'fingerprint',
    runtimeChannel: 'stable',
  }).dshHome.endsWith('/.dsh'), true)
})

test('hostKey is stable for equivalent scopes', () => {
  assert.equal(hostKey(scope), hostKey({ ...scope, dshHome: '/tmp/./cocode-dsh' }))
  assert.notEqual(hostKey(scope), hostKey({ ...scope, profile: 'preview' }))
})

test('stableJson sorts object keys recursively', () => {
  assert.equal(stableJson({ b: { d: 2, c: 1 }, a: [3, { z: true, y: null }] }), '{"a":[3,{"y":null,"z":true}],"b":{"c":1,"d":2}}')
  assert.equal(stableJson(undefined), 'undefined')
})

test('descriptor compatibility accepts required services and capabilities', () => {
  assert.equal(isHostDescriptorCompatible(descriptor(), scope, {
    requiredServices: ['web', 'jsonrpc'],
    requiredCapabilities: ['session'],
    minProtocolRevision: '1.0',
  }), true)
})

test('descriptor compatibility rejects mismatched scope, protocol, service, and capability', () => {
  const request = {
    requiredServices: ['web', 'jsonrpc'],
    requiredCapabilities: ['session'],
    minProtocolRevision: '1.0',
  }
  assert.equal(isHostDescriptorCompatible(descriptor({ dshHome: '/tmp/other' }), scope, request), false)
  assert.equal(isHostDescriptorCompatible(descriptor({ hostProtocolRevision: '2.0' }), scope, request), false)
  assert.equal(isHostDescriptorCompatible(descriptor({ services: [{ service: 'web', transport: 'tcp', endpoint: 'http://127.0.0.1:3080', protocolRevision: '1.0' }] }), scope, request), false)
  assert.equal(isHostDescriptorCompatible(descriptor({ capabilities: ['web', 'jsonrpc'] }), scope, request), false)
})

test('older supervisor can be reused for an active compatible host', () => {
  assert.equal(
    canReuseOlderSupervisor(
      {
        scope,
        clientKind: 'standalone-tui',
        requiredServices: ['jsonrpc'],
        minProtocolRevision: '1.0',
      },
      { leaseCount: 1, descriptor: descriptor() },
    ),
    true,
  )
  assert.equal(
    canReuseOlderSupervisor(
      {
        scope,
        clientKind: 'standalone-tui',
        requiredServices: ['jsonrpc'],
        minProtocolRevision: '1.0',
        runtimeEnv: { COCODE_LLM_PROVIDERS: '{"cocode-cloud":{}}' },
      },
      { leaseCount: 1, descriptor: descriptor() },
    ),
    true,
  )
})
