/**
 * Single chat layout. Components only see Snapshot + dispatch.
 */

import { Box, Text, useInput, useStdout, useStdin } from 'ink'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { TuiApp, TuiSnapshot } from '../runtime/app.ts'
import { matchKey, type Keymap } from '../runtime/keymap.ts'
import { resolveKeymap } from '../runtime/keymap-config.ts'
import { Composer } from './components/Composer.tsx'
import { ModelSwitchPanel } from './components/ModelSwitchPanel.tsx'
import { ModelPicker } from './components/ModelPicker.tsx'
import { ActionMenu, type ActionMenuItem } from './components/ActionMenu.tsx'
import { FileMenu } from './components/FileMenu.tsx'
import { Header } from './components/Header.tsx'
import { Help } from './components/Help.tsx'
import { HistorySearch } from './components/HistorySearch.tsx'
import { MessageList } from './components/MessageList.tsx'
import { ResumePicker } from './components/ResumePicker.tsx'
import { SessionTreePicker } from './components/SessionTreePicker.tsx'
import { RewindPicker } from './components/RewindPicker.tsx'
import { ForkPicker } from './components/ForkPicker.tsx'
import { QuestionPanel } from './components/QuestionPanel.tsx'
import {
  isPlanReviewQuestion,
  PlanReviewPanel,
  planReviewPanelRows,
} from './components/PlanReviewPanel.tsx'
import { SkillsPicker } from './components/SkillsPicker.tsx'
import { StatusLine } from './components/StatusLine.tsx'
import {
  filterSlashItems,
  isSlashDraft,
  moveSlashSelection,
  SlashMenu,
  type SlashMenuItem,
} from './components/SlashMenu.tsx'
import { theme } from './theme.ts'
import { findFileMentionAtCursor } from '../runtime/file-mentions.ts'
import { searchHistory } from '../runtime/history-search.ts'
import { listWorkspaceEntries, rankFileMatches } from '../runtime/workspace-files.ts'
import { moveMessageSelection, selectableMessageKeys } from './message-selection.ts'
import {
  maxMessageScrollOffset,
  scrollOffsetForMessage,
} from './message-scroll.ts'
import { focusConversationNodes } from '../runtime/focus.ts'
import { text } from '../runtime/ui-locale.ts'
import {
  RESUME_WINDOW_SIZE,
  visibleResumeItems,
} from '../runtime/resume-picker.ts'
import {
  PROMPT_QUEUE_WINDOW_SIZE,
  visiblePromptQueueItems,
} from '../runtime/prompt-queue-picker.ts'
import {
  SESSION_TREE_WINDOW_SIZE,
  visibleSessionTreeItems,
} from '../runtime/session-tree-picker.ts'
import { REWIND_WINDOW_SIZE } from '../runtime/rewind-picker.ts'
import { SKILLS_WINDOW_SIZE, visibleSkills } from '../runtime/skills-picker.ts'
import { MODEL_PICKER_WINDOW_SIZE, visibleModelItems } from '../runtime/model-picker.ts'
import { editDraft } from '../runtime/external-editor.ts'
import { listWindowStart } from './list-window.ts'
import { calculateChatLayout, CHAT_HEADER_ROWS } from './chat-layout.ts'
import { composerHeaderLayout } from './composer-header.ts'
import { Inspector, INSPECTOR_WIDTH } from './components/Inspector.tsx'
import type { InspectorMouseInput } from './inspector-scroll.ts'
import {
  useInspectorResize,
} from './inspector-resize.ts'
import { ReviewPicker } from './components/ReviewPicker.tsx'
import { ApprovalPanel } from './components/ApprovalPanel.tsx'
import { QueuePicker } from './components/QueuePicker.tsx'
import { ChecklistPanel } from './components/ChecklistPanel.tsx'
import {
  ChecklistStrip,
  CHECKLIST_STRIP_MAX_ITEMS,
  checklistStripRows,
} from './components/ChecklistStrip.tsx'
import {
  dispatchComposerTab,
  dispatchHelpInput,
  dispatchKeyCommand,
  dispatchPickerInput,
  moveSelection,
} from './chat-input.ts'
import {
  createMouseDecoder,
  enableMouseTracking,
  isMousePointerEvent,
  isMouseInput,
  layoutRowFromMouseY,
  mouseWheelDelta,
  shouldEnableMouseTracking,
  type TuiMousePointer,
  type TuiMouseEvent,
} from './mouse.ts'
import { nodeKey } from '../runtime/nodes/types.ts'
import { filterSearchItems } from './search.ts'
import { CHECKLIST_WINDOW_SIZE } from '../runtime/checklist.ts'
import {
  actionMenuItemIndexAtRow,
  listItemIndexAtRow,
  composerModelHit,
  popupContains,
} from './mouse-hit.ts'

