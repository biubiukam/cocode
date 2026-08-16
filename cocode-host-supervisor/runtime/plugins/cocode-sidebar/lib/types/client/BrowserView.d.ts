import type { BrowserDialog, BrowserEngineStatus } from '../browser/protocol.ts';
import type { TabComponentProps } from './service.ts';
export declare function BrowserView(props: TabComponentProps): import("react").JSX.Element;
/**
 * The first-run panel. Chromium is a few hundred megabytes, so it is fetched
 * on demand rather than shipped — the user is told exactly what is about to
 * happen instead of watching an unexplained spinner.
 */
export declare function BrowserEnginePrompt(props: {
    status: BrowserEngineStatus;
    url?: string;
}): import("react").JSX.Element;
/**
 * A native `alert` / `confirm` / `prompt` freezes the remote renderer until
 * it is answered, so it is surfaced as a real blocking overlay rather than
 * left to time out invisibly.
 */
export declare function BrowserDialogPrompt(props: {
    dialog: BrowserDialog;
    onAnswer: (accept: boolean, text?: string) => void;
}): import("react").JSX.Element;
