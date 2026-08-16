export type ChunkName = 'terminal' | 'editor';
/** The module exports a chunk factory provides (namespace-ish record). */
export type ChunkExports = Record<string, unknown>;
/**
 * The platform externals a chunk bundle may require (mirror of
 * CLIENT_EXTERNALS in tsdown.config.ts — the chunk builds keep these
 * external and the loader resolves them here). A superset is safe: the
 * require only answers what the chunk actually asks for.
 */
export declare const CHUNK_EXTERNALS: readonly string[];
/** Script-load hook; tests replace it with a stub (the default needs a real DOM + network). */
export type ChunkScriptLoader = (src: string) => Promise<void>;
/** Test hook: replace the chunk-script loader (pass null to restore the default). */
export declare function setChunkScriptLoaderForTests(loader: ChunkScriptLoader | null): void;
export declare function registerChunkForTests(name: ChunkName, loader: () => Promise<ChunkExports>): void;
/**
 * Load (once) and materialize a lazy chunk, returning its module exports.
 * Concurrent callers share one in-flight load; a failure clears the cache
 * entry so the next call retries (the script re-executes and overwrites its
 * global registry slot — assignments are idempotent).
 * @param name - the chunk to load.
 */
export declare function loadChunk(name: ChunkName): Promise<ChunkExports>;
/**
 * Drop all chunk state for a fresh plugin activation (HMR-safe): clear the
 * in-memory cache and any test-registry entries, so the next lazy open
 * re-fetches and re-executes the current chunk scripts (the registry slots
 * are overwritten by the re-execution — no cleanup needed).
 */
export declare function resetChunks(): void;
