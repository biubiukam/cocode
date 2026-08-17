import { app, dialog, shell } from "electron"
import { randomUUID } from "node:crypto"
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs"
import * as path from "pathe"
import { create as createTar } from "tar"
import type {
	DiagnosticsBundleDto,
	DiagnosticsStatusDto,
	TemporaryDebugRequestDto,
} from "../../../contracts/ipc/diagnostics.contract"
import { DesktopLogger } from "../logging/desktop-logger"
import { sanitizePath } from "../logging/redaction"
import type { ResourceMonitor } from "./resource-monitor"

export interface DiagnosticsServiceOptions {
	readonly logger: DesktopLogger
	readonly hostLogDirectory?: string
	readonly buildId?: string
	readonly resources?: ResourceMonitor
}

export class DiagnosticsService {
	private readonly logger: DesktopLogger
	private readonly logDirectory: string
	private readonly diagnosticsDirectory: string
	private hostLogDirectory: string | undefined
	private readonly buildId: string | undefined
	private readonly resources: ResourceMonitor | undefined

	public constructor(options: DiagnosticsServiceOptions) {
		this.logger = options.logger
		this.logDirectory = app.getPath("logs")
		this.diagnosticsDirectory = path.join(this.logDirectory, "diagnostics")
		this.hostLogDirectory = options.hostLogDirectory
		this.buildId = options.buildId
		this.resources = options.resources
		mkdirSync(this.diagnosticsDirectory, { recursive: true, mode: 0o700 })
	}

	public setHostLogDirectory(directory: string | undefined): void {
		this.hostLogDirectory = directory
	}

	public async openLogFolder(): Promise<void> {
		await shell.openPath(this.logDirectory)
		this.logger.log("info", "diagnostics.log-folder.opened", { audit: true })
	}

	public getStatus(): DiagnosticsStatusDto {
		const status = this.logger.getStatus(
			countCrashDumps(),
			directoryBytes(this.hostLogDirectory),
		)
		return {
			...status,
			...(this.resources === undefined ? {} : { resources: this.resources.getSummary() }),
		}
	}

	public async exportBundle(): Promise<DiagnosticsBundleDto> {
		const defaultName = `cocode-diagnostics-${new Date()
			.toISOString()
			.replace(/[:.]/g, "-")}.tgz`
		const selected = await dialog.showSaveDialog({
			title: "导出 Cocode 诊断包",
			defaultPath: path.join(this.diagnosticsDirectory, defaultName),
			filters: [{ name: "Gzip Tar Archive", extensions: ["tgz"] }],
		})
		if (selected.canceled || selected.filePath === undefined) {
			this.logger.log("info", "diagnostics.bundle.cancelled", { audit: true })
			return { cancelled: true }
		}

		const includeCrashDumps = await this.confirmCrashDumpExport()
		const stagingDirectory = path.join(this.diagnosticsDirectory, `bundle-${randomUUID()}`)
		mkdirSync(stagingDirectory, { recursive: true, mode: 0o700 })
		try {
			copyDirectory(path.join(this.logDirectory, "app"), path.join(stagingDirectory, "app"))
			copyDirectory(
				path.join(this.logDirectory, "audit"),
				path.join(stagingDirectory, "audit"),
			)
			if (this.hostLogDirectory !== undefined)
				copyDirectory(this.hostLogDirectory, path.join(stagingDirectory, "host"))
			if (includeCrashDumps) copyCrashDumps(path.join(stagingDirectory, "crashDumps"))
			this.writeResourceTelemetry(stagingDirectory)
			this.writeEnvironment(stagingDirectory)
			this.writeHostDescriptor(stagingDirectory)
			this.writeManifest(stagingDirectory)
			await createTar({ gzip: true, file: selected.filePath, cwd: stagingDirectory }, ["."])
			const bytes = statSync(selected.filePath).size
			this.logger.log("info", "diagnostics.bundle.exported", {
				audit: true,
				attributes: { bytes },
			})
			return { cancelled: false, fileName: path.basename(selected.filePath), bytes }
		} catch (error) {
			this.logger.log("error", "diagnostics.bundle.failed", { audit: true, error })
			throw error
		} finally {
			rmSync(stagingDirectory, { recursive: true, force: true })
		}
	}

	public clearLogs(): void {
		try {
			this.logger.clear()
		} catch (error) {
			this.logger.log("warn", "diagnostics.logs.clear-current-failed", { error, audit: true })
		}
		clearRotatedFiles(path.join(this.logDirectory, "app"), this.logger)
		clearRotatedFiles(path.join(this.logDirectory, "audit"), this.logger)
		if (this.hostLogDirectory !== undefined)
			clearRotatedFiles(this.hostLogDirectory, this.logger)
		this.logger.log("info", "diagnostics.logs.cleared", { audit: true })
	}

	public enableTemporaryDebug(request: TemporaryDebugRequestDto): { enabledUntil: string } {
		const enabledUntil = this.logger.enableTemporaryDebug(request.durationMinutes)
		this.logger.log("info", "diagnostics.debug.enabled", {
			audit: true,
			attributes: { durationMinutes: request.durationMinutes },
		})
		return { enabledUntil: enabledUntil.toISOString() }
	}

	private writeManifest(stagingDirectory: string): void {
		const manifest = {
			generatedAt: new Date().toISOString(),
			appVersion: app.getVersion(),
			buildId: this.buildId,
			platform: process.platform,
			architecture: process.arch,
			appRunId: this.logger.appRunIdValue,
			files: listFiles(stagingDirectory),
		}
		writeFileSync(
			path.join(stagingDirectory, "manifest.json"),
			`${JSON.stringify(manifest, null, 2)}\n`,
			{ mode: 0o600 },
		)
	}

