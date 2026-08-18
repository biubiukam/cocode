import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { TuiLogger } from '../src/runtime/logging.ts'

test('writes shared TUI JSONL without prompt or credential values', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cocode-tui-log-'))
  try {
    const logger = new TuiLogger({ root, version: 'test' })
    logger.info('tui.start', { mode: 'test', prompt: 'sample prompt', token: 'Bearer test-token' })
    logger.close()
    const content = await readFile(join(root, 'tui', 'current.jsonl'), 'utf8')
    const record = JSON.parse(content) as Record<string, unknown>
    assert.equal(record.source, 'tui')
    assert.equal(record.serviceName, 'cocode-tui')
    assert.equal((record.attributes as Record<string, unknown>).prompt, '[REDACTED]')
    assert.equal((record.attributes as Record<string, unknown>).token, '[REDACTED]')
    assert.ok(!content.includes('sample prompt'))
    assert.ok(!content.includes('test-token'))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
