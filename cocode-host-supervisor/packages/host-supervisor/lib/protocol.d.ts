export type HostClientKind = 'gui' | 'desktop-tui' | 'standalone-tui';
export type HostServiceName = 'web' | 'jsonrpc';
export type RuntimeChannel = 'stable' | 'preview' | 'dev';
export interface HostScope {
    dshHome: string;
    profile: string;
    hostConfigFingerprint: string;
    runtimeChannel: RuntimeChannel;
}
export interface AcquireHostRequest {
    scope: HostScope;
    clientKind: HostClientKind;
    requiredServices: readonly HostServiceName[];
    requiredCapabilities?: readonly string[];
    minProtocolRevision: string;
}
export interface HostServiceEndpoint {
    service: HostServiceName;
    transport: 'tcp' | 'unix' | 'named-pipe';
    endpoint: string;
    protocolRevision: string;
    token?: string;
}
export interface HostDescriptor {
    schemaVersion: 1;
    hostKey: string;
    supervisorProtocolRevision: string;
    hostPid: number;
    supervisorPid: number;
    dshHome: string;
    profile: string;
    runtimeVersion: string;
    buildId?: string;
    hostProtocolRevision: string;
    hostConfigFingerprint: string;
    services: readonly HostServiceEndpoint[];
    capabilities: readonly string[];
    startedAt: string;
}
export interface HostLease {
    leaseId: string;
    expiresAt: string;
    logDirectory: string;
    descriptor: HostDescriptor;
    renew(): Promise<void>;
    release(): Promise<void>;
}
export interface HostSupervisorClient {
    acquire(request: AcquireHostRequest): Promise<HostLease>;
    status(scope: HostScope): Promise<HostDescriptor | null>;
    release(leaseId: string): Promise<void>;
}
export declare const SUPERVISOR_PROTOCOL_REVISION = "1.0";
export declare const SUPERVISOR_BUILD_REVISION = "runtime-plugin-resolution-v2";
export declare const HOST_PROTOCOL_REVISION = "1.0";
export declare const LEASE_TTL_MS = 30000;
export declare function canonicalizeScope(scope: HostScope): HostScope;
export declare function hostKey(scope: HostScope): string;
export declare function fingerprint(value: unknown): string;
export declare function leaseId(): string;
export declare function stableJson(value: unknown): string;
export declare function isHostDescriptorCompatible(descriptor: HostDescriptor, scope: HostScope, request: Pick<AcquireHostRequest, 'requiredServices' | 'requiredCapabilities' | 'minProtocolRevision'>): boolean;
