import type { ReactElement, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('ink', () => ({
  Box: 'box',
  Text: 'text',
}))

import { Header } from '../../src/present/components/Header.tsx'

describe('Header', () => {
  it('shows the full workspace path and branch on wide terminals', () => {
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
    expect(rendered).toContain('/tmp/project')
    expect(rendered).toContain('#main')
    expect(rendered).not.toContain('cocode')
  })

  it('keeps the compact workspace name on narrower terminals', () => {
    const tree = Header({
      header: {
        sessionId: 'session-1234',
        cwd: '/tmp/project',
        provider: 'test',
        branch: 'main',
      },
      locale: 'en',
      columns: 80,
    }) as ReactElement

    const rendered = textContent(tree)
    expect(rendered).toContain('project')
    expect(rendered).not.toContain('/tmp/project')
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
