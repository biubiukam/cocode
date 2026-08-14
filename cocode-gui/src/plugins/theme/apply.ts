import type { Context } from '@deepseek-ai/cordis'

export const name = 'theme'

/** Theme wrapping lives in boot so the document has tokens before the first paint. */
export function apply(_ctx: Context) {}
