import { app } from "electron"
import { spawnSync } from "node:child_process"
import type { DesktopLogger } from "../logging/desktop-logger"
import type { ResourceSummaryDto } from "../../../contracts/ipc/diagnostics.contract"

const SAMPLE_INTERVAL_MS = 30_000
const WARN_PRIVATE_BYTES = 1024 * 1024 * 1024
const WARN_GROWTH_BYTES = 256 * 1024 * 1024
const MAX_SAMPLES = 120

export interface ResourceSample {
	readonly at: string
	readonly mainRssBytes: number
	readonly mainHeapUsedBytes: number
	readonly electronWorkingSetBytes: number
	readonly hostRssBytes?: number
	readonly processCount: number
}

/**
 * Low-rate resource telemetry.  It deliberately records sizes and counts,
 * never message contents, so a long-running GUI can prove whether memory is
 * growing without turning diagnostics into another unbounded buffer.
 */
export class ResourceMonitor {
	private timer: ReturnType<typeof setInterval> | undefined
	private hostPid: number | undefined
	private readonly samples: ResourceSample[] = []

	public constructor(private readonly logger: DesktopLogger) {}

	public start(): void {
		if (this.timer !== undefined) return
		void this.sample()
		this.timer = setInterval(() => {
			void this.sample()
		}, SAMPLE_INTERVAL_MS)
		this.timer.unref?.()
	}

	public setHostPid(pid: number | undefined): void {
		this.hostPid = Number.isInteger(pid) && (pid ?? 0) > 0 ? pid : undefined
	}

	public getRecentSamples(): readonly ResourceSample[] {
		return this.samples
	}

	public getSummary(): ResourceSummaryDto {
		const latest = this.samples.at(-1)
		return {
			sampleCount: this.samples.length,
			...(latest === undefined ? {} : { latest }),
		}
	}

	public dispose(): void {
		if (this.timer !== undefined) clearInterval(this.timer)
		this.timer = undefined
	}

	private async sample(): Promise<void> {
		try {
			const metrics = app.getAppMetrics() as Array<{
				memory?: { workingSetSize?: number; privateBytes?: number }
			}>
			const electronWorkingSetBytes = metrics.reduce(
				(total, metric) => total + (metric.memory?.workingSetSize ?? 0) * 1024,
				0,
			)
			const sample: ResourceSample = {
				at: new Date().toISOString(),
				mainRssBytes: process.memoryUsage().rss,
				mainHeapUsedBytes: process.memoryUsage().heapUsed,
				electronWorkingSetBytes,
				hostRssBytes: this.hostPid === undefined ? undefined : readRssBytes(this.hostPid),
				processCount: metrics.length,
			}
			this.samples.push(sample)
			while (this.samples.length > MAX_SAMPLES) this.samples.shift()
			this.logger.log("info", "resource.sample", {
				attributes: {
					mainRssBytes: sample.mainRssBytes,
					mainHeapUsedBytes: sample.mainHeapUsedBytes,
					electronWorkingSetBytes: sample.electronWorkingSetBytes,
					...(sample.hostRssBytes === undefined
						? {}
						: { hostRssBytes: sample.hostRssBytes }),
					processCount: sample.processCount,
				},
			})
			this.warnIfNeeded(sample)
		} catch (error) {
			this.logger.log("warn", "resource.sample.failed", { error })
		}
	}

	private warnIfNeeded(sample: ResourceSample): void {
		if (
			sample.mainRssBytes >= WARN_PRIVATE_BYTES ||
			sample.electronWorkingSetBytes >= WARN_PRIVATE_BYTES
		) {
			this.logger.log("warn", "resource.memory.threshold", {
				attributes: {
					mainRssBytes: sample.mainRssBytes,
					electronWorkingSetBytes: sample.electronWorkingSetBytes,
					thresholdBytes: WARN_PRIVATE_BYTES,
				},
			})
		}
		const previous = this.samples.at(-2)
		if (previous === undefined) return
		const growth = sample.electronWorkingSetBytes - previous.electronWorkingSetBytes
		if (growth >= WARN_GROWTH_BYTES) {
			this.logger.log("warn", "resource.memory.growth", {
				attributes: { growthBytes: growth, intervalMs: SAMPLE_INTERVAL_MS },
			})
		}
	}
}

function readRssBytes(pid: number): number | undefined {
	if (process.platform === "win32") return undefined
	const result = spawnSync("ps", ["-o", "rss=", "-p", String(pid)], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	})
	if (result.status !== 0) return undefined
	const kib = Number.parseInt(result.stdout.trim(), 10)
	return Number.isFinite(kib) ? kib * 1024 : undefined
}
