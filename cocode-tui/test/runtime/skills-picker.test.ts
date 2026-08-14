import { describe, expect, it } from 'vitest'
import {
  createSkillsPicker,
  moveSkillsSelection,
  selectedSkill,
  setSkillsQuery,
  visibleSkills,
} from '../../src/runtime/skills-picker.ts'

const skills = [
  { name: 'review', description: 'Review a change' },
  { name: 'commit', description: 'Create a commit', whenToUse: 'after tests pass' },
]

describe('skills picker', () => {
  it('filters by name, description, and routing hint', () => {
    const picker = setSkillsQuery(createSkillsPicker(skills), 'tests')
    expect(visibleSkills(picker).map((skill) => skill.name)).toEqual(['commit'])
  })

  it('wraps selection and returns the visible item', () => {
    const picker = moveSkillsSelection(createSkillsPicker(skills), -1)
    expect(selectedSkill(picker)?.name).toBe('commit')
  })
})
