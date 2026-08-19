export const accountChannels = {
	snapshot: "account:snapshot",
	signIn: "account:sign-in",
	cancelSignIn: "account:cancel-sign-in",
	signOut: "account:sign-out",
	changed: "account:changed",
	messageFeedbackList: "account:message-feedback-list",
	messageFeedbackPut: "account:message-feedback-put",
	messageFeedbackDelete: "account:message-feedback-delete",
} as const

export type AccountPhase = "signed-out" | "signing-in" | "provisioning" | "signed-in" | "error"

export type AccountCloudState = {
	readonly status: "absent" | "ready" | "conflict" | "error"
	readonly providerId: "cocode-nut"
}

export type AccountProfile = {
	readonly displayName: string
	readonly email?: string
	readonly avatarUrl?: string
}

export type AccountUsage = {
	readonly plan?: string
	readonly fiveHour?: number
	readonly week?: number
	readonly month?: number
	readonly currentPeriodEnd?: string
	readonly fiveHourResetAt?: string
	readonly weekResetAt?: string
	readonly syncedAt?: string
	readonly error?: string
}

export type AccountSnapshot = {
	readonly phase: AccountPhase
	readonly profile: AccountProfile | null
	readonly cloud: AccountCloudState
	readonly usage?: AccountUsage
	readonly error?: {
		readonly code: string
		readonly message: string
	}
}

export type AccountMessageFeedback = {
	readonly session_id: string
	readonly message_id: string
	readonly rating: "positive" | "negative"
	readonly note?: string | null
	readonly created_at?: string
	readonly updated_at?: string
}

export type AccountMessageFeedbackList = { readonly data: readonly AccountMessageFeedback[] }

export type AccountApi = {
	readonly snapshot: () => Promise<AccountSnapshot>
	readonly signIn: () => Promise<AccountSnapshot>
	/** Abandon a sign-in that is still waiting on the browser. */
	readonly cancelSignIn: () => Promise<void>
	readonly signOut: () => Promise<void>
	readonly onChanged: (listener: (snapshot: AccountSnapshot) => void) => () => void
	readonly messageFeedback: {
		readonly list: (sessionId: string) => Promise<AccountMessageFeedbackList>
		readonly put: (input: {
			sessionId: string
			messageId: string
			rating: "positive" | "negative"
			note?: string
		}) => Promise<AccountMessageFeedback>
		readonly delete: (
			sessionId: string,
			messageId: string,
		) => Promise<{ readonly deleted: true }>
	}
}
