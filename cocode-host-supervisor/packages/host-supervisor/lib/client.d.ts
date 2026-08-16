import { type AcquireHostRequest, type HostDescriptor, type HostLease, type HostScope, type HostSupervisorClient } from './protocol.js';
export type SupervisorClientOptions = {
    nodeExecutable?: string;
    serviceEntry?: string;
    startupTimeoutMs?: number;
};
type SupervisorDoctor = {
    supervisorBuildRevision?: string;
    leaseCount?: number;
    pid?: number;
    descriptor?: HostDescriptor | null;
};
/** Keep an active compatible Host usable while its supervisor is being upgraded. */
export declare function canReuseOlderSupervisor(request: AcquireHostRequest, doctor: SupervisorDoctor): boolean;
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
export {};
