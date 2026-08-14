// @ts-nocheck
/**
 * Node internal ESM loader surface.
 *
 * GUI renderer never uses Node's cascaded loader. `fromInternal()` stays
 * undefined; boot assigns `loader.internal.import` or `loader.builtins`.
 */

import type { Dict } from '@deepseek-ai/cosmokit'

/** Node internal module format names handled by loader hooks. */
export type ModuleFormat = 'builtin' | 'commonjs' | 'json' | 'module' | 'wasm'
/** Source payload accepted by Node internal module load hooks. */
export type ModuleSource = string | ArrayBuffer

/** Result returned by a Node internal resolve hook. */
export interface ResolveResult {
  format: ModuleFormat
  url: string
}

/** Result returned by a Node internal load hook. */
export interface LoadResult {
  format: ModuleFormat
  source?: ModuleSource
}

type LoadCacheData = ModuleJob

/** @see https://github.com/nodejs/node/blob/main/lib/internal/modules/esm/module_map.js */
interface LoadCache extends Omit<Map<string, Dict<LoadCacheData>>, 'get' | 'set' | 'has'> {
  get(url: string, type?: string): LoadCacheData | undefined
  set(url: string, type?: string, job?: LoadCacheData): this
  has(url: string, type?: string): boolean
}

/** Minimal Node internal ModuleWrap surface used by HMR helpers. */
export interface ModuleWrap {
  url: string
  getNamespace(): object
}

/** Minimal Node internal ModuleJob surface used by HMR helpers. */
export interface ModuleJob {
  url: string
  module?: ModuleWrap
  importAttributes?: Dict
}

/** Node 22 cascaded-loader shape. */
export interface ModuleLoaderV1 {
  version: 'v1'
  loadCache: LoadCache
  import(specifier: string, parentURL: string, importAttributes: Dict): Promise<any>
}

/** Node 24 cascaded-loader shape. */
export interface ModuleLoaderV2 {
  version: 'v2'
  loadCache: LoadCache
  import(specifier: string, parentURL: string, importAttributes: Dict): Promise<any>
}

/** Supported Node internal ESM loader shapes. */
export type ModuleLoader = ModuleLoaderV1 | ModuleLoaderV2

/** Helpers for locating the current Node internal module loader. */
export namespace ModuleLoader {
  /**
   * GUI boots in the browser: there is no Node cascaded loader to discover.
   * @returns always `undefined` in this vendored copy.
   */
  export function fromInternal(): ModuleLoader | undefined {
    return undefined
  }
}
