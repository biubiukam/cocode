export const localFilesChannels = {
	open: "local-files:open",
} as const

export interface OpenLocalFileRequest {
	readonly path: string
}

export interface LocalFilesApi {
	readonly open: (request: OpenLocalFileRequest) => Promise<void>
}
