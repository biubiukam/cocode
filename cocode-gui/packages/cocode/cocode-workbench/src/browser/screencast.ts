/**
 * Screencast orchestration.
 *
 * Back-pressure is CDP's own: Chromium stops producing frames until the
 * previous one is acked, so the client acking after it paints is the entire
 * flow-control mechanism. No queue of our own, no dropped-frame heuristics.
 */
import type { BrowserTab } from "./tabs.ts"
import type { BrowserFrameHeader } from "./protocol.ts"

const JPEG_QUALITY = 70

interface ScreencastFrameEvent {
  readonly data: string
  readonly sessionId: number
  readonly metadata: { readonly deviceWidth?: number; readonly deviceHeight?: number; readonly pageScaleFactor?: number }
}

export interface ViewportRequest {
  readonly width: number
  readonly height: number
  readonly deviceScaleFactor: number
}

export class Screencast {
  private running = false
  private seq = 0
  /** CDP session ids awaiting the client's paint confirmation, keyed by our seq. */
  private readonly pending = new Map<number, number>()
  private viewport: ViewportRequest = { width: 1280, height: 800, deviceScaleFactor: 1 }
  private listening = false

  constructor(
    private readonly tab: BrowserTab,
    private readonly onFrame: (header: BrowserFrameHeader, payload: Uint8Array) => void,
  ) {}

  private handleFrame = (event: ScreencastFrameEvent): void => {
    if (!this.running) {
      void this.tab.cdp.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => { /* stopped */ })
      return
    }
    this.seq += 1
    this.pending.set(this.seq, event.sessionId)
    // Buffer.from decodes base64 without an intermediate binary string.
    const payload = new Uint8Array(Buffer.from(event.data, "base64"))
    this.onFrame({
      tabId: this.tab.id,
      generation: this.tab.generation,
      seq: this.seq,
      width: event.metadata.deviceWidth ?? this.viewport.width,
      height: event.metadata.deviceHeight ?? this.viewport.height,
      deviceScaleFactor: this.viewport.deviceScaleFactor,
    }, payload)
  }

  async resize(viewport: ViewportRequest): Promise<void> {
    const changed = viewport.width !== this.viewport.width
      || viewport.height !== this.viewport.height
      || viewport.deviceScaleFactor !== this.viewport.deviceScaleFactor
    this.viewport = viewport
    if (!changed) return
    await this.tab.page.setViewportSize({ width: viewport.width, height: viewport.height }).catch(() => { /* closed */ })
    if (this.running) {
      await this.stop()
      await this.start()
    }
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    if (!this.listening) {
      this.tab.cdp.on("Page.screencastFrame", this.handleFrame as (event: unknown) => void)
      this.listening = true
    }
    await this.tab.cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: JPEG_QUALITY,
      maxWidth: Math.round(this.viewport.width * this.viewport.deviceScaleFactor),
      maxHeight: Math.round(this.viewport.height * this.viewport.deviceScaleFactor),
      everyNthFrame: 1,
    }).catch(() => { this.running = false })
  }

  /** Stopping is not optional politeness: an idle screencast is a battery drain. */
  async stop(): Promise<void> {
    if (!this.running) return
    this.running = false
    this.pending.clear()
    await this.tab.cdp.send("Page.stopScreencast").catch(() => { /* page closed */ })
  }

  ack(seq: number): void {
    const sessionId = this.pending.get(seq)
    if (sessionId === undefined) return
    this.pending.delete(seq)
    void this.tab.cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => { /* page closed */ })
  }

  get isRunning(): boolean {
    return this.running
  }

  dispose(): void {
    this.running = false
    this.pending.clear()
    if (this.listening) {
      this.tab.cdp.off("Page.screencastFrame", this.handleFrame as (event: unknown) => void)
      this.listening = false
    }
  }
}
