export interface BootSeams {
	readonly loadBundle?: (url: string) => Promise<void>
}

export declare class AppWebEntry {
	constructor(element: HTMLElement, seams?: BootSeams)
	run(): Promise<void>
	dispose(): void
}
