/** Pure state transitions for the workspace skill picker. */

import type { SkillEntry } from '@cocode/tui-connection'

export type SkillsPickerState = {
  skills: readonly SkillEntry[]
  query: string
  selected: number
  open: boolean
}

export const SKILLS_WINDOW_SIZE = 8

export function createSkillsPicker(skills: readonly SkillEntry[]): SkillsPickerState {
  return { skills: [...skills], query: '', selected: 0, open: true }
}

export function setSkillsQuery(state: SkillsPickerState, query: string): SkillsPickerState {
  return { ...state, query, selected: 0 }
}

export function moveSkillsSelection(state: SkillsPickerState, delta: number): SkillsPickerState {
  const visible = visibleSkills(state)
  if (visible.length === 0) return { ...state, selected: 0 }
  const selected = (((state.selected + delta) % visible.length) + visible.length) % visible.length
  return { ...state, selected }
}

export function selectedSkill(state: SkillsPickerState): SkillEntry | undefined {
  return visibleSkills(state)[state.selected]
}

export function closeSkillsPicker(state: SkillsPickerState): SkillsPickerState {
  return { ...state, open: false }
}

export function visibleSkills(state: SkillsPickerState): SkillEntry[] {
  const query = state.query.trim().toLocaleLowerCase()
  if (query === '') return [...state.skills]
  return state.skills.filter((skill) =>
    `${skill.name} ${skill.description} ${skill.whenToUse ?? ''}`
      .toLocaleLowerCase()
      .includes(query),
  )
}