export function Chat(props: { app: TuiApp; keymap?: Keymap; mouseSupported?: boolean }) {
  const { app } = props
  const [snap, setSnap] = useState<TuiSnapshot>(() => app.snapshot())
  const keymap = useMemo(() => props.keymap ?? resolveKeymap(), [props.keymap])
  const [slashDismissed, setSlashDismissed] = useState(false)
  const [slashIndex, setSlashIndex] = useState(0)
  const [fileDismissed, setFileDismissed] = useState(false)
  const [fileIndex, setFileIndex] = useState(0)
  const [fileItems, setFileItems] = useState<readonly string[]>([])
  const [fileLoading, setFileLoading] = useState(false)
  const [historySearchOpen, setHistorySearchOpen] = useState(false)
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyIndex, setHistoryIndex] = useState(0)
  const [messageSelectionActive, setMessageSelectionActive] = useState(false)
  const [messageScrollOffset, setMessageScrollOffset] = useState(0)
  const [followTranscript, setFollowTranscript] = useState(true)
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null)
  const [expandedMessageIds, setExpandedMessageIds] = useState<ReadonlySet<string>>(() => new Set())
  const [messageActionMenuOpen, setMessageActionMenuOpen] = useState(false)
  const [messageActionIndex, setMessageActionIndex] = useState(0)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [commandPaletteIndex, setCommandPaletteIndex] = useState(0)
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('')
  const [editorBusy, setEditorBusy] = useState(false)
  const [editorError, setEditorError] = useState<string | undefined>()
  const [questionMousePointer, setQuestionMousePointer] = useState<TuiMousePointer>()
  const [approvalMousePointer, setApprovalMousePointer] = useState<TuiMousePointer>()
  const [inspectorMouseInput, setInspectorMouseInput] = useState<InspectorMouseInput>()
  const mouseClickId = useRef(0)
  const { stdout } = useStdout()
  const { isRawModeSupported, setRawMode } = useStdin()
  const slashItems = useMemo<readonly SlashMenuItem[]>(
    () => filterSlashItems(snap.commands, snap.composer.text),
    [snap.commands, snap.composer.text],
  )
  const resumeOpen = snap.resumePicker?.open === true
  const sessionTreeOpen = snap.sessionTreePicker?.open === true
  const queueOpen = snap.queuePicker?.open === true
  const checklistOpen = snap.checklist?.open === true
  const queueItems = snap.queuePicker === undefined ? [] : visiblePromptQueueItems(snap.queuePicker)
  const resumeItems = snap.resumePicker === undefined ? [] : visibleResumeItems(snap.resumePicker)
  const rewindState = snap.rewindPicker
  const rewindOpen = rewindState?.open === true
  const forkState = snap.forkPicker
  const forkOpen = forkState?.open === true
  const skillsState = snap.skillsPicker
  const skillsOpen = skillsState?.open === true
  const modelPickerOpen = snap.modelPicker?.open === true
  const modelInputOpen = snap.modelInputOpen
  const modelOverlayOpen = modelPickerOpen || modelInputOpen
  const questionOpen = snap.question !== undefined
  const approvalOpen = snap.approval?.open === true
  const reviewOpen = snap.reviewPicker?.open === true
  const slashOpen =
    !questionOpen &&
    !approvalOpen &&
    !reviewOpen &&
    !forkOpen &&
    !rewindOpen &&
    !skillsOpen &&
    !resumeOpen &&
    !sessionTreeOpen &&
    !queueOpen &&
    !checklistOpen &&
    !historySearchOpen &&
    !commandPaletteOpen &&
    !messageActionMenuOpen &&
    !modelOverlayOpen &&
    !snap.helpOpen &&
    !slashDismissed &&
    isSlashDraft(snap.composer.text)
  const fileMention = useMemo(
    () => findFileMentionAtCursor(snap.composer.text, snap.composer.cursor),
    [snap.composer.cursor, snap.composer.text],
  )
  const fileVisible =
    !questionOpen &&
    !approvalOpen &&
    !reviewOpen &&
    !forkOpen &&
    !rewindOpen &&
    !skillsOpen &&
    !resumeOpen &&
    !sessionTreeOpen &&
    !queueOpen &&
    !checklistOpen &&
    !historySearchOpen &&
    !commandPaletteOpen &&
    !messageActionMenuOpen &&
    !modelOverlayOpen &&
    !snap.helpOpen &&
    !slashOpen &&
    !fileDismissed &&
    fileMention !== undefined
  const fileOpen = fileVisible && (fileLoading || fileItems.length > 0)
  const historyItems = useMemo(
    () => searchHistory(snap.history, historyQuery, 8),
    [historyQuery, snap.history],
  )
  const displayNodes = useMemo(
    () => focusConversationNodes(snap.nodes, snap.status.focusMode),
    [snap.nodes, snap.status.focusMode],
  )
  const selectedNode = useMemo(
    () => displayNodes.find((node) => nodeKey(node.kind, node.id) === selectedMessageId),
    [displayNodes, selectedMessageId],
  )
  const messageActionItems = useMemo<readonly ActionMenuItem[]>(() => {
    if (selectedNode === undefined) return []
    const key = nodeKey(selectedNode.kind, selectedNode.id)
    const expanded = expandedMessageIds.has(key)
    const items: ActionMenuItem[] = [
      {
        id: 'toggle-expand',
        label: expanded
          ? snap.locale === 'zh' ? '收起详情' : 'Collapse details'
          : snap.locale === 'zh' ? '展开详情' : 'Expand details',
        shortcut: 'enter',
      },
      { id: 'copy', label: snap.locale === 'zh' ? '复制消息' : 'Copy message', shortcut: 'c' },
    ]
    if (snap.capabilities.rewind && selectedNode.kind === 'user') {
      items.push({ id: 'rewind', label: snap.locale === 'zh' ? '从此处回退…' : 'Rewind from message…' })
    }
    if (snap.capabilities.fork && selectedNode.kind === 'user') {
      items.push({ id: 'fork', label: snap.locale === 'zh' ? '从此处创建分支…' : 'Fork from message…' })
    }
    return items
  }, [expandedMessageIds, selectedNode, snap.capabilities.fork, snap.capabilities.rewind, snap.locale])
  const allCommandPaletteItems = useMemo<readonly ActionMenuItem[]>(
    () => snap.commands.map((command) => ({
      id: command.name,
      label: `/${command.name}`,
      description: command.summary,
    })),
    [snap.commands],
  )
  const commandPaletteItems = useMemo(
    () =>
      filterSearchItems(
        allCommandPaletteItems,
        commandPaletteQuery,
        (item) => `${item.label} ${item.description ?? ''}`,
      ),
    [allCommandPaletteItems, commandPaletteQuery],
  )
  const actionMenuItems = commandPaletteOpen ? commandPaletteItems : messageActionItems
  const mainChecklistRows = checklistStripRows(
    snap.status.todos.length,
    stdout.columns >= 120 ? CHECKLIST_STRIP_MAX_ITEMS : 2,
  )
  const wideInspector = stdout.columns >= 120
  const inspectorResize = useInspectorResize({
    terminalColumns: stdout.columns,
    visible: wideInspector,
    defaultWidth: INSPECTOR_WIDTH,
  })
  const inspectorLayout = inspectorResize.layout
  const mainColumns = wideInspector ? inspectorLayout.mainColumns : stdout.columns
  const layout = calculateChatLayout({
    viewportRows: stdout.rows,
    composerLines: snap.composer.text.split('\n').length,
    hasAttachments: snap.composer.attachments.length > 0,
    hasNotice: snap.notice !== undefined,
    hasStatusDetails: hasStatusDetails(snap.status),
    checklistStripRows: mainChecklistRows,
    editorFeedbackRows: Number(editorBusy) + Number(editorError !== undefined),
    helpLines: snap.helpOpen ? snap.helpText.split('\n').length : undefined,
    slashItems: slashOpen ? slashItems.length : undefined,
    fileItems: fileOpen ? fileItems.length : undefined,
    fileLoading: fileOpen && fileLoading,
    historyMatches: historySearchOpen ? historyItems.length : undefined,
    resumeItems: queueOpen
      ? queueItems.length
      : sessionTreeOpen
      ? snap.sessionTreePicker === undefined
        ? 0
        : snap.sessionTreePicker.items.length
      : resumeOpen
      ? resumeItems.length
      : undefined,
    resumeSelected: queueOpen
      ? snap.queuePicker?.selected
      : sessionTreeOpen
      ? snap.sessionTreePicker?.selected
      : resumeOpen
      ? snap.resumePicker?.selected
      : undefined,
    checklistItems: checklistOpen ? snap.status.todos.length : undefined,
    checklistSelected: checklistOpen ? snap.checklist?.selected : undefined,
    rewindItems: rewindOpen
      ? rewindState.items.length
      : forkOpen
      ? forkState.items.length
      : undefined,
    rewindSelected: rewindOpen ? rewindState.selected : forkOpen ? forkState.selected : undefined,
    rewindConfirming: rewindOpen
      ? rewindState.confirming
      : forkOpen
      ? forkState.confirming
      : undefined,
    skillsItems: skillsOpen ? skillsState.skills.length : undefined,
    skillsSelected: skillsOpen ? skillsState.selected : undefined,
      questionRows:
        snap.question === undefined
          ? undefined
        : isPlanReviewQuestion(snap.question.question)
        ? planReviewPanelRows(snap.question, mainColumns)
        : questionPanelRows(snap.question),
    approvalRows: approvalOpen ? 12 : undefined,
    reviewRows: reviewOpen ? reviewRowsFor(snap.reviewPicker) : undefined,
    actionMenuItems: commandPaletteOpen ? 0 : actionMenuItems.length > 0 ? actionMenuItems.length : undefined,
    actionMenuQuery: commandPaletteOpen,
    modelSwitchRows: modelPickerOpen ? 14 : modelInputOpen ? 6 : undefined,
  })
  const messageMaxRows = layout.messageRows
  const statusRows = 2 + Number(snap.notice !== undefined) + Number(hasStatusDetails(snap.status))
  const editorRows = Number(editorBusy) + Number(editorError !== undefined)
  const contentOverlayStartRow =
    CHAT_HEADER_ROWS + 1 + messageMaxRows + mainChecklistRows + statusRows + editorRows
  const messageContentColumns = Math.max(1, mainColumns - (messageSelectionActive ? 2 : 0))
  const composerHeader = composerHeaderLayout({
    composer: snap.composer,
    agent: snap.agent,
    planMode: snap.status.planMode,
    planModeAvailable: snap.capabilities.planMode,
    locale: snap.locale,
    provider: snap.header.provider,
    model: snap.header.model,
    columns: mainColumns,
  })
  const composerTitleRow = contentOverlayStartRow + layout.overlayRows + 1
  const popupBounds = {
    startRow: contentOverlayStartRow,
    startColumn: 1,
    rows: layout.overlayRows,
    columns: mainColumns,
  }
  const popupStartRow = popupBounds.startRow
  const mouseTrackingActive = shouldEnableMouseTracking({
    supported: props.mouseSupported !== false,
    manualMode: false,
    overlayOpen: wideInspector,
  })
  const selectableMessages = useMemo(
    () => selectableMessageKeys(displayNodes),
    [displayNodes],
  )
  const messageScrollMax = useMemo(
    () =>
      maxMessageScrollOffset(
        displayNodes,
        messageMaxRows,
        snap.verbose,
        expandedMessageIds,
        messageContentColumns,
      ),
    [displayNodes, expandedMessageIds, messageContentColumns, messageMaxRows, snap.verbose],
  )
  useEffect(
    () =>
      app.subscribe(() => {
        setSnap(app.snapshot())
      }),
    [app],
  )

  useEffect(() => {
    if (followTranscript) setMessageScrollOffset(0)
  }, [followTranscript, messageMaxRows, snap.nodes.length, expandedMessageIds.size])

  const openCommandPalette = (): void => {
    setCommandPaletteOpen(true)
    setCommandPaletteIndex(0)
    setCommandPaletteQuery('')
    setMessageActionMenuOpen(false)
  }

  const openModelSwitch = (): void => {
    if (snap.composer.disabled) return
    app.dispatch({ type: 'model.open' })
    setCommandPaletteOpen(false)
    setMessageActionMenuOpen(false)
  }

  const runMessageAction = (item: ActionMenuItem | undefined): void => {
    if (item?.id === 'toggle-expand' && selectedMessageId !== null) {
      setExpandedMessageIds((current) => {
        const next = new Set(current)
        if (next.has(selectedMessageId)) next.delete(selectedMessageId)
        else next.add(selectedMessageId)
        return next
      })
    } else if (item?.id === 'copy' && selectedMessageId !== null) {
      app.dispatch({ type: 'copyNode', nodeKey: selectedMessageId })
    } else if (item?.id === 'rewind') {
      app.dispatch({ type: 'rewind.open' })
    } else if (item?.id === 'fork') {
      app.dispatch({ type: 'fork.open' })
    }
    setMessageActionMenuOpen(false)
  }

  const handleMouseEvent = (event: TuiMouseEvent): void => {
    if (inspectorResize.handleMouseEvent(event)) return
    const insideInspector = wideInspector && event.x >= inspectorLayout.startColumn
    if (insideInspector) {
      if (
        event.button === 'wheel-up' ||
        event.button === 'wheel-down' ||
        (event.action === 'press' && event.button === 0)
      ) {
        setInspectorMouseInput({ id: mouseClickId.current++, event })
      }
      return
    }
    const wheelDelta = mouseWheelDelta(event)
    if (wheelDelta !== undefined) {
      if (
        layout.tooSmall ||
        commandPaletteOpen ||
        messageActionMenuOpen ||
        questionOpen ||
        approvalOpen ||
        reviewOpen ||
        rewindOpen ||
        forkOpen ||
        skillsOpen ||
        resumeOpen ||
        sessionTreeOpen ||
        queueOpen ||
        checklistOpen ||
        historySearchOpen ||
        modelOverlayOpen ||
        messageSelectionActive ||
        snap.composer.disabled
      ) {
        return
      }
      const wheelRows = Math.max(1, Math.floor(messageMaxRows / 3))
      setMessageScrollOffset((offset) =>
        Math.max(0, Math.min(messageScrollMax, offset + wheelDelta * wheelRows)),
      )
      setFollowTranscript(wheelDelta < 0 && messageScrollOffset <= wheelRows)
      return
    }
    const pointerRow = layoutRowFromMouseY(event.y)
    const insidePopup = popupContains(popupBounds, event.x, pointerRow)
    const hitRow = insidePopup ? pointerRow : -1
    if (modelPickerOpen && snap.modelPicker !== undefined) {
      if (!insidePopup || event.button !== 0) return
      const items = visibleModelItems(snap.modelPicker)
      const windowSize = pickerWindowSize(layout.overlayRows, MODEL_PICKER_WINDOW_SIZE, 7)
      const start = listWindowStart(snap.modelPicker.selected, items.length, windowSize)
      const index = listItemIndexAtRow({
        row: hitRow,
        itemStartRow: popupStartRow + 3 + Number(start > 0),
        itemCount: items.length,
        selectedIndex: snap.modelPicker.selected,
        windowSize,
      })
      if (index !== undefined) {
        app.dispatch({ type: 'model.move', delta: index - snap.modelPicker.selected })
        if (event.action === 'press') app.dispatch({ type: 'model.confirm' })
      }
      return
    }
    if (modelOverlayOpen) return
    if (questionOpen || approvalOpen) {
      if (isMousePointerEvent(event)) {
        const pointer = { id: mouseClickId.current++, row: hitRow, action: event.action }
        if (questionOpen) setQuestionMousePointer(pointer)
        else setApprovalMousePointer(pointer)
      }
      return
    }
    if (
      (event.action !== 'press' && event.action !== 'move') ||
      event.button !== 0 ||
      layout.tooSmall
    ) return
    const isPress = event.action === 'press'
    const headerRows = CHAT_HEADER_ROWS
    const messageStart = headerRows + 1
    if (commandPaletteOpen) {
      const index = actionMenuItemIndexAtRow({
        row: hitRow,
        menuStartRow: popupStartRow,
        itemCount: commandPaletteItems.length,
        selectedIndex: commandPaletteIndex,
        maxRows: layout.overlayRows,
        query: true,
      })
      if (index !== undefined) {
        if (isPress) {
          const item = commandPaletteItems[index]
          if (item !== undefined) app.dispatch({ type: 'command', line: `/${item.id}` })
          setCommandPaletteOpen(false)
        } else {
          setCommandPaletteIndex(index)
        }
      }
      return
    }
    if (messageActionMenuOpen) {
      const index = actionMenuItemIndexAtRow({
        row: hitRow,
        menuStartRow: popupStartRow,
        itemCount: messageActionItems.length,
        selectedIndex: messageActionIndex,
        maxRows: layout.overlayRows,
      })
      if (index !== undefined) {
        if (isPress) runMessageAction(messageActionItems[index])
        else setMessageActionIndex(index)
      } else if (isPress && (event.y < popupStartRow || event.y > popupStartRow + layout.overlayRows)) {
        setMessageActionMenuOpen(false)
      }
      return
    }
    if (slashOpen) {
      const index = listItemIndexAtRow({
        row: hitRow,
        itemStartRow: popupStartRow + 4,
        itemCount: slashItems.length,
        selectedIndex: slashIndex,
        windowSize: overlayWindowSize(layout.overlayRows, slashItems.length, 4),
      })
      const item = index === undefined ? undefined : slashItems[index]
      if (index !== undefined && isPress && item !== undefined) {
        app.dispatch({ type: 'command', line: `/${item.name}` })
      } else if (index !== undefined) {
        setSlashIndex(index)
      }
      return
    }
    if (fileOpen && fileMention !== undefined) {
      const loadingRows = fileLoading ? 1 : 0
      const index = listItemIndexAtRow({
        row: hitRow,
        itemStartRow: popupStartRow + 3 + loadingRows,
        itemCount: fileItems.length,
        selectedIndex: fileIndex,
        windowSize: overlayWindowSize(layout.overlayRows, fileItems.length, 4 + loadingRows),
      })
      const item = index === undefined ? undefined : fileItems[index]
      if (item !== undefined && isPress) {
        app.dispatch({
          type: 'attachFile',
          start: fileMention.start,
          end: fileMention.end,
          path: item,
        })
      } else if (index !== undefined) setFileIndex(index)
      return
    }
    if (historySearchOpen) {
      const index = listItemIndexAtRow({
        row: hitRow,
        itemStartRow: popupStartRow + 4,
        itemCount: historyItems.length,
        selectedIndex: historyIndex,
        windowSize: overlayWindowSize(layout.overlayRows, historyItems.length, 5),
      })
      const item = index === undefined ? undefined : historyItems[index]
      if (item !== undefined && isPress) {
        app.dispatch({ type: 'setDraft', text: item })
        setHistorySearchOpen(false)
        setHistoryQuery('')
        setHistoryIndex(0)
      } else if (index !== undefined) setHistoryIndex(index)
      return
    }
    if (resumeOpen && snap.resumePicker !== undefined) {
      const items = resumeItems
      const windowSize = pickerWindowSize(layout.overlayRows, RESUME_WINDOW_SIZE)
      const start = listWindowStart(snap.resumePicker.selected, items.length, windowSize)
      const index = listItemIndexAtRow({
        row: hitRow,
        itemStartRow: popupStartRow + 4 + Number(start > 0),
        itemCount: items.length,
        selectedIndex: snap.resumePicker.selected,
        windowSize,
      })
      if (index !== undefined) {
        app.dispatch({ type: 'resume.move', delta: index - snap.resumePicker.selected })
        if (isPress) app.dispatch({ type: 'resume.confirm' })
      }
      return
    }
    if (sessionTreeOpen && snap.sessionTreePicker !== undefined) {
      const items = visibleSessionTreeItems(snap.sessionTreePicker)
      const windowSize = pickerWindowSize(layout.overlayRows, SESSION_TREE_WINDOW_SIZE)
      const start = listWindowStart(snap.sessionTreePicker.selected, items.length, windowSize)
      const index = listItemIndexAtRow({
        row: hitRow,
        itemStartRow: popupStartRow + 4 + Number(start > 0),
        itemCount: items.length,
        selectedIndex: snap.sessionTreePicker.selected,
        windowSize,
      })
      if (index !== undefined) {
        app.dispatch({ type: 'sessionTree.move', delta: index - snap.sessionTreePicker.selected })
        if (isPress) app.dispatch({ type: 'sessionTree.confirm' })
      }
      return
    }
    if (queueOpen && snap.queuePicker !== undefined) {
      const items = queueItems
      const windowSize = pickerWindowSize(layout.overlayRows, PROMPT_QUEUE_WINDOW_SIZE)
      const start = listWindowStart(snap.queuePicker.selected, items.length, windowSize)
      const index = listItemIndexAtRow({
        row: hitRow,
        itemStartRow: popupStartRow + 4 + Number(start > 0),
        itemCount: items.length,
        selectedIndex: snap.queuePicker.selected,
        windowSize,
      })
      if (index !== undefined) {
        app.dispatch({ type: 'queue.move', delta: index - snap.queuePicker.selected })
        if (isPress) app.dispatch({ type: 'queue.restore' })
      }
      return
    }
    if (checklistOpen && snap.checklist !== undefined) {
      const windowSize = pickerWindowSize(
        layout.overlayRows,
        CHECKLIST_WINDOW_SIZE,
        4,
      )
      const start = listWindowStart(
        snap.checklist.selected,
        snap.status.todos.length,
        windowSize,
      )
      const index = listItemIndexAtRow({
        row: hitRow,
        itemStartRow: popupStartRow + 3 + Number(start > 0),
        itemCount: snap.status.todos.length,
        selectedIndex: snap.checklist.selected,
        windowSize,
      })
      if (index !== undefined) {
        app.dispatch({ type: 'checklist.move', delta: index - snap.checklist.selected })
      }
      return
    }
    if (skillsOpen && skillsState !== undefined) {
      const items = visibleSkills(skillsState)
      const windowSize = pickerWindowSize(layout.overlayRows, SKILLS_WINDOW_SIZE)
      const start = listWindowStart(skillsState.selected, items.length, windowSize)
      const index = listItemIndexAtRow({
        row: hitRow,
        itemStartRow: popupStartRow + 4 + Number(start > 0),
        itemCount: items.length,
        selectedIndex: skillsState.selected,
        windowSize,
      })
      if (index !== undefined) {
        app.dispatch({ type: 'skills.move', delta: index - skillsState.selected })
        if (isPress) app.dispatch({ type: 'skills.confirm' })
      }
      return
    }
    if (rewindOpen && rewindState !== undefined) {
      const windowSize = pickerWindowSize(layout.overlayRows, REWIND_WINDOW_SIZE, 6)
      const start = listWindowStart(rewindState.selected, rewindState.items.length, windowSize)
      const index = listItemIndexAtRow({
        row: hitRow,
        itemStartRow: popupStartRow + 3 + Number(rewindState.confirming) + Number(start > 0),
        itemCount: rewindState.items.length,
        selectedIndex: rewindState.selected,
        windowSize,
      })
      if (index !== undefined) {
        if (index !== rewindState.selected && !rewindState.confirming) {
          app.dispatch({ type: 'rewind.move', delta: index - rewindState.selected })
        } else if (isPress) {
          app.dispatch({ type: 'rewind.confirm' })
        }
      }
      return
    }
    if (forkOpen && forkState !== undefined) {
      const windowSize = pickerWindowSize(layout.overlayRows, REWIND_WINDOW_SIZE, 6)
      const start = listWindowStart(forkState.selected, forkState.items.length, windowSize)
      const index = listItemIndexAtRow({
        row: hitRow,
        itemStartRow: popupStartRow + 3 + Number(forkState.confirming) + Number(start > 0),
        itemCount: forkState.items.length,
        selectedIndex: forkState.selected,
        windowSize,
      })
      if (index !== undefined) {
        if (index !== forkState.selected && !forkState.confirming) {
          app.dispatch({ type: 'fork.move', delta: index - forkState.selected })
        } else if (isPress) {
          app.dispatch({ type: 'fork.confirm' })
        }
      }
      return
    }
    if (reviewOpen && snap.reviewPicker !== undefined) {
      if (snap.reviewPicker.phase === 'scope') {
        const index = listItemIndexAtRow({
          row: hitRow,
          itemStartRow: popupStartRow + 3,
          itemCount: snap.reviewPicker.scopes.length,
          selectedIndex: snap.reviewPicker.selected,
          windowSize: snap.reviewPicker.scopes.length,
        })
        if (index !== undefined) {
          app.dispatch({ type: 'review.move', delta: index - snap.reviewPicker.selected })
          if (isPress) app.dispatch({ type: 'review.confirm' })
        }
      } else if (isPress && insidePopup && snap.reviewPicker.phase === 'preview' && event.y >= popupStartRow + layout.overlayRows - 2) {
        app.dispatch({ type: 'review.confirm' })
      }
      return
    }
    if (!isPress) return
    if (
      composerModelHit({
        row: event.y,
        x: event.x,
        titleRow: composerTitleRow,
        modelStartColumn: composerHeader.modelStartColumn,
        modelEndColumn: composerHeader.modelEndColumn,
      })
    ) {
      openModelSwitch()
      return
    }
    if (
      event.y <= headerRows ||
      (event.y >= messageStart + messageMaxRows && event.y < contentOverlayStartRow)
    ) {
      openCommandPalette()
      return
    }
  }

  useEffect(() => {
    if (!mouseTrackingActive) return
    return enableMouseTracking(process.stdout)
  }, [mouseTrackingActive])

  useEffect(() => {
    if (!mouseTrackingActive) return
    const decoder = createMouseDecoder(handleMouseEvent)
    const onData = (chunk: Buffer | string): void => decoder.feed(String(chunk))
    process.stdin.on('data', onData)
    return () => {
      process.stdin.off('data', onData)
      decoder.reset()
    }
  }, [mouseTrackingActive, handleMouseEvent])

  useEffect(() => {
    setMessageScrollOffset((offset) => Math.min(offset, messageScrollMax))
  }, [messageScrollMax])

  useEffect(() => {
    setMessageScrollOffset(0)
  }, [snap.header.sessionId])

  useEffect(() => {
    setSlashDismissed(false)
    setSlashIndex(0)
    setFileDismissed(false)
    setFileIndex(0)
  }, [snap.composer.text])

  useEffect(() => {
    if (!messageSelectionActive) return
    if (selectableMessages.length === 0) {
      setSelectedMessageId(null)
      return
    }
    if (selectedMessageId === null || !selectableMessages.includes(selectedMessageId)) {
      setSelectedMessageId(selectableMessages[selectableMessages.length - 1] ?? null)
    }
  }, [messageSelectionActive, selectableMessages, selectedMessageId])

  useEffect(() => {
    if (!fileVisible || fileMention === undefined) {
      setFileItems([])
      setFileLoading(false)
      return
    }
    let active = true
    setFileLoading(true)
    void listWorkspaceEntries({ cwd: snap.header.cwd })
      .then((files) => {
        if (!active) return
        setFileItems(rankFileMatches(files, fileMention.query, 8))
      })
      .catch(() => {
        if (active) setFileItems([])
      })
      .finally(() => {
        if (active) setFileLoading(false)
      })
    return () => {
      active = false
    }
  }, [fileMention, fileVisible, snap.header.cwd])

  function openExternalEditor(): void {
    if (!isRawModeSupported) {
      setEditorError(text(snap.locale, 'editorUnavailable'))
      return
    }
    setEditorBusy(true)
    setEditorError(undefined)
    try {
      setRawMode(false)
    } catch {
      setEditorBusy(false)
      setEditorError(text(snap.locale, 'editorUnavailable'))
      return
    }
    void editDraft({ text: snap.composer.text })
      .then((edited) => {
        app.dispatch({ type: 'setDraft', text: edited })
      })
      .catch((error: unknown) => {
        setEditorError(error instanceof Error ? error.message : String(error))
      })
      .finally(() => {
        try {
          setRawMode(true)
        } catch {
          // The terminal may already be closing.
        }
        setEditorBusy(false)
      })
  }

  useInput((input, key) => {
    if (editorBusy) return
    if (isMouseInput(input)) return
    if (modelPickerOpen) {
      if (key.escape) {
        app.dispatch({ type: 'model.close' })
        return
      }
      if (key.upArrow || key.downArrow) {
        app.dispatch({ type: 'model.move', delta: key.upArrow ? -1 : 1 })
        return
      }
      if (key.return) {
        app.dispatch({ type: 'model.confirm' })
        return
      }
      if (key.backspace || key.delete) {
        app.dispatch({ type: 'model.setQuery', query: snap.modelPicker?.query.slice(0, -1) ?? '' })
        return
      }
      if (input !== '' && !key.ctrl && !key.meta) {
        app.dispatch({ type: 'model.setQuery', query: `${snap.modelPicker?.query ?? ''}${input}` })
      }
      return
    }
    if (modelInputOpen) return
    if (snap.helpOpen) {
      dispatchHelpInput(app, input, key)
      return
    }
    if (approvalOpen) return
    if (questionOpen) return
    if (reviewOpen) {
      dispatchPickerInput(app, 'review', key, false)
      return
    }
    if (commandPaletteOpen) {
      if (key.escape) {
        setCommandPaletteOpen(false)
        return
      }
      if (key.backspace || key.delete) {
        setCommandPaletteQuery((query) => query.slice(0, -1))
        setCommandPaletteIndex(0)
        return
      }
      if (key.upArrow || key.downArrow) {
        setCommandPaletteIndex((index) => moveSelection(index, key.upArrow ? -1 : 1, commandPaletteItems.length))
        return
      }
      if (key.return) {
        const item = commandPaletteItems[moveSelection(commandPaletteIndex, 0, commandPaletteItems.length)]
        if (item !== undefined) app.dispatch({ type: 'command', line: `/${item.id}` })
        setCommandPaletteOpen(false)
        return
      }
      if (input !== '' && !key.ctrl && !key.meta && !key.shift) {
        setCommandPaletteQuery((query) => `${query}${input}`)
        setCommandPaletteIndex(0)
      }
      return
    }
    const scrollUp = key.pageUp || (key.ctrl && key.upArrow)
    const scrollDown = key.pageDown || (key.ctrl && key.downArrow)
    const endKey = input === '\u001b[F' || input === '\u001b[4~'
    if (key.ctrl && endKey && !layout.tooSmall && !snap.composer.disabled) {
      setMessageScrollOffset(0)
      setFollowTranscript(true)
      return
    }
    if (
      (scrollUp || scrollDown) &&
      !layout.tooSmall &&
      !snap.composer.disabled &&
      !rewindOpen &&
      !forkOpen &&
      !skillsOpen &&
      !resumeOpen &&
      !sessionTreeOpen &&
      !queueOpen &&
      !checklistOpen &&
      !historySearchOpen &&
      !messageSelectionActive &&
      !slashOpen &&
      !fileOpen &&
      !snap.helpOpen
    ) {
      const pageRows = Math.max(1, Math.floor(messageMaxRows / 2))
      const delta = scrollUp ? pageRows : -pageRows
      setMessageScrollOffset((offset) =>
        Math.max(0, Math.min(messageScrollMax, offset + delta)),
      )
      setFollowTranscript(scrollDown && messageScrollOffset <= Math.abs(delta))
      return
    }
    if (rewindOpen) {
      dispatchPickerInput(app, 'rewind', key, rewindState?.confirming ?? false)
      return
    }
    if (forkOpen) {
      dispatchPickerInput(app, 'fork', key, forkState?.confirming ?? false)
      return
    }
    if (skillsOpen) {
      if (key.escape) {
        app.dispatch({ type: 'skills.close' })
        return
      }
      if (key.upArrow || key.downArrow) {
        app.dispatch({ type: 'skills.move', delta: key.upArrow ? -1 : 1 })
        return
      }
      if (key.return) {
        app.dispatch({ type: 'skills.confirm' })
        return
      }
      if (key.backspace || key.delete) {
        app.dispatch({
          type: 'skills.setQuery',
          query: skillsState?.query.slice(0, -1) ?? '',
        })
        return
      }
      if (input !== '' && !key.ctrl) {
        app.dispatch({
          type: 'skills.setQuery',
          query: (skillsState?.query ?? '') + input,
        })
      }
      return
    }
    if (checklistOpen) {
      if (key.escape) {
        app.dispatch({ type: 'checklist.close' })
        return
      }
      if (key.upArrow || key.downArrow) {
        app.dispatch({ type: 'checklist.move', delta: key.upArrow ? -1 : 1 })
        return
      }
      return
    }
    if (layout.tooSmall) {
      if (key.escape || (key.ctrl && (input === 'c' || input === 'd'))) {
        app.dispatch({ type: 'quit' })
      }
      return
    }
    if (snap.composer.disabled && !key.ctrl && input !== 'c') {
      if (key.escape || (key.ctrl && input === 'c')) {
        app.dispatch({ type: 'quit' })
      }
      return
    }

    if (snap.resumePicker?.open === true) {
      if (key.escape) {
        app.dispatch({ type: 'resume.close' })
        return
      }
      if (key.upArrow || key.downArrow) {
        app.dispatch({ type: 'resume.move', delta: key.upArrow ? -1 : 1 })
        return
      }
      if (key.return) {
        app.dispatch({ type: 'resume.confirm' })
        return
      }
      if (key.backspace || key.delete) {
        app.dispatch({
          type: 'resume.setQuery',
          query: snap.resumePicker.query.slice(0, -1),
        })
        return
      }
      if (input !== '' && !key.ctrl) {
        app.dispatch({
          type: 'resume.setQuery',
          query: snap.resumePicker.query + input,
        })
      }
      return
    }

    if (snap.sessionTreePicker?.open === true) {
      if (key.escape) {
        app.dispatch({ type: 'sessionTree.close' })
        return
      }
      if (key.upArrow || key.downArrow) {
        app.dispatch({ type: 'sessionTree.move', delta: key.upArrow ? -1 : 1 })
        return
      }
      if (key.return) {
        app.dispatch({ type: 'sessionTree.confirm' })
        return
      }
      if (key.backspace || key.delete) {
        app.dispatch({
          type: 'sessionTree.setQuery',
          query: snap.sessionTreePicker.query.slice(0, -1),
        })
        return
      }
      if (input !== '' && !key.ctrl) {
        app.dispatch({
          type: 'sessionTree.setQuery',
          query: snap.sessionTreePicker.query + input,
        })
      }
      return
    }

    if (snap.queuePicker?.open === true) {
      if (key.escape) {
        app.dispatch({ type: 'queue.close' })
        return
      }
      if (key.upArrow || key.downArrow) {
        app.dispatch({ type: 'queue.move', delta: key.upArrow ? -1 : 1 })
        return
      }
      if (key.return || (key.ctrl && input === 'r')) {
        app.dispatch({ type: 'queue.restore' })
        return
      }
      if (key.ctrl && input === 'd') {
        app.dispatch({ type: 'queue.delete' })
        return
      }
      if (key.backspace || key.delete) {
        app.dispatch({
          type: 'queue.setQuery',
          query: snap.queuePicker.query.slice(0, -1),
        })
        return
      }
      if (input !== '' && !key.ctrl && !key.meta) {
        app.dispatch({
          type: 'queue.setQuery',
          query: snap.queuePicker.query + input,
        })
        return
      }
      return
    }

    if (historySearchOpen) {
      if (key.escape) {
        setHistorySearchOpen(false)
        setHistoryQuery('')
        setHistoryIndex(0)
        return
      }
      if (key.upArrow) {
        setHistoryIndex((index) => moveSelection(index, -1, historyItems.length))
        return
      }
      if (key.downArrow) {
        setHistoryIndex((index) => moveSelection(index, 1, historyItems.length))
        return
      }
      if (key.return) {
        const selected = historyItems[moveSelection(historyIndex, 0, historyItems.length)]
        if (selected !== undefined) app.dispatch({ type: 'setDraft', text: selected })
        setHistorySearchOpen(false)
        setHistoryQuery('')
        setHistoryIndex(0)
        return
      }
      if (key.backspace || key.delete) {
        setHistoryQuery((query) => query.slice(0, -1))
        setHistoryIndex(0)
        return
      }
      if (input !== '' && !key.ctrl) {
        setHistoryQuery((query) => query + input)
        setHistoryIndex(0)
      }
      return
    }

    if (messageSelectionActive) {
      if (messageActionMenuOpen) {
        if (key.escape) {
          setMessageActionMenuOpen(false)
          return
        }
        if (key.upArrow || key.downArrow) {
          setMessageActionIndex((index) => moveSelection(index, key.upArrow ? -1 : 1, messageActionItems.length))
          return
        }
        if (key.return) {
          runMessageAction(messageActionItems[moveSelection(messageActionIndex, 0, messageActionItems.length)])
          return
        }
        return
      }
      if (key.escape) {
        setMessageSelectionActive(false)
        setSelectedMessageId(null)
        return
      }
      if (key.upArrow || key.downArrow) {
        const nextSelectedMessageId = moveMessageSelection(
          selectableMessages,
          selectedMessageId,
          key.upArrow ? -1 : 1,
        )
        if (nextSelectedMessageId !== null) {
          setSelectedMessageId(nextSelectedMessageId)
          setMessageScrollOffset(
            scrollOffsetForMessage(
              displayNodes,
              messageMaxRows,
              nextSelectedMessageId,
              messageScrollOffset,
              snap.verbose,
              expandedMessageIds,
            ),
          )
        }
        return
      }
      if (key.return && selectedMessageId !== null) {
        setExpandedMessageIds((current) => {
          const next = new Set(current)
          if (next.has(selectedMessageId)) next.delete(selectedMessageId)
          else next.add(selectedMessageId)
          return next
        })
        return
      }
      if (input === 'm' && !key.ctrl && !key.meta && !key.shift) {
        setMessageActionMenuOpen(true)
        setMessageActionIndex(0)
        return
      }
      if (input === 'c' && !key.ctrl && !key.meta && !key.shift && selectedMessageId !== null) {
        app.dispatch({ type: 'copyNode', nodeKey: selectedMessageId })
        return
      }
      return
    }

    if (slashOpen) {
      if (key.escape) {
        setSlashDismissed(true)
        return
      }
      if (key.downArrow || key.tab) {
        setSlashIndex((index) => moveSlashSelection(index, 1, slashItems.length))
        return
      }
      if (key.upArrow) {
        setSlashIndex((index) => moveSlashSelection(index, -1, slashItems.length))
        return
      }
      if (key.return) {
        const selected = slashItems[moveSlashSelection(slashIndex, 0, slashItems.length)]
        if (selected !== undefined) {
          app.dispatch({ type: 'command', line: `/${selected.name}` })
        }
        return
      }
    }

    if (fileOpen && fileMention !== undefined) {
      if (key.escape) {
        setFileDismissed(true)
        return
      }
      if (key.downArrow || key.tab) {
        setFileIndex((index) => moveSelection(index, 1, fileItems.length))
        return
      }
      if (key.upArrow) {
        setFileIndex((index) => moveSelection(index, -1, fileItems.length))
        return
      }
      if (key.return) {
        const selected = fileItems[moveSelection(fileIndex, 0, fileItems.length)]
        if (selected !== undefined) {
          app.dispatch({
            type: 'attachFile',
            start: fileMention.start,
            end: fileMention.end,
            path: selected,
          })
        }
        return
      }
    }

    if ((key.tab && key.shift) || (key.ctrl && input === 'm')) {
      app.dispatch({ type: 'permission.toggle' })
      return
    }

    if (key.tab && !key.shift && dispatchComposerTab(app, snap)) {
      return
    }

    const matched = matchKey(
      {
        raw: input,
        return: key.return,
        escape: key.escape,
        upArrow: key.upArrow,
        downArrow: key.downArrow,
        leftArrow: key.leftArrow,
        rightArrow: key.rightArrow,
        tab: key.tab,
        backspace: key.backspace,
        delete: key.delete,
        ctrl: key.ctrl,
        // Ink marks plain Escape as meta, but the keymap must treat it as Esc.
        alt: key.meta && !key.escape,
        shift: key.shift,
        empty: snap.composer.text === '',
      },
      keymap,
    )

    if (matched !== undefined) {
      if (matched.emptyOnly === true && snap.composer.text !== '') return
      if (matched.id === 'editor.open') {
        openExternalEditor()
        return
      }
      if (matched.id === 'history.search') {
        setHistorySearchOpen(true)
        setHistoryQuery('')
        setHistoryIndex(0)
        return
      }
      if (matched.id === 'messages.select') {
        if (selectableMessages.length === 0) return
        const latestMessageId = selectableMessages[selectableMessages.length - 1]
        if (latestMessageId === undefined) return
        setMessageSelectionActive(true)
        setSelectedMessageId(latestMessageId)
        setMessageScrollOffset(
          scrollOffsetForMessage(
            displayNodes,
            messageMaxRows,
            latestMessageId,
            messageScrollOffset,
            snap.verbose,
            expandedMessageIds,
          ),
        )
        return
      }
      if (matched.id === 'command.palette') {
        openCommandPalette()
        return
      }
      dispatchKeyCommand(app, matched.id, snap.composer.text)
      return
    }
    if (key.leftArrow) {
      app.dispatch({ type: 'moveCursor', delta: -1 })
      return
    }
    if (key.rightArrow) {
      app.dispatch({ type: 'moveCursor', delta: 1 })
      return
    }
    if (key.backspace || key.delete) {
      app.dispatch({ type: 'deleteBackward' })
      return
    }
    if (input === '') return
    app.dispatch({ type: 'insertDraft', text: input })
  })

  if (layout.tooSmall) {
    return (
      <Box flexDirection="column" height={stdout.rows} overflowY="hidden">
        <Text color={theme.brand} bold wrap="truncate-end">
          cocode · {text(snap.locale, 'terminalTooSmall')}
        </Text>
        {stdout.rows > 1 ? (
          <Text color={theme.mute} wrap="truncate-end">
            {text(snap.locale, 'terminalResize', {
              current: String(stdout.rows),
              required: String(layout.minimumRows),
            })}
          </Text>
        ) : null}
        {rewindOpen && rewindState !== undefined ? (
          <RewindPicker
            state={rewindState}
            locale={snap.locale}
            maxRows={Math.max(1, stdout.rows - 2)}
          />
        ) : null}
        {forkOpen && forkState !== undefined ? (
          <ForkPicker
            state={forkState}
            locale={snap.locale}
            maxRows={Math.max(1, stdout.rows - 2)}
          />
        ) : null}
      </Box>
    )
  }

  const overlays = (
    <>
      {slashOpen ? (
        <SlashMenu
          items={slashItems}
          selectedIndex={slashIndex}
          query={snap.composer.text.slice(1)}
          locale={snap.locale}
          maxRows={layout.overlayRows}
        />
      ) : null}
      {fileOpen ? (
        <FileMenu
          items={fileItems}
          selectedIndex={fileIndex}
          query={fileMention?.query ?? ''}
          loading={fileLoading}
          locale={snap.locale}
          maxRows={layout.overlayRows}
        />
      ) : null}
      {historySearchOpen ? (
        <HistorySearch
          query={historyQuery}
          matches={historyItems}
          selectedIndex={historyIndex}
          locale={snap.locale}
          maxRows={layout.overlayRows}
        />
      ) : null}
      {snap.resumePicker?.open === true ? (
        <ResumePicker
          state={snap.resumePicker}
          currentSessionId={snap.header.sessionId}
          locale={snap.locale}
          maxRows={layout.overlayRows}
        />
      ) : null}
      {sessionTreeOpen && snap.sessionTreePicker !== undefined ? (
        <SessionTreePicker
          state={snap.sessionTreePicker}
          currentSessionId={snap.header.sessionId}
          locale={snap.locale}
          maxRows={layout.overlayRows}
        />
      ) : null}
      {queueOpen && snap.queuePicker !== undefined ? (
        <QueuePicker state={snap.queuePicker} locale={snap.locale} maxRows={layout.overlayRows} />
      ) : null}
      {checklistOpen && snap.checklist !== undefined ? (
        <ChecklistPanel
          state={snap.checklist}
          todos={snap.status.todos}
          locale={snap.locale}
          maxRows={layout.overlayRows}
        />
      ) : null}
      {rewindOpen ? (
        <RewindPicker state={rewindState} locale={snap.locale} maxRows={layout.overlayRows} />
      ) : null}
      {forkOpen && forkState !== undefined ? (
        <ForkPicker state={forkState} locale={snap.locale} maxRows={layout.overlayRows} />
      ) : null}
      {skillsOpen && skillsState !== undefined ? (
        <SkillsPicker state={skillsState} locale={snap.locale} maxRows={layout.overlayRows} />
      ) : null}
      {modelPickerOpen && snap.modelPicker !== undefined ? (
        <ModelPicker
          state={snap.modelPicker}
          currentProvider={snap.header.provider}
          currentModel={snap.header.model}
          locale={snap.locale}
          maxRows={layout.overlayRows}
        />
      ) : null}
      {modelInputOpen ? (
        <ModelSwitchPanel
          currentModel={snap.header.model}
          locale={snap.locale}
          onSubmit={(model) => {
            app.dispatch({ type: 'model.input.submit', model })
          }}
          onClose={() => app.dispatch({ type: 'model.input.close' })}
        />
      ) : null}
      {snap.question !== undefined ? (
        isPlanReviewQuestion(snap.question.question) ? (
          <PlanReviewPanel
            key={snap.question.key}
            state={snap.question}
            locale={snap.locale}
            panelStartRow={popupStartRow}
            maxRows={layout.overlayRows}
            maxColumns={mainColumns}
            mousePointer={questionMousePointer}
            dispatch={app.dispatch}
          />
        ) : (
          <QuestionPanel
            key={snap.question.key}
            state={snap.question}
            locale={snap.locale}
            panelStartRow={popupStartRow}
            mousePointer={questionMousePointer}
            dispatch={app.dispatch}
          />
        )
      ) : null}
      {approvalOpen && snap.approval !== undefined ? (
        <ApprovalPanel
          state={snap.approval}
          locale={snap.locale}
          panelStartRow={popupStartRow}
          mousePointer={approvalMousePointer}
          dispatch={app.dispatch}
        />
      ) : null}
      {reviewOpen && snap.reviewPicker !== undefined ? (
        <ReviewPicker state={snap.reviewPicker} locale={snap.locale} maxRows={layout.overlayRows} />
      ) : null}
      {snap.helpOpen ? (
        <Help text={snap.helpText} locale={snap.locale} maxRows={layout.overlayRows} />
      ) : null}
      {commandPaletteOpen ? (
        <ActionMenu
          title={snap.locale === 'zh' ? '命令菜单' : 'Command menu'}
          hint={snap.locale === 'zh' ? '↑↓ 选择 · 回车执行 · Esc 关闭' : '↑↓ select · enter run · esc close'}
          items={commandPaletteItems}
          selectedIndex={commandPaletteIndex}
          maxRows={layout.overlayRows}
          query={commandPaletteQuery}
          queryPlaceholder={text(snap.locale, 'commandsFilter')}
          emptyLabel={snap.locale === 'zh' ? '没有可用命令' : 'No commands'}
        />
      ) : null}
      {messageActionMenuOpen ? (
        <ActionMenu
          title={snap.locale === 'zh' ? '消息操作' : 'Message actions'}
          hint={snap.locale === 'zh' ? '↑↓ 选择 · 回车执行 · Esc 关闭' : '↑↓ select · enter run · esc close'}
          items={messageActionItems}
          selectedIndex={messageActionIndex}
          maxRows={layout.overlayRows}
          emptyLabel={snap.locale === 'zh' ? '没有可用操作' : 'No actions'}
        />
      ) : null}
    </>
  )

  return (
    <Box flexDirection="row" height={stdout.rows}>
      <Box
        flexDirection="column"
        height={stdout.rows}
        width={wideInspector ? mainColumns : undefined}
        minWidth={0}
        flexGrow={wideInspector ? 0 : 1}
      >
        <Header
          header={snap.header}
          locale={snap.locale}
          columns={mainColumns}
          status={snap.status}
        />
        <MessageList
          nodes={displayNodes}
          verbose={snap.verbose}
          maxRows={messageMaxRows}
          scrollOffset={messageScrollOffset}
          selectedNodeId={messageSelectionActive ? selectedMessageId : undefined}
          expandedNodeIds={expandedMessageIds}
          locale={snap.locale}
          maxColumns={mainColumns}
        />
        <ChecklistStrip
          todos={snap.status.todos}
          locale={snap.locale}
          maxItems={wideInspector ? CHECKLIST_STRIP_MAX_ITEMS : 2}
        />
        <StatusLine
          status={snap.status}
          agent={snap.agent}
          notice={snap.notice}
          locale={snap.locale}
          maxColumns={mainColumns}
        />
        {editorBusy ? (
          <Text color={theme.info} wrap="truncate-end">
            {text(snap.locale, 'editorOpening')}
          </Text>
        ) : null}
        {editorError !== undefined ? (
          <Text color={theme.error} wrap="truncate-end">
            {editorError}
          </Text>
        ) : null}
        {layout.overlayRows > 0 ? (
          <Box flexDirection="column" height={layout.overlayRows} overflowY="hidden">
            {overlays}
          </Box>
        ) : null}
        <Composer
          composer={snap.composer}
          agent={snap.agent}
          planMode={snap.status.planMode}
          planModeAvailable={snap.capabilities.planMode}
          provider={snap.header.provider}
          model={snap.header.model}
          locale={snap.locale}
          maxRows={layout.composerRows}
          maxColumns={mainColumns}
        />
        <Box width="100%" marginTop={1} justifyContent="space-between">
          {messageSelectionActive ? (
            <Text color={theme.brand} wrap="truncate-end">
              {text(snap.locale, 'messageMode')} · {text(snap.locale, 'messageModeHint')}
            </Text>
          ) : (
            <>
              <Text color={snap.agent === 'running' ? theme.info : theme.mute} wrap="truncate-end">
                {snap.agent === 'running' ? (
                  text(snap.locale, 'footerRunning')
                ) : (
                  <>
                    {text(snap.locale, 'footerHistory')}
                    {wideInspector ? null : (
                      <>
                        {' · '}
                        {text(snap.locale, 'footerScroll')} · {text(snap.locale, 'footerMessages')} ·{' '}
                        {text(snap.locale, 'footerMenu')}{' '}
                        · {text(snap.locale, 'footerDetails')}
                      </>
                    )}
                    {' · '}
                    {text(snap.locale, 'footerHelp')}
                  </>
                )}
              </Text>
              <Text
                color={snap.agent === 'running' ? theme.info : theme.mute}
                wrap="truncate-end"
              >
                {snap.agent === 'running' && snap.composer.text.trim() !== ''
                  ? text(snap.locale, 'footerQueueDraft')
                  : text(snap.locale, 'footerQuit')}{' '}
                · {text(snap.locale, 'footerRedraw')}
              </Text>
            </>
          )}
        </Box>
      </Box>
      {wideInspector ? (
        <Inspector
          snapshot={snap}
          locale={snap.locale}
          maxRows={stdout.rows}
          width={inspectorLayout.width}
          resizing={inspectorResize.resizing}
          mouseInput={inspectorMouseInput}
        />
      ) : null}
    </Box>
  )
}

