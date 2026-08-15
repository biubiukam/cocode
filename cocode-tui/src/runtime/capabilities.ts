/**
 * P0 wire capabilities. Flip a bit only when connection grows a method.
 */

export type TuiCapabilities = {
  cancel: boolean
  open: boolean
  fork: boolean
  approval: boolean
  promptMode: boolean
  rewind: boolean
  sessionList: 'none' | 'jsonl' | 'rpc'
  skills: boolean
}

export const P0_CAPABILITIES: TuiCapabilities = {
  cancel: true,
  open: true,
  fork: true,
  approval: false,
  promptMode: false,
  rewind: true,
  sessionList: 'none',
  skills: false,
}
