const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

export class SessionId {
	private constructor(public readonly value: string) {}

	public static create(value: string): SessionId {
		if (!SESSION_ID_PATTERN.test(value)) {
			throw new Error(
				"Session id must contain only letters, numbers, dashes, or underscores.",
			)
		}

		return new SessionId(value)
	}
}