function hasTelemetry(telemetry: TuiSnapshot['status']['telemetry']): boolean {
  return (
    telemetry.tps !== undefined ||
    telemetry.cacheHitRate !== undefined ||
    telemetry.reasoningEffort !== undefined ||
    telemetry.activity !== undefined
  )
}

function hasStatusDetails(status: TuiSnapshot['status']): boolean {
  return (
    hasTelemetry(status.telemetry) ||
    status.todos.length > 0 ||
    status.goal !== undefined ||
    status.agentPreset !== undefined ||
    status.transcript !== undefined
  )
}

function reviewRowsFor(state: TuiSnapshot['reviewPicker']): number {
  if (state === undefined) return 0
  if (!state.open) return 0
  if (state.phase === 'scope') return state.scopes.length + 5
  if (state.phase === 'loading') return 7
  return Math.min(16, state.review.files.length + 8)
}

function questionPanelRows(state: NonNullable<TuiSnapshot['question']>): number {
  const options = state.question.options ?? []
  const optionRows = options.reduce(
    (rows, option) => rows + 1 + Number(option.description !== undefined),
    0,
  )
  return 11 + Number(state.question.detail !== undefined) + optionRows
}

function overlayWindowSize(maxRows: number, itemCount: number, chromeRows: number): number {
  return Math.max(1, Math.min(itemCount, Math.trunc(maxRows) - chromeRows))
}

function pickerWindowSize(maxRows: number, windowSize: number, chromeRows = 7): number {
  return Math.max(1, Math.min(windowSize, Math.trunc(maxRows) - chromeRows))
}
