import type { Readable, Writable } from 'node:stream'
import { CompanionTransport } from './transport.ts'
import { TuiCompanionGateway } from './gateway.ts'
import type { RuntimeContext } from './types.ts'

/** Runtime-only hooks used by tests; production binds stdin/stdout and process.exit. */
export type CompanionConfig = {
  input?: Readable
  output?: Writable
  exit?: (code: number) => void
}

/** Cordis plugin identity. */
export const name = 'cocode-tui-companion'

/** The gateway needs the live agent factory; optional services are read with ctx.get(). */
export const inject = ['agents']

/** Mount the Cocode TUI JSON-RPC gateway as the sole stdio owner. */
export function apply(ctx: RuntimeContext, config: CompanionConfig = {}): void {
  const input = config.input ?? process.stdin
  const output = config.output ?? process.stdout
  const exit =
    config.exit ??
    ((code: number): void => {
      process.exit(code)
    })
  const transport = new CompanionTransport(input, output)
  const gateway = new TuiCompanionGateway(ctx, transport)

  // User-question service may be mounted after this plugin. Cordis re-runs the
  // callback when the optional service appears; the disposer removes our slot.
  ctx.inject?.(['userQuestions'], () => {
    gateway.tryRegisterQuestionProvider()
    return () => gateway.unregisterQuestionProvider()
  })

  let exitTask: Promise<void> | undefined
  const disposeAndExit = (): Promise<void> => {
    exitTask ??= (async () => {
      await transport.flush().catch(() => undefined)
      await ctx.root.fiber.dispose()
      exit(0)
    })()
    return exitTask
  }

  transport.onRequest(async (method, params) => {
    const result = await gateway.handleRequest(method, params)
    if (method === 'shutdown')
      setImmediate(() => {
        void disposeAndExit()
      })
    return result
  })

  ctx.effect?.(() => {
    transport.start()
    return async () => {
      await gateway.shutdown()
      transport.close()
    }
  }, 'cocode-tui-companion.serve')
}

export { CompanionTransport } from './transport.ts'
export { TuiCompanionGateway } from './gateway.ts'
export type * from './types.ts'
