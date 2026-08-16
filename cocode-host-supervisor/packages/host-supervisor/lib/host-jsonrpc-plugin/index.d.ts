import type { RuntimeContext } from './types.js';
export { TuiCompanionGateway } from './gateway.js';
export declare const name = "cocode-host-jsonrpc";
export declare const inject: string[];
export declare function apply(ctx: RuntimeContext, config?: {
    endpoint: string;
    protocolRevision?: string;
}): void;
