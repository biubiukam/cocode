import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { resolveCompanionRuntimeLayout } from '../../scripts/companion-layout.mjs'

interface CompanionEntry {
  id?: string
  name?: string
  config?: Record<string, unknown>
}

describe('companion runtime layout', () => {
  it('resolves Harness plugins from the examples workspace package', () => {
    const codeRoot = resolve(process.cwd(), 'runtime-layout-fixture')
    const layout = resolveCompanionRuntimeLayout(
      pathToFileURL(resolve(codeRoot, 'cocode/cocode-tui/scripts/companion-runner.mjs')),
      { COCODE_HARNESS_ROOT: resolve(codeRoot, 'cocode-harness') },
    )

    expect(layout.harnessRoot).toBe(resolve(codeRoot, 'cocode-harness'))
    expect(layout.runnerPath).toBe(
      resolve(codeRoot, 'cocode-harness/packages/examples/jsonrpc-demo/src/runner.ts'),
    )
    expect(layout.configPath).toBe(
      resolve(codeRoot, 'cocode/cocode-tui/companion/cordis.yml'),
    )
    expect(fileURLToPath(layout.moduleBaseUrl)).toBe(
      resolve(codeRoot, 'cocode-harness/examples/package.json'),
    )
  })

  it('passes the examples workspace module base to the Harness runner', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../scripts/companion-runner.mjs', import.meta.url)),
      'utf8',
    )

    expect(source).toContain('runJsonrpcAgent(moduleBaseUrl.href)')
    expect(source).not.toContain('runJsonrpcAgent(pathToFileURL(harnessRoot).href)')
  })

  it('provides the required plan-mode policy section', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../companion/cordis.yml', import.meta.url)),
      'utf8',
    )
    const entries = parse(source, {
      customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: (value: string) => value }],
    }) as CompanionEntry[]
    const planMode = entries.find((entry) => entry.id === 'plan-mode')

    expect(planMode?.name).toBe('@deepseek-ai/dsh-plan-mode')
    expect(planMode?.config?.section).toEqual(expect.stringMatching(/\S/))
  })
})
