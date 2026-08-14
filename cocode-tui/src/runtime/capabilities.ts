/**
 * P0 wire capabilities. Flip a bit only when connection grows a method.
 */

export type TuiCapabilities = {
  cancel: boolean;
  approval: boolean;
  promptMode: boolean;
  rewind: boolean;
  sessionList: "none" | "jsonl" | "rpc";
  skills: boolean;
};

export const P0_CAPABILITIES: TuiCapabilities = {
  cancel: false,
  approval: false,
  promptMode: false,
  rewind: false,
  sessionList: "none",
  skills: false,
};