	private writeEnvironment(stagingDirectory: string): void {
		writeFileSync(
			path.join(stagingDirectory, "environment.json"),
			`${JSON.stringify(
				{
					appVersion: app.getVersion(),
					platform: process.platform,
					architecture: process.arch,
					packaged: app.isPackaged,
					nodeVersion: process.versions.node,
					electronVersion: process.versions.electron,
				},
				null,
				2,
			)}\n`,
			{ mode: 0o600 },
		)
	}

	private writeHostDescriptor(stagingDirectory: string): void {
		if (this.hostLogDirectory === undefined) return
		const descriptorPath = path.join(path.dirname(this.hostLogDirectory), "..", "host.json")
		if (!existsSync(descriptorPath)) return
		try {
			const descriptor = JSON.parse(readFileSync(descriptorPath, "utf8")) as Record<
				string,
				unknown
			>
			const safe = {
				schemaVersion: descriptor.schemaVersion,
				hostKey: descriptor.hostKey,
				supervisorProtocolRevision: descriptor.supervisorProtocolRevision,
				hostPid: descriptor.hostPid,
				supervisorPid: descriptor.supervisorPid,
				runtimeVersion: descriptor.runtimeVersion,
				buildId: descriptor.buildId,
				hostProtocolRevision: descriptor.hostProtocolRevision,
				capabilities: descriptor.capabilities,
				startedAt: descriptor.startedAt,
				services: Array.isArray(descriptor.services)
					? descriptor.services.map((service) => {
							const value = service as Record<string, unknown>
							return {
								service: value.service,
								transport: value.transport,
								protocolRevision: value.protocolRevision,
							}
					  })
					: [],
			}
			writeFileSync(
				path.join(stagingDirectory, "host-descriptor-redacted.json"),
				`${JSON.stringify(safe, null, 2)}\n`,
				{ mode: 0o600 },
			)
		} catch (error) {
			this.logger.log("warn", "diagnostics.host-descriptor.unavailable", {
				error,
				audit: true,
			})
		}
	}

	private writeResourceTelemetry(stagingDirectory: string): void {
		if (this.resources === undefined) return
		const samples = this.resources.getRecentSamples()
		writeFileSync(
			path.join(stagingDirectory, "resource-summary.json"),
			`${JSON.stringify(this.resources.getSummary(), null, 2)}\n`,
			{ mode: 0o600 },
		)
		writeFileSync(
			path.join(stagingDirectory, "resource-samples.ndjson"),
			samples.length === 0
				? ""
				: `${samples.map((sample) => JSON.stringify(sample)).join("\n")}\n`,
			{ mode: 0o600 },
		)
	}

	private async confirmCrashDumpExport(): Promise<boolean> {
		if (countCrashDumps() === 0) return false
		const result = await dialog.showMessageBox({
			type: "warning",
			buttons: ["不包含崩溃文件", "包含崩溃文件"],
			defaultId: 0,
			cancelId: 0,
			title: "导出崩溃文件",
			message: "诊断包中是否包含本地 Electron 崩溃文件？",
			detail: "崩溃文件可能包含系统和运行时诊断信息，仅在提交给技术支持时选择包含。",
		})
		return result.response === 1
	}
}

export function createDiagnosticsService(options: DiagnosticsServiceOptions): DiagnosticsService {
	return new DiagnosticsService(options)
}

function copyDirectory(source: string, destination: string): void {
	if (!existsSync(source)) return
	mkdirSync(destination, { recursive: true, mode: 0o700 })
	for (const entry of readdirSync(source, { withFileTypes: true })) {
		const sourcePath = path.join(source, entry.name)
		const destinationPath = path.join(destination, entry.name)
		if (entry.isDirectory()) copyDirectory(sourcePath, destinationPath)
		else if (entry.isFile()) {
			const contents = readFileSync(sourcePath)
			writeFileSync(destinationPath, contents, { mode: 0o600 })
		}
	}
}

function copyCrashDumps(destination: string): void {
	const source = app.getPath("crashDumps")
	if (!existsSync(source)) return
	copyDirectory(source, destination)
}

function countCrashDumps(): number {
	const source = app.getPath("crashDumps")
	if (!existsSync(source)) return 0
	return readdirSync(source, { withFileTypes: true }).filter((entry) => entry.isFile()).length
}

function clearRotatedFiles(directory: string, logger: DesktopLogger): void {
	if (!existsSync(directory)) return
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		if (!entry.isFile() || entry.name === "current.jsonl") continue
		try {
			rmSync(path.join(directory, entry.name), { force: true })
		} catch (error) {
			logger.log("warn", "diagnostics.logs.clear-rotated-failed", {
				error,
				attributes: { fileType: entry.name.endsWith(".gz") ? "compressed" : "jsonl" },
				audit: true,
			})
		}
	}
}

function directoryBytes(directory: string | undefined): number {
	if (directory === undefined || !existsSync(directory)) return 0
	return readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
		const file = path.join(directory, entry.name)
		try {
			return total + (entry.isDirectory() ? directoryBytes(file) : statSync(file).size)
		} catch {
			return total
		}
	}, 0)
}

function listFiles(root: string): string[] {
	if (!existsSync(root)) return []
	return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
		const relative = sanitizePath(path.relative(root, path.join(root, entry.name)))
		return entry.isDirectory()
			? listFiles(path.join(root, entry.name)).map((child) => path.join(relative, child))
			: [relative]
	})
}
