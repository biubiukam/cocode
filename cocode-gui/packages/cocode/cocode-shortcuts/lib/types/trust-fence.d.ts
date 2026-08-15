import type { IncomingHttpHeaders } from "node:http";
interface ApiTrustRequest {
    readonly headers: IncomingHttpHeaders;
}
export declare function isLoopbackHostname(hostname: string): boolean;
/**
 * Mirror the DSH gateway fence: loopback or an explicit trusted authority,
 * with cross-site browser requests rejected.
 */
export declare function isTrustedApiRequest(request: ApiTrustRequest, trustedHosts: readonly string[]): boolean;
export {};
