import type { ReactElement, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('ink', () => ({
  Box: 'box',
  Text: 'text',
}))

import { Header } from '../../src/present/components/Header.tsx'

describe('Header', () => {
  it('shows the workspace and branch without redundant product chrome', () => {
    const tree = Header({
      header: {
        sessionId: 'session-1234',
        cwd: '/tmp/project',
        provider: 'test',
        branch: 'main',
      },
      locale: 'en',
      columns: 120,
    }) as ReactElement

    const rendered = textContent(tree)
    expect(rendered).toContain('project')
    expect(rendered).toContain('#main')
    expect(rendered).not.toContain('cocode')
    expect(rendered).not.toContain('/')
  })
})

function textContent(node: ReactNode): string {
  if (Array.isArray(node)) {
    return node.map(textContent).join('')
  } else if (node !== null && typeof node === 'object' && 'type' in node) {
    const element = node as ReactElement
    return textContent(element.props?.children)
  }
  return typeof node === 'string' || typeof node === 'number' ? String(node) : ''
}
