/**
 * New-tab invitation shown while the remote page is still about:blank.
 *
 * The canvas underneath would otherwise paint Chromium's default white page,
 * which clashes with the workbench theme. This overlay follows the design
 * tokens directly, so it tracks light/dark mode without a round trip to the host.
 */
import { BrowserIcon } from "../icons.tsx"
import { t } from "../locales.ts"
import css from "./browser.module.css"

export interface BrowserStartPageProps {
  readonly onFocusAddress: () => void
}

export function BrowserStartPage(props: BrowserStartPageProps) {
  return <button
    type="button"
    className={css.startPage}
    aria-label={t("browser.startTitle")}
    onClick={() => { props.onFocusAddress() }}
  >
    <div className={css.startBlock}>
      <span className={css.startMark} aria-hidden="true"><BrowserIcon size={18} /></span>
      <p className={css.startTitle}>{t("browser.startTitle")}</p>
    </div>
  </button>
}
