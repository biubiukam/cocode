import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  HostLogger,
  hostKey,
  resolveCocodeLogRoot,
  resolveCocodeLogLayout,
} from '../lib/index.js'

test('resolves a stable product log root from COCODE_LOG_ROOT', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cocode-observability-'))
  const previous = process.env.COCODE_LOG_ROOT
  process.env.COCODE_LOG_ROOT = root
  try {
    assert.equal(resolveCocodeLogRoot(), root)
    assert.deepEqual(resolveCocodeLogLayout(), {
      root,
      desktopApp: join(root, 'desktop', 'app'),
      desktopAudit: join(root, 'desktop', 'audit'),
      host: join(root, 'host'),
      tui: join(root, 'tui'),
      crashDumps: join(root, 'crashDumps'),
      diagnostics: join(root, 'diagnostics'),
    })
  } finally {
    if (previous === undefined) delete process.env.COCODE_LOG_ROOT
    else process.env.COCODE_LOG_ROOT = previous
    await rm(root, { recursive: true, force: true })
  }
})

test('writes Host Supervisor and DSH Host records into the shared host stream', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cocode-host-log-'))
  const scope = {
    dshHome: '/tmp/cocode-dsh',
    profile: 'web',
    hostConfigFingerprint: 'test-config',
    runtimeChannel: 'stable',
  }
  const previous = process.env.COCODE_LOG_ROOT
  process.env.COCODE_LOG_ROOT = root
  try {
    const logger = new HostLogger({ stateDirectory: join(root, 'state'), scope })
    logger.log('info', 'supervisor.test')
    logger.hostLine('stderr', 'host output')
    logger.hostLine('stdout', 'sample prompt Bearer test-token')
    logger.close()
    assert.equal(logger.logDirectory, join(root, 'host', hostKey(scope)))
    const content = await import('node:fs/promises').then(({ readFile }) => readFile(join(logger.logDirectory, 'current.jsonl'), 'utf8'))
    assert.match(content, /"processType":"supervisor"/)
    assert.match(content, /"processType":"dsh-host"/)
    assert.ok(!content.includes('sample prompt'))
    assert.ok(!content.includes('test-token'))
  } finally {
    if (previous === undefined) delete process.env.COCODE_LOG_ROOT
    else process.env.COCODE_LOG_ROOT = previous
    await rm(root, { recursive: true, force: true })
  }
})
