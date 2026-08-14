declare module 'docx-preview' {
  export function renderAsync(
    data: ArrayBuffer | Blob | Uint8Array,
    bodyContainer: HTMLElement,
    styleContainer?: HTMLElement,
    options?: Record<string, unknown>,
  ): Promise<void>
}

declare module 'xlsx' {
  export type WorkBook = {
    SheetNames: string[]
    Sheets: Record<string, WorkSheet | undefined>
  }
  export type WorkSheet = Record<string, unknown>
  export const utils: {
    sheet_to_json<T>(sheet: WorkSheet, opts?: { header?: number; defval?: string }): T[]
  }
  export function read(data: ArrayBuffer | Uint8Array, opts?: { type?: string }): WorkBook
}

declare module '@aiden0z/pptx-renderer' {
  export const RECOMMENDED_ZIP_LIMITS: unknown
  export class PptxViewer {
    static open(
      data: ArrayBuffer,
      host: HTMLElement,
      options: Record<string, unknown>,
    ): Promise<PptxViewer>
    destroy(): void
    goToSlide(index: number, opts?: { behavior?: string }): Promise<void>
    readonly currentSlideIndex: number
    readonly slideCount: number
  }
}
