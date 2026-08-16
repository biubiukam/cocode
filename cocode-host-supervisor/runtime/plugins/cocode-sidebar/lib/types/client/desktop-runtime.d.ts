/**
 * Resolve browser-owned resource URLs against the embedded DSH sidecar.
 * Ordinary `dsh web` does not define the desktop marker and keeps the
 * plugin's original same-origin relative URL behavior.
 */
export declare function desktopRuntimeUrl(pathname: string): string;
