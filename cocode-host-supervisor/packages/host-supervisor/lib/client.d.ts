import { type AcquireHostRequest, type HostDescriptor, type HostLease, type HostScope, type HostSupervisorClient } from './protocol.js';
export type SupervisorClientOptions = {
    nodeExecutable?: string;
    serviceEntry?: string;
    startupTimeoutMs?: number;
};
export declare class LocalHostSupervisorClient implements HostSupervisorClient {
    private readonly options;
    private readonly activeLeases;
    constructor(options?: SupervisorClientOptions);
    acquire(request: AcquireHostRequest): Promise<HostLease>;
    status(scope: HostScope): Promise<HostDescriptor | null>;
    release(leaseId: string): Promise<void>;
    private connectOrStart;
}
export declare function createHostSupervisorClient(options?: SupervisorClientOptions): HostSupervisorClient;
export declare function resolveNodeExecutable(): string;
