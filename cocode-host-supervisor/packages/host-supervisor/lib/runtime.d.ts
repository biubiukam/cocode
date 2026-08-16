import { type HostScope } from './protocol.js';
export type RuntimeSlot = {
    root: string;
    entry: string;
    version: string;
    buildId?: string;
    patch: string;
    jsonRpcEndpoint: string;
};
export declare function resolveDshPackage(): {
    root: string;
    entry: string;
    version: string;
    buildId?: string;
};
export declare function prepareRuntimeSlot(scope: HostScope, jsonRpcEndpoint: string, pluginPath: string): RuntimeSlot;
