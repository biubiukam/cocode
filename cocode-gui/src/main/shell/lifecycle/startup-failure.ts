export const STARTUP_FAILURE_PHASES = [
	"database.initialize",
	"dsh.host.acquire",
	"dsh.runtime.bootstrap",
	"application.services.register",
	"main.window.create",
	"unknown",
] as const

export type StartupFailurePhase = (typeof STARTUP_FAILURE_PHASES)[number]

export interface StartupFailureRecord {
	readonly phase: StartupFailurePhase
	readonly failureCode: string
	readonly userMessage: string
	readonly error: unknown
}

export class StartupFailureError extends Error {
	public readonly failure: StartupFailureRecord

	public constructor(failure: StartupFailureRecord) {
		super(failure.userMessage)
		this.name = "StartupFailureError"
		this.failure = failure
	}
}

const USER_MESSAGES: Readonly<Record<StartupFailurePhase, string>> = {
	"database.initialize": "Cocode 无法初始化本地数据。",
	"dsh.host.acquire": "Cocode 无法启动本地运行时。",
	"dsh.runtime.bootstrap": "Cocode 启动了本地运行时，但运行时没有准备好。",
	"application.services.register": "Cocode 无法完成桌面服务初始化。",
	"main.window.create": "Cocode 无法创建主窗口。",
	unknown: "Cocode 在启动阶段遇到异常。",
}

const PHASE_LABELS: Readonly<Record<StartupFailurePhase, string>> = {
	"database.initialize": "初始化本地数据库",
	"dsh.host.acquire": "启动本地运行时",
	"dsh.runtime.bootstrap": "检查本地运行时",
	"application.services.register": "初始化桌面服务",
	"main.window.create": "创建主窗口",
	unknown: "准备应用程序",
}

const PHASE_FAILURE_CODES: Readonly<Record<StartupFailurePhase, string>> = {
	"database.initialize": "DATABASE_INITIALIZE_FAILED",
	"dsh.host.acquire": "DSH_HOST_ACQUIRE_FAILED",
	"dsh.runtime.bootstrap": "DSH_RUNTIME_BOOTSTRAP_FAILED",
	"application.services.register": "APPLICATION_SERVICES_REGISTER_FAILED",
	"main.window.create": "MAIN_WINDOW_CREATE_FAILED",
	unknown: "STARTUP_FAILED",
}

export function createStartupFailure(
	phase: StartupFailurePhase,
	error: unknown,
): StartupFailureRecord {
	return {
		phase,
		failureCode: resolveFailureCode(error, PHASE_FAILURE_CODES[phase]),
		userMessage: USER_MESSAGES[phase],
		error,
	}
}

export function createStartupFailureError(
	phase: StartupFailurePhase,
	error: unknown,
): StartupFailureError {
	if (error instanceof StartupFailureError) return error
	return new StartupFailureError(createStartupFailure(phase, error))
}

export function runStartupPhase<T>(phase: StartupFailurePhase, operation: () => T): T {
	try {
		return operation()
	} catch (error) {
		throw createStartupFailureError(phase, error)
	}
}

export function resolveFailureCode(error: unknown, fallback = "STARTUP_FAILED"): string {
	if (typeof error !== "object" || error === null) return fallback
	const candidate = (error as { code?: unknown }).code
	if (typeof candidate !== "string") return fallback
	const normalized = candidate.trim().toUpperCase()
	return /^[A-Z][A-Z0-9_.-]{1,63}$/.test(normalized) ? normalized : fallback
}

export function isStartupFailurePhase(value: string): value is StartupFailurePhase {
	return (STARTUP_FAILURE_PHASES as readonly string[]).includes(value)
}

export function startupFailurePhaseLabel(phase: StartupFailurePhase): string {
	return PHASE_LABELS[phase]
}

export function createDshHostReadyAttributes(
	endpoint: string,
	hostPid: number | undefined,
): Readonly<Record<string, string | number>> {
	return {
		endpoint,
		...(Number.isInteger(hostPid) && (hostPid ?? 0) > 0 ? { hostPid } : {}),
	}
}

export function createStartupFailureInjector(
	configuredPhase: string | undefined,
): (phase: StartupFailurePhase) => void {
	const phase = configuredPhase?.trim()
	if (!phase) return () => undefined
	if (!isStartupFailurePhase(phase))
		throw new Error(`Unsupported startup failure injection phase: ${phase}`)
	return (currentPhase) => {
		if (currentPhase !== phase) return
		throw createStartupFailureError(
			currentPhase,
			Object.assign(new Error(`Injected startup failure for ${currentPhase}.`), {
				code: "TEST_STARTUP_FAILURE",
			}),
		)
	}
}
