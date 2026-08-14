/**
 * The Composer (design system §5.2).
 *
 * Structure and classes come from `design-system.html`'s `#chat-composer`; this
 * component supplies behaviour and the wire calls, not geometry.
 */

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { cn } from '@cocode/ui'
import type { CommandDescriptor, PromptContentPart, SessionModels } from '@cocode/gui-connection'
import { commandNameOf, isCommandLine } from '../runtime/index.ts'
import { registerDraftSink } from '../runtime/composer/draft.ts'
import { SlotOutlet } from '../boot/slot-renderer.tsx'

const THINKING_OPTIONS = [
  { value: 'quick', label: 'Quick', description: '低延迟，适合简单编辑' },
  { value: 'high', label: 'High', description: '复杂任务前多做一些规划' },
  { value: 'very_high', label: 'Very high', description: '改动前尽可能深入推理' },
] as const

function ChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="m4.5 6.25 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function resolveModelLabel(models: SessionModels | undefined): string | undefined {
  const current = models?.current
  if (current === undefined || models === undefined) return undefined
  const group = models.groups.find(entry => entry.id === current.provider)
  const model = group?.models.find(entry => entry.id === current.model)
  return model?.name ?? current.model
}

function resolveThinkingLabel(reasoningEffort: string | undefined): string | undefined {
  if (reasoningEffort === undefined) return undefined
  return THINKING_OPTIONS.find(option => option.value === reasoningEffort)?.label ?? reasoningEffort
}

/** Mirrors `positionComposerMenu` in design-system.html for compact composer menus. */
function positionComposerCompactMenu(
  menu: HTMLElement,
  trigger: HTMLElement,
  composerSurface: HTMLElement,
  sendButton: HTMLElement | null,
) {
  const surfaceRect = composerSurface.getBoundingClientRect()
  const boundaryRect = composerSurface.getBoundingClientRect()
  const triggerRect = trigger.getBoundingClientRect()
  const preferredWidth = menu.classList.contains('composer-menu-unified') ? 320 : 264
  const menuWidth = Math.min(preferredWidth, Math.max(0, surfaceRect.width - 24))
  const menuGap = 8
  const bottom = Math.max(8, surfaceRect.bottom - triggerRect.top + menuGap)

  if (menu.classList.contains('composer-menu-unified')) {
    const sendRect = sendButton?.getBoundingClientRect()
    const rightAnchor = sendRect === undefined
      ? surfaceRect.right - triggerRect.right + 8
      : surfaceRect.right - sendRect.left + 8
    menu.style.left = 'auto'
    menu.style.right = `${String(rightAnchor)}px`
  }
  else {
    const triggerCenter = triggerRect.left - surfaceRect.left + triggerRect.width / 2
    const unclampedLeft = triggerCenter - menuWidth / 2
    const minLeft = boundaryRect.left - surfaceRect.left + 8
    const maxLeft = boundaryRect.right - surfaceRect.left - menuWidth - 8
    menu.style.left = `${String(Math.max(minLeft, Math.min(unclampedLeft, maxLeft)))}px`
    menu.style.right = 'auto'
  }

  menu.style.bottom = `${String(bottom)}px`
  menu.style.width = `${String(menuWidth)}px`
}

export type ComposerAttachment = {
  id: string
  name: string
  mediaType: string
  /** Base64 payload without the data-URL prefix. */
  data: string
  previewUrl: string
}

export type ComposerHandle = {
  /** Prefills the input and moves focus — used by welcome suggestions. */
  fill(text: string): void
  /** Appends text at the caret (or end) without clearing the draft. */
  append(fragment: string): void
}

export type ComposerProps = {
  running: boolean
  disabled: boolean
  models: SessionModels | undefined
  /** The session's slash commands, for completion and dispatch routing. */
  commands: readonly CommandDescriptor[]
  onLoadModels(): void
  onSelectModel(provider: string, model: string, reasoningEffort?: string): void
  onSend(content: PromptContentPart[], mode: 'queue' | 'steer'): void
  /** Dispatches a full command line through the command registry. */
  onCommand(line: string): void
  onCancel(): void
}

