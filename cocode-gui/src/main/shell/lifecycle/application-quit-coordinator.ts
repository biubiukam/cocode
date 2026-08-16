export type QuitAttemptDecision = "start-cleanup" | "prevent" | "allow"

type QuitCompletion = () => void

export class ApplicationQuitCoordinator {
	private phase: "idle" | "cleaning" | "exiting" = "idle"
	private completion: QuitCompletion | null = null

	requestCompletion(completion: QuitCompletion): boolean {
		if (this.phase !== "idle" || this.completion !== null) return false
		this.completion = completion
		return true
	}

	handleQuitAttempt(): QuitAttemptDecision {
		if (this.phase === "exiting") return "allow"
		if (this.phase === "cleaning") return "prevent"
		this.phase = "cleaning"
		return "start-cleanup"
	}

	complete(defaultCompletion: QuitCompletion): QuitCompletion {
		if (this.phase !== "cleaning") {
			throw new Error("Application cleanup cannot complete before it starts.")
		}
		this.phase = "exiting"
		return this.completion ?? defaultCompletion
	}
}
