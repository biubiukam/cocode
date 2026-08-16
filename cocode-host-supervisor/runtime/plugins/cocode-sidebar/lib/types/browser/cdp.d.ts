/**
 * A structural mirror of the CDP session face this plugin drives, plus the
 * response shapes it reads.
 *
 * Playwright types `CDPSession.send` against its bundled protocol union, so a
 * generic string method never type-checks through it. Rather than thread that
 * union everywhere, the session is cast to this mirror once at creation (the
 * same boundary-cast pattern the plugin already uses for `ws` upgrades) and
 * every command below declares only the fields actually consumed.
 */
/** The Chrome DevTools Protocol session face used by the browser tab. */
export interface CdpSession {
    send(method: string, params?: Record<string, unknown>): Promise<unknown>;
    on(event: string, handler: (payload: never) => void): unknown;
    off(event: string, handler: (payload: never) => void): unknown;
    detach(): Promise<void>;
}
/** One screencast frame pushed by `Page.screencastFrame`. */
export interface ScreencastFrame {
    data: string;
    sessionId: number;
    metadata: {
        offsetTop: number;
        pageScaleFactor: number;
        deviceWidth: number;
        deviceHeight: number;
        scrollOffsetX: number;
        scrollOffsetY: number;
    };
}
/** One node of `Accessibility.getFullAXTree`. */
export interface AxNode {
    nodeId: string;
    ignored?: boolean;
    role?: {
        value?: string;
    };
    name?: {
        value?: string;
    };
    value?: {
        value?: string | number;
    };
    description?: {
        value?: string;
    };
    properties?: Array<{
        name: string;
        value?: {
            value?: unknown;
        };
    }>;
    childIds?: string[];
    backendDOMNodeId?: number;
}
/** Response of `Accessibility.getFullAXTree`. */
export interface AxTreeResponse {
    nodes: AxNode[];
}
/** Response of `DOMSnapshot.captureSnapshot` (only the slices read here). */
export interface DomSnapshotResponse {
    documents: Array<{
        nodes: {
            backendNodeId?: number[];
        };
        layout: {
            nodeIndex: number[];
            bounds: number[][];
        };
    }>;
}
/** Response of `Page.getLayoutMetrics`. */
export interface LayoutMetricsResponse {
    cssVisualViewport?: {
        pageX: number;
        pageY: number;
        clientWidth: number;
        clientHeight: number;
    };
    cssLayoutViewport: {
        pageX: number;
        pageY: number;
        clientWidth: number;
        clientHeight: number;
    };
}
/** Response of `DOM.getBoxModel`; the content quad is `[x1,y1,x2,y2,x3,y3,x4,y4]`. */
export interface BoxModelResponse {
    model: {
        content: number[];
        width: number;
        height: number;
    };
}
/** Response of `DOM.describeNode` (used to detect password/file inputs). */
export interface DescribeNodeResponse {
    node: {
        nodeName?: string;
        attributes?: string[];
        nodeId?: number;
    };
}
/** Response of `DOM.resolveNode`. */
export interface ResolveNodeResponse {
    object: {
        objectId?: string;
    };
}
/** A rectangle in CSS document coordinates. */
export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}
/** Center point of a rect, clamped to stay strictly inside it. */
export declare function centerOf(rect: Rect): {
    x: number;
    y: number;
};
/** Convert a CDP content quad to its bounding rect. */
export declare function quadToRect(quad: readonly number[]): Rect;
/** Whether two rects overlap on both axes. */
export declare function intersects(a: Rect, b: Rect): boolean;
/** Read one attribute out of CDP's flat `[name, value, ...]` attribute array. */
export declare function attributeOf(attributes: readonly string[] | undefined, name: string): string | undefined;
