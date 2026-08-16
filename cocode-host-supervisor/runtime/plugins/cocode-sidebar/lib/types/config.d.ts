/**
 * Serializable configuration and defaults for the sidebar host half. Loader
 * schema validation normally fills defaults; {@link resolveSidebarConfig}
 * applies the same defaults for direct callers that bypass the Loader.
 * @module dsh-better-sidebar/config
 */
import z from 'schemastery';
import { type SidebarPrefs } from './prefs-shared.ts';
export { SIDEBAR_PREFS_DEFAULTS, SIDEBAR_PREFS_NS, TERMINAL_FONT_SIZE_DEFAULT, TERMINAL_FONT_SIZE_MAX, TERMINAL_FONT_SIZE_MIN, WIDTH_PERCENT_DEFAULT, WIDTH_PERCENT_MAX, WIDTH_PERCENT_MIN, type SidebarPrefs, } from './prefs-shared.ts';
/** Tunable sidebar host limits (every field optional; defaults fill in). */
export interface SidebarConfig {
    /** Read cap of one text file (bytes); larger files return truncated. */
    readLimit?: number;
    /** Media route cap (bytes); larger binaries are refused. */
    mediaLimit?: number;
    /** Explorer row bound of one level. */
    listLimit?: number;
    /** Terminals per session. */
    terminalsPerSession?: number;
    /** How long a disconnected terminal process survives awaiting a reconnect. */
    reconnectGraceMs?: number;
    /** Live browser pages one conversation may hold open. */
    browserTabsPerSession?: number;
    /** Chromium profile name; one persistent cookie jar and login state per name. */
    browserProfile?: string;
    /**
     * Run Chromium with a visible window instead of headless. The sidebar still
     * renders the screencast; this is the escape hatch for sites that refuse
     * headless traffic outright.
     */
    browserHeaded?: boolean;
}
/** Schemastery schema for the plugin configuration. */
export declare const Config: z<SidebarConfig>;
/** Fully defaulted sidebar host settings. */
export interface ResolvedSidebarConfig {
    readLimit: number;
    mediaLimit: number;
    listLimit: number;
    terminalsPerSession: number;
    reconnectGraceMs: number;
    browserTabsPerSession: number;
    browserProfile: string;
    browserHeaded: boolean;
}
/**
 * Apply direct-call defaults after Loader schema validation has normally run.
 *
 * @param config - Deployment-provided sidebar host settings.
 * @returns Complete settings consumed by the host half.
 */
export declare function resolveSidebarConfig(config: SidebarConfig | undefined): ResolvedSidebarConfig;
/** Schemastery schema for the user-facing preferences (validated by the settings service). */
export declare const PrefsSchema: z<SidebarPrefs>;
