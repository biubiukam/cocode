export type LeaseRecord = {
    leaseId: string;
    clientKind: string;
    pid: number;
    createdAt: string;
    expiresAt: string;
};
export declare function isLeaseActive(record: LeaseRecord, now: number, processAlive: (pid: number) => boolean): boolean;
