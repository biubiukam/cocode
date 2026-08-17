import type {
  MessageTextPoint,
  MessageTextSelection,
} from './message-text-selection.ts'

export type MessageSelectionState = {
  active: boolean
  dragging: boolean
  selectedNodeId: string | null
  selection?: MessageTextSelection
}

export type MessageSelectionAction =
  | { type: 'activateMessage'; selectedNodeId: string; text: string }
  | { type: 'beginDrag'; point: MessageTextPoint }
  | { type: 'moveDrag'; point: MessageTextPoint }
  | { type: 'endDrag' }
  | { type: 'clear' }

export const initialMessageSelectionState: MessageSelectionState = {
  active: false,
  dragging: false,
  selectedNodeId: null,
}

export function reduceMessageSelection(
  state: MessageSelectionState,
  action: MessageSelectionAction,
): MessageSelectionState {
  switch (action.type) {
    case 'activateMessage':
      return {
        active: true,
        dragging: false,
        selectedNodeId: action.selectedNodeId,
        selection: fullMessageSelection(action.selectedNodeId, action.text),
      }
    case 'beginDrag':
      return {
        active: true,
        dragging: true,
        selectedNodeId: action.point.nodeKey,
        selection: { anchor: action.point, focus: action.point },
      }
    case 'moveDrag':
      return state.dragging && state.selection !== undefined
        ? {
            ...state,
            selectedNodeId: action.point.nodeKey,
            selection: { ...state.selection, focus: action.point },
          }
        : state
    case 'endDrag':
      return state.dragging ? { ...state, dragging: false } : state
    case 'clear':
      return initialMessageSelectionState
  }
}

export function fullMessageSelection(nodeKey: string, text: string): MessageTextSelection {
  return {
    anchor: { nodeKey, offset: 0 },
    focus: { nodeKey, offset: text.length },
  }
}
