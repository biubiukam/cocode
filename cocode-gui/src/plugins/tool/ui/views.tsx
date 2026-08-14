import { ContentBlocks } from '../../../views/content-blocks.tsx'
import { CodeView } from '../../../views/code-view.tsx'
import { DiffView } from '../../../views/diff-view.tsx'
import type { ToolNode } from '../../../runtime/index.ts'

export type ToolViewOwner = { node: ToolNode }

export function DiffToolView({ node }: ToolViewOwner) {
  const result = node.resultView
  const call = node.callView
  const diffs = result?.card === 'diff' ? result.diffs : call?.card === 'diff' ? call.diffs : []
  return <div className="flex flex-col gap-2">{diffs.map(diff => <DiffView key={diff.path} diff={diff} />)}</div>
}

export function TerminalToolView({ node }: ToolViewOwner) {
  const result = node.resultView
  if (result?.card !== 'terminal') return <CodeView code={node.args === '' ? '{}' : node.args} language="json" />
  return (
    <div>
      {result.output === undefined || result.output === ''
        ? <p className="text-[11px] text-muted-foreground">命令没有输出。</p>
        : <CodeView code={result.output} language="bash" />}
      {result.exitCode === undefined && result.signal === undefined
        ? null
        : (
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              {result.signal === undefined ? `exit ${String(result.exitCode)}` : `signal ${result.signal}`}
            </p>
          )}
    </div>
  )
}

export function ReadToolView({ node }: ToolViewOwner) {
  const result = node.resultView
  if (result?.card !== 'read') return null
  return (
    <CodeView
      code={result.lines.map(line => line.text).join('\n')}
      path={result.path}
      startLine={result.lines[0]?.number ?? 1}
      showLineNumbers
    />
  )
}

export function SearchToolView({ node }: ToolViewOwner) {
  const result = node.resultView
  if (result?.card !== 'search') return null
  return result.shape === 'paths'
    ? <CodeView code={result.paths.join('\n')} language="text" />
    : (
        <div className="flex flex-col gap-2">
          {result.files.map(file => (
            <div key={file.path}>
              <p className="font-mono text-[10px] font-semibold text-accent-ink">{file.path}</p>
              <CodeView code={file.matches.map(match => `${String(match.lineNumber)}: ${match.line}`).join('\n')} language="text" />
            </div>
          ))}
        </div>
      )
}

export function WebToolView({ node }: ToolViewOwner) {
  const result = node.resultView
  if (result?.card !== 'web') return <GenericToolView node={node} />
  return result.content === undefined ? <GenericToolView node={node} /> : <ContentBlocks blocks={result.content} />
}

export function GenericToolView({ node }: ToolViewOwner) {
  const call = node.callView
  const result = node.resultView
  if (result?.card === 'generic' && result.content !== undefined) return <ContentBlocks blocks={result.content} />
  if (node.resultBlocks !== undefined && node.resultBlocks.length > 0) return <ContentBlocks blocks={node.resultBlocks} />
  if (call?.card === 'generic' && call.rawInput !== undefined) {
    return <CodeView code={typeof call.rawInput === 'string' ? call.rawInput : JSON.stringify(call.rawInput, null, 2)} language="json" />
  }
  return <CodeView code={node.args === '' ? '{}' : node.args} language="json" />
}
