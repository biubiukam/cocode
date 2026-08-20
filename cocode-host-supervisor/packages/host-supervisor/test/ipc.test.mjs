import test from 'node:test'
import assert from 'node:assert/strict'
import { writeLineFrame } from '../lib/index.js'

test('writes one newline-delimited frame to a writable connection', () => {
  const writes = []
  const output = {
    destroyed: false,
    writable: true,
    write(value) {
      writes.push(value)
      return true
    },
  }

  assert.equal(writeLineFrame(output, { id: 1, result: { ok: true } }), true)
  assert.deepEqual(writes, ['{"id":1,"result":{"ok":true}}\n'])
})

test('does not write to a destroyed connection', () => {
  assert.equal(writeLineFrame({
    destroyed: true,
    writable: false,
    write() {
      throw new Error('must not write')
    },
  }, { id: 2, result: {} }), false)
})

test('turns synchronous connection write failures into a false result', () => {
  assert.equal(writeLineFrame({
    destroyed: false,
    writable: true,
    write() {
      throw new Error('closed between checks')
    },
  }, { id: 3, error: { code: -32000, message: 'failed' } }), false)
})
