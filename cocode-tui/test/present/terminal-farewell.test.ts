import { describe, expect, it } from 'vitest'
import { terminalBrandMark } from '../../src/present/terminal-farewell.ts'

describe('terminal farewell', () => {
  it('renders the compact Cocode brand mark with terminal colors', () => {
    const mark = terminalBrandMark()
    const plain = mark.replace(/\u001b\[[0-9;]*m/g, '')

    expect(mark).toContain('\u001b[38;2;')
    expect(plain).toContain('█████')
    expect(plain.split('\n')).toHaveLength(7)
  })
})
