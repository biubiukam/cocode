import type { RefObject } from 'react'
import { Square } from 'lucide-react'

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function AccessIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 1.75 13 3.8v3.75c0 3.05-1.95 5.55-5 6.7-3.05-1.15-5-3.65-5-6.7V3.8L8 1.75Z" stroke="currentColor" strokeWidth="1.35" />
      <path d="M8 5v3.25M8 10.75h.01" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  )
}

function VoiceIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="5.25" y="2.25" width="5.5" height="8" rx="2.75" stroke="currentColor" strokeWidth="1.35" />
      <path d="M3.5 8.25a4.5 4.5 0 0 0 9 0M8 12.75v1.5M5.75 14.25h4.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden>
      <path d="M10 14V5M6 9 10 5l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="m4.5 6.25 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export type ComposerControlOwner = {
  running: boolean
  sendDisabled: boolean
  modelLabel: string
  thinkingLabel?: string
  addOpen: boolean
  modelOpen: boolean
  addTriggerRef: RefObject<HTMLButtonElement | null>
  modelTriggerRef: RefObject<HTMLButtonElement | null>
  sendButtonRef: RefObject<HTMLButtonElement | null>
  onToggleAdd(): void
  onToggleModel(): void
  onCancel(): void
  onSend(): void
}

export function ComposerLeading(props: ComposerControlOwner) {
  return (
    <>
      <button
        ref={props.addTriggerRef}
        type="button"
        className="composer-control composer-action composer-add"
        aria-label="添加上下文"
        aria-expanded={props.addOpen}
        aria-controls="add-menu"
        title="添加上下文"
        onClick={props.onToggleAdd}
      >
        <span className="composer-control-icon"><PlusIcon /></span>
      </button>
      <button
        type="button"
        className="composer-control composer-access"
        aria-label="访问模式：完全访问"
        title="访问模式"
        disabled
      >
        <span className="composer-control-icon"><AccessIcon /></span>
        <span>完全访问</span>
      </button>
    </>
  )
}

export function ComposerTrailing(props: ComposerControlOwner) {
  return (
    <>
      <button
        type="button"
        className="composer-control composer-action"
        aria-label="语音输入"
        title="语音输入"
        disabled
      >
        <span className="composer-control-icon"><VoiceIcon /></span>
      </button>
      <button
        ref={props.modelTriggerRef}
        type="button"
        className="composer-control composer-control-combined"
        title="选择模型与思考深度"
        aria-expanded={props.modelOpen}
        aria-controls="model-menu"
        onClick={props.onToggleModel}
      >
        <span className="composer-control-value">{props.modelLabel}</span>
        {props.thinkingLabel === undefined ? null : <span className="composer-control-value">{props.thinkingLabel}</span>}
        <span className="composer-control-chevron"><ChevronIcon /></span>
      </button>
      {props.running
        ? (
            <button
              ref={props.sendButtonRef}
              type="button"
              className="button button-danger send-button"
              aria-label="停止"
              title="停止当前轮次"
              onClick={props.onCancel}
            >
              <span aria-hidden><Square /></span>
            </button>
          )
        : (
            <button
              ref={props.sendButtonRef}
              type="button"
              className="button button-primary send-button"
              aria-label="发送"
              disabled={props.sendDisabled}
              onClick={props.onSend}
            >
              <span aria-hidden><SendIcon /></span>
            </button>
          )}
    </>
  )
}
