declare module "html-to-docx" {
  interface HtmlToDocxOptions {
    readonly pageSize?: { readonly width?: number; readonly height?: number }
    readonly margins?: { readonly top?: number; readonly right?: number; readonly bottom?: number; readonly left?: number }
    readonly font?: string
    readonly fontSize?: number
    readonly lang?: string
    readonly table?: { readonly row?: { readonly cantSplit?: boolean } }
  }

  function htmlToDocx(
    html: string,
    header?: string | null,
    options?: HtmlToDocxOptions,
    footer?: string | null,
  ): Promise<Buffer | Blob>

  export default htmlToDocx
}
