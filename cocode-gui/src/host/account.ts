/**
 * Cocode account snapshot as the renderer is allowed to see it.
 * Tokens never appear here.
 */

export type AccountProfile = {
  displayName: string
  email?: string
  avatarUrl?: string
}

/** Material the renderer needs once to write the harness `cocode-cloud` route. */
export type CloudProvision = {
  origin: string
  apiKey: string
  models: { id: string; name: string }[]
}

export type AccountHostApi = {
  snapshot(): Promise<AccountProfile | null>
  signIn(): Promise<void>
  signOut(): Promise<void>
  onChange(listener: (profile: AccountProfile | null) => void): () => void
  /** Returns the one-shot cloud key and catalog; the caller must not persist it. */
  cloudProvision(): Promise<CloudProvision | null>
}
