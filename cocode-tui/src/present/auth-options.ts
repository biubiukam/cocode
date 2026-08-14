/** Fork choices on the first-run panel. */

export const GATE_OPTIONS = ['byok', 'cocode'] as const

export type GateOption = (typeof GATE_OPTIONS)[number]

export function cycleGateOption(current: number, delta: number): number {
  const count = GATE_OPTIONS.length
  return (((current + delta) % count) + count) % count
}