/** Reads a picked file into the base64 form `session.prompt` accepts. */
async function readAttachment(file: File): Promise<ComposerAttachment | undefined> {
  if (!file.type.startsWith('image/')) return undefined
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const data = btoa(binary)
  return {
    id: crypto.randomUUID(),
    name: file.name,
    mediaType: file.type,
    data,
    previewUrl: `data:${file.type};base64,${data}`,
  }
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer({
  running, disabled, models, commands, onLoadModels, onSelectModel, onSend, onCommand, onCancel,
}, ref) {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const [highlighted, setHighlighted] = useState(0)
  const [activeMenu, setActiveMenu] = useState<'add' | 'model' | null>(null)
  const [modelOptionsOpen, setModelOptionsOpen] = useState(false)
  const [thinkingOptionsOpen, setThinkingOptionsOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const addTriggerRef = useRef<HTMLButtonElement>(null)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const modelTriggerRef = useRef<HTMLButtonElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const sendButtonRef = useRef<HTMLButtonElement>(null)

  useImperativeHandle(ref, () => ({
    fill(next) {
      setText(next)
      textareaRef.current?.focus()
    },
    append(fragment) {
      setText(current => {
        if (fragment === '') return current
        if (current === '') return fragment
        const needsSpace = !/\s$/.test(current) && !/^\s/.test(fragment)
        return needsSpace ? `${current} ${fragment}` : `${current}${fragment}`
      })
      textareaRef.current?.focus()
    },
  }), [])

  useEffect(() => registerDraftSink({
    fill(next) {
      setText(next)
      textareaRef.current?.focus()
    },
    append(fragment) {
      setText(current => {
        if (fragment === '') return current
        if (current === '') return fragment
        const needsSpace = !/\s$/.test(current) && !/^\s/.test(fragment)
        return needsSpace ? `${current} ${fragment}` : `${current}${fragment}`
      })
    },
  }), [])

  const commandPrefix = isCommandLine(text) && !text.includes(' ') ? commandNameOf(text) : undefined
  const matches = commandPrefix === undefined
    ? []
    : commands.filter(command => command.name.startsWith(commandPrefix)).slice(0, 8)
  const completionOpen = matches.length > 0

  const closeMenus = () => {
    setActiveMenu(null)
    setModelOptionsOpen(false)
    setThinkingOptionsOpen(false)
    setAdvancedOpen(false)
  }

  const toggleMenu = (menu: 'add' | 'model') => {
    setActiveMenu(current => {
      const next = current === menu ? null : menu
      if (next === 'model') onLoadModels()
      return next
    })
    if (menu === 'model') {
      setModelOptionsOpen(false)
      setThinkingOptionsOpen(false)
      setAdvancedOpen(false)
    }
  }

  useEffect(() => { setHighlighted(0) }, [commandPrefix])

  useEffect(() => {
    if (activeMenu === null && !completionOpen) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      const roots = [composerRef.current, addMenuRef.current, modelMenuRef.current]
      if (roots.some(root => root?.contains(target))) return
      closeMenus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [activeMenu, completionOpen])

  useLayoutEffect(() => {
    if (activeMenu !== 'model') return
    const menu = modelMenuRef.current
    const trigger = modelTriggerRef.current
    const surface = composerRef.current
    if (menu === null || trigger === null || surface === null) return

    const position = () => positionComposerCompactMenu(menu, trigger, surface, sendButtonRef.current)
    position()
    const frame = window.requestAnimationFrame(position)
    window.addEventListener('resize', position)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', position)
    }
  }, [activeMenu, models])

  useEffect(() => {
    const element = textareaRef.current
    if (element === null) return
    const minHeight = 64
    const maxHeight = Math.round(globalThis.innerHeight / 3)
    element.style.height = 'auto'
    element.style.height = `${String(Math.min(Math.max(element.scrollHeight, minHeight), maxHeight))}px`
  }, [text])

  const submit = (mode: 'queue' | 'steer') => {
    const trimmed = text.trim()
    if (trimmed === '' && attachments.length === 0) return

    if (isCommandLine(trimmed) && attachments.length === 0) {
      onCommand(trimmed)
      setText('')
      return
    }

    const content: PromptContentPart[] = [
      ...attachments.map((attachment): PromptContentPart => ({
        type: 'image',
        mediaType: attachment.mediaType,
        data: attachment.data,
        name: attachment.name,
      })),
      ...(trimmed === '' ? [] : [{ type: 'text' as const, text: trimmed }]),
    ]
    onSend(content, mode)
    setText('')
    setAttachments([])
  }

  const acceptCompletion = (command: CommandDescriptor) => {
    setText(command.input === undefined ? `/${command.name}` : `/${command.name} `)
    textareaRef.current?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (completionOpen) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        setHighlighted(current => {
          const next = event.key === 'ArrowDown' ? current + 1 : current - 1
          return (next + matches.length) % matches.length
        })
        return
      }
      if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
        const command = matches[highlighted]
        if (command !== undefined && !(event.key === 'Enter' && command.name === commandPrefix)) {
          event.preventDefault()
          acceptCompletion(command)
          return
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setText('')
        return
      }
    }
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    submit(event.metaKey || event.ctrlKey ? 'steer' : 'queue')
  }

  const pickFiles = async (files: FileList | null) => {
    if (files === null) return
    const read = await Promise.all([...files].map(readAttachment))
    setAttachments(current => [...current, ...read.filter((item): item is ComposerAttachment => item !== undefined)])
  }

  const current = models?.current
  const modelLabel = resolveModelLabel(models) ?? '选择模型'
  const thinkingLabel = resolveThinkingLabel(current?.reasoningEffort)
  const sendDisabled = disabled || (text.trim() === '' && attachments.length === 0)

  const selectModel = (provider: string, model: string) => {
    onSelectModel(provider, model, current?.reasoningEffort)
    closeMenus()
  }

  const selectThinking = (reasoningEffort: string) => {
    if (current === undefined) return
    onSelectModel(current.provider, current.model, reasoningEffort)
    closeMenus()
  }

  return (
    <div className="composer-wrap mx-auto w-[min(100%,860px)] shrink-0 !px-6">
      <div
        ref={composerRef}
        className="composer"
        onDragOver={event => event.preventDefault()}
        onDrop={event => {
          event.preventDefault()
          void pickFiles(event.dataTransfer.files)
        }}
      >
        {completionOpen
          ? (
              <div className="composer-menu composer-menu-unified is-open" role="listbox" aria-label="斜杠命令">
                <div className="composer-menu-list">
                  {matches.map((command, index) => (
                    <button
                      key={command.name}
                      type="button"
                      role="option"
                      aria-selected={index === highlighted}
                      onMouseEnter={() => setHighlighted(index)}
                      onClick={() => acceptCompletion(command)}
                      className={index === highlighted ? 'composer-menu-item is-highlighted' : 'composer-menu-item'}
                    >
                      <span className="composer-chip-symbol">/</span>
                      <span className="composer-menu-item-copy">
                        <strong>{command.name}</strong>
                        <small>{command.description}</small>
                      </span>
                      {command.input === undefined ? null : <kbd>{command.input.hint}</kbd>}
                    </button>
                  ))}
                </div>
              </div>
            )
          : null}

        <textarea
          id="chat-composer"
          ref={textareaRef}
          value={text}
          disabled={disabled}
          onChange={event => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={event => { void pickFiles(event.clipboardData.files) }}
          rows={1}
          aria-label="Chat composer"
          placeholder={disabled ? '连接就绪后即可输入' : '随便问、@ 文件，或 / 命令'}
        />

        <div className="composer-selections" aria-live="polite">
          {attachments.map(attachment => (
            <span key={attachment.id} className="composer-chip">
              <img src={attachment.previewUrl} alt="" width={16} height={16} style={{ borderRadius: 999 }} />
              <strong>{attachment.name}</strong>
              <button
                type="button"
                aria-label={`移除 ${attachment.name}`}
                onClick={() => setAttachments(items => items.filter(item => item.id !== attachment.id))}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>

        <div className="composer-footer" aria-label="Composer controls">
          <div className="composer-footer-left">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={event => {
                void pickFiles(event.target.files)
                event.target.value = ''
              }}
            />
            <SlotOutlet
              name="conversation.composer.leading"
              owner={{
                running,
                sendDisabled,
                modelLabel,
                thinkingLabel,
                addOpen: activeMenu === 'add',
                modelOpen: activeMenu === 'model',
                addTriggerRef,
                modelTriggerRef,
                sendButtonRef,
                onToggleAdd: () => toggleMenu('add'),
                onToggleModel: () => toggleMenu('model'),
                onCancel,
                onSend: () => submit('queue'),
              }}
            />
          </div>

          <div className="composer-footer-right">
            <SlotOutlet
              name="conversation.composer.trailing"
              owner={{
                running,
                sendDisabled,
                modelLabel,
                thinkingLabel,
                addOpen: activeMenu === 'add',
                modelOpen: activeMenu === 'model',
                addTriggerRef,
                modelTriggerRef,
                sendButtonRef,
                onToggleAdd: () => toggleMenu('add'),
                onToggleModel: () => toggleMenu('model'),
                onCancel,
                onSend: () => submit('queue'),
              }}
            />
          </div>
        </div>

        <div
          ref={addMenuRef}
          id="add-menu"
          className={cn('composer-menu', activeMenu === 'add' && 'is-open')}
          role="menu"
          aria-label="添加上下文"
        >
          <div className="composer-menu-head"><strong>添加</strong><kbd>+</kbd></div>
          <div className="composer-menu-list">
            <button
              type="button"
              className="composer-menu-item is-highlighted"
              onClick={() => {
                closeMenus()
                fileRef.current?.click()
              }}
            >
              <span className="composer-control-icon" aria-hidden>↗</span>
              <span className="composer-menu-item-copy">
                <strong>文件与文件夹</strong>
                <small>提及工作区上下文</small>
              </span>
            </button>
            <button
              type="button"
              className="composer-menu-item"
              onClick={() => {
                closeMenus()
                fileRef.current?.click()
              }}
            >
              <span className="composer-control-icon" aria-hidden>@</span>
              <span className="composer-menu-item-copy">
                <strong>提及文件</strong>
                <small>按名称查找文件</small>
              </span>
            </button>
            <button
              type="button"
              className="composer-menu-item"
              onClick={() => {
                closeMenus()
                setText('/')
                textareaRef.current?.focus()
              }}
            >
              <span className="composer-control-icon" aria-hidden>/</span>
              <span className="composer-menu-item-copy">
                <strong>命令与技能</strong>
                <small>使用专门的工作流</small>
              </span>
            </button>
          </div>
        </div>

        <div
          ref={modelMenuRef}
          id="model-menu"
          className={cn('composer-menu composer-menu-compact composer-menu-unified', activeMenu === 'model' && 'is-open')}
          role="dialog"
          aria-label="选择模型与思考深度"
        >
          <div className="composer-menu-head"><strong>模型与思考</strong></div>

          <button
            type="button"
            className="composer-menu-row"
            aria-expanded={modelOptionsOpen}
            aria-controls="model-options"
            onClick={() => {
              setModelOptionsOpen(open => !open)
              setThinkingOptionsOpen(false)
              setAdvancedOpen(false)
            }}
          >
            <span className="composer-menu-row-label">模型</span>
            <span className="composer-menu-row-value">
              <strong>{modelLabel}</strong>
              <span className="composer-control-chevron"><ChevronIcon /></span>
            </span>
          </button>
          <div className="composer-menu-sublist" id="model-options" hidden={!modelOptionsOpen}>
            {models === undefined
              ? (
                  <div className="composer-menu-item" aria-disabled>
                    <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                    <span className="composer-menu-item-copy"><strong>正在读取模型目录</strong></span>
                  </div>
                )
              : models.groups.length === 0
                ? (
                    <div className="composer-menu-item" aria-disabled>
                      <span className="composer-menu-item-copy"><strong>没有可用的模型</strong></span>
                    </div>
                  )
                : models.groups.flatMap(group => [
                    <div key={`${group.id}-section`} className="composer-menu-section">{group.name}</div>,
                    ...group.models.map(model => {
                      const selected = current?.provider === group.id && current.model === model.id
                      return (
                        <button
                          key={`${group.id}:${model.id}`}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={cn('composer-menu-item', selected && 'is-highlighted')}
                          onClick={() => selectModel(group.id, model.id)}
                        >
                          <span className="composer-control-icon" aria-hidden>◈</span>
                          <span className="composer-menu-item-copy">
                            <strong>{model.name}</strong>
                            {model.description === undefined ? null : <small>{model.description}</small>}
                          </span>
                        </button>
                      )
                    }),
                  ])}
          </div>

          <button
            type="button"
            className="composer-menu-row"
            aria-expanded={thinkingOptionsOpen}
            aria-controls="thinking-options"
            onClick={() => {
              setThinkingOptionsOpen(open => !open)
              setModelOptionsOpen(false)
              setAdvancedOpen(false)
            }}
          >
            <span className="composer-menu-row-label">思考深度</span>
            <span className="composer-menu-row-value">
              <strong>{thinkingLabel ?? 'High'}</strong>
              <span className="composer-control-chevron"><ChevronIcon /></span>
            </span>
          </button>
          <div className="composer-menu-sublist" id="thinking-options" hidden={!thinkingOptionsOpen}>
            {THINKING_OPTIONS.map(option => {
              const selected = current?.reasoningEffort === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={cn('composer-menu-item', selected && 'is-highlighted')}
                  onClick={() => selectThinking(option.value)}
                >
                  <span className="composer-control-icon" aria-hidden>✦</span>
                  <span className="composer-menu-item-copy">
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="composer-menu-divider" />

          <button
            type="button"
            className="composer-menu-advanced"
            aria-expanded={advancedOpen}
            aria-controls="advanced-options"
            onClick={() => {
              setAdvancedOpen(open => !open)
              setModelOptionsOpen(false)
              setThinkingOptionsOpen(false)
            }}
          >
            <span>高级</span>
            <span className="composer-control-chevron"><ChevronIcon /></span>
          </button>
          <div className="composer-menu-advanced-panel" id="advanced-options" hidden={!advancedOpen}>
            温度、回复详细度，以及供应商特有控制。
          </div>
        </div>
      </div>

      {running
        ? <p className="button-note" style={{ marginTop: 6 }}>Agent 正在运行 · Enter 排队，⌘Enter 立即引导</p>
        : null}
    </div>
  )
})
