/**
 * Center column: keyed `center.view` slot. Missing keys fall back to conversation.
 */

import { SlotOutlet } from '../../boot/slot-renderer.tsx'
import { useLayout } from '../runtime-context.tsx'

export function CenterContent() {
  const centerView = useLayout(layout => layout.centerView)
  return <SlotOutlet name="center.view" owner={{ entryKey: centerView }} />
}
