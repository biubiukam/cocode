import { type ExternalDshReadSource } from "@cocode-agency/host-supervisor"
import type {
	ExternalAttachmentRequestDto,
	ExternalCatalogDto,
	ExternalDshChangeDto,
	ExternalDshStatusDto,
	ExternalDshConflictStatusDto,
	ExternalSessionHistoryDto,
	ExternalSessionHistoryRequestDto,
} from "../../../../contracts/ipc/external-dsh.contract"

export class SharedDshCatalog {
	private readonly source: ExternalDshReadSource

	public constructor(source: ExternalDshReadSource) {
		this.source = source
	}

	public async status(): Promise<ExternalDshStatusDto> {
		return this.source.getStatus()
	}

	public async catalog(): Promise<ExternalCatalogDto> {
		const [status, sessions, workspaces] = await Promise.all([
			this.source.getStatus(),
			this.source.listSessions().catch(() => []),
			this.source
				.listWorkspaces()
				.then((value) => value.workspaces)
				.catch(() => []),
		])
		return {
			source: "shared-dsh",
			canMutate: status.canMutate,
			concurrency: "no-concurrent-writes",
			status,
			sessions,
			workspaces,
		}
	}

	public sessionHistory(
		request: ExternalSessionHistoryRequestDto,
	): Promise<ExternalSessionHistoryDto> {
		return this.source.readSessionHistory(request.sessionId, {
			beforeSeq: request.beforeSeq,
			limit: request.limit,
		})
	}

	public attachment(request: ExternalAttachmentRequestDto) {
		return this.source.readAttachment?.(request)
	}

	public async conflictStatus(request: {
		kind: "session" | "workspace"
		id?: string
		expectedRevision: string
	}): Promise<ExternalDshConflictStatusDto> {
		if (
			request.kind === "session" &&
			request.id !== undefined &&
			this.source.checkSessionRevision !== undefined
		) {
			return this.source.checkSessionRevision(request.id, request.expectedRevision)
		}
		if (request.kind === "workspace" && this.source.checkWorkspaceRevision !== undefined) {
			return this.source.checkWorkspaceRevision(request.expectedRevision)
		}
		return {
			source: "shared-dsh",
			kind: request.kind,
			...(request.id === undefined ? {} : { id: request.id }),
			state: "unavailable",
			expectedRevision: request.expectedRevision,
		}
	}

	public subscribe(listener: (change: ExternalDshChangeDto) => void): () => void {
		return this.source.subscribe((change) =>
			listener({
				source: "shared-dsh",
				canMutate: true,
				concurrency: "no-concurrent-writes",
				...change,
			}),
		)
	}

	public async dispose(): Promise<void> {
		await this.source.dispose()
	}
}

/** @deprecated Use SharedDshCatalog. */
export { SharedDshCatalog as ExternalDshCatalog }
