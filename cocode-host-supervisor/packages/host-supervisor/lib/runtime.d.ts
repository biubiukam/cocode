import { type HostRuntimeEnv, type HostScope } from './protocol.js';
export type RuntimeSlot = {
    root: string;
    entry: string;
    version: string;
    buildId?: string;
    patch: string;
    jsonRpcEndpoint: string;
};
export type RuntimePluginEntry = {
    name: string;
    entry: string;
};
export declare function mergeHostRuntimeEnv(baseEnv: NodeJS.ProcessEnv, runtimeEnv: HostRuntimeEnv | undefined, dshHome: string): NodeJS.ProcessEnv;
type RuntimePackageManifest = {
    name?: string;
    version?: string;
    dependencies?: Record<string, string>;
};
export declare function resolveDshPackage(): {
    root: string;
    entry: string;
    version: string;
    buildId?: string;
};
export declare function prepareRuntimeSlot(scope: HostScope, jsonRpcEndpoint: string, pluginPath: string): RuntimeSlot;
export declare function addRuntimePluginDependencies(manifest: RuntimePackageManifest, pluginManifests: readonly RuntimePackageManifest[]): RuntimePackageManifest;
/**
 * Render the DSH overlay patch. Cocode plugins must be registered by their
 * package name so DSH can resolve each package manifest and its `dsh.client`
 * declaration while constructing the Web boot manifest.
 */
export declare function createRuntimePatch(jsonRpcPluginUrl: string, jsonRpcEndpoint: string, pluginEntries: readonly RuntimePluginEntry[]): string;
export {};
