import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { CompanionTransport } from '../../packages/companion/src/transport.ts'

async function nextFrame(output: PassThrough): Promise<Record<string, unknown>> {
  const chunk = await new Promise<string>((resolve) => {
    const onData = (value: Buffer): void => {
      output.off('data', onData)
      resolve(value.toString('utf8'))
    }
    output.on('data', onData)
  })
  return JSON.parse(chunk.trim()) as Record<string, unknown>
}

describe('CompanionTransport', () => {
  it('routes request frames and serializes the result', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const transport = new CompanionTransport(input, output)
    transport.onRequest(async (method, params) => ({ method, params }))
    transport.start()

    input.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"cwd":"/tmp"}}\n')

    await expect(nextFrame(output)).resolves.toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { method: 'initialize', params: { cwd: '/tmp' } },
    })
    transport.close()
  })

  it('emits notifications without an id and ignores malformed input safely', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const transport = new CompanionTransport(input, output)
    transport.start()

    transport.notify('session.status', { sessionId: 's1', status: 'idle' })
    await expect(nextFrame(output)).resolves.toEqual({
      jsonrpc: '2.0',
      method: 'session.status',
      params: { sessionId: 's1', status: 'idle' },
    })

    input.write('{not-json}\n{"jsonrpc":"2.0","method":"ignored"}\n')
    await new Promise((resolve) => setImmediate(resolve))
    expect(output.read()).toBeNull()
    transport.close()
  })

  it('flushes pending output and closes cleanly at EOF', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const transport = new CompanionTransport(input, output)
    transport.start()
    transport.notify('ready')
    await expect(transport.flush()).resolves.toBeUndefined()
    expect(output.read()?.toString('utf8')).toBe('{"jsonrpc":"2.0","method":"ready"}\n')

    input.end()
    await new Promise((resolve) => setImmediate(resolve))
    transport.notify('after-eof')
    expect(output.read()).toBeNull()
  })
})
