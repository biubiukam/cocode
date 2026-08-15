export const accountChannels = {
	snapshot: "account:snapshot",
	signIn: "account:sign-in",
	signOut: "account:sign-out",
	changed: "account:changed",
} as const

export type AccountPhase = "signed-out" | "signing-in" | "provisioning" | "signed-in" | "error"

export type AccountCloudState = {
	readonly status: "absent" | "ready" | "conflict" | "error"
	readonly providerId: "cocode-cloud"
}

export type AccountProfile = {
	readonly displayName: string
	readonly email?: string
	readonly avatarUrl?: string
}

export type AccountSnapshot = {
	readonly phase: AccountPhase
	readonly profile: AccountProfile | null
	readonly cloud: AccountCloudState
	readonly error?: {
		readonly code: string
		readonly message: string
	}
}

export type AccountApi = {
	readonly snapshot: () => Promise<AccountSnapshot>
	readonly signIn: () => Promise<AccountSnapshot>
	readonly signOut: () => Promise<void>
	readonly onChanged: (listener: (snapshot: AccountSnapshot) => void) => () => void
}
