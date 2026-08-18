import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TuiLogger } from '../src/runtime/logging.ts'

describe('TuiLogger', () => {
  it('writes shared TUI JSONL without prompt or credential values', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cocode-tui-log-'))
    try {
      const logger = new TuiLogger({ root, version: 'test' })
      logger.info('tui.start', { mode: 'test', prompt: 'sample prompt', token: 'Bearer test-token' })
      logger.close()
      const content = await readFile(join(root, 'tui', 'current.jsonl'), 'utf8')
      const record = JSON.parse(content) as Record<string, unknown>
      expect(record.source).toBe('tui')
      expect(record.serviceName).toBe('cocode-tui')
      expect((record.attributes as Record<string, unknown>).prompt).toBe('[REDACTED]')
      expect((record.attributes as Record<string, unknown>).token).toBe('[REDACTED]')
      expect(content).not.toContain('sample prompt')
      expect(content).not.toContain('test-token')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
