export interface AccountLocaleSnapshot {
  readonly active: string
}

export interface AccountLocale {
  subscribe(listener: () => void): () => void
  getSnapshot(): AccountLocaleSnapshot
}

export interface AccountLocaleStore {
  readonly subscribe: (listener: () => void) => () => void
  readonly getSnapshot: () => AccountLocaleSnapshot
}

const EMPTY_LOCALE_SNAPSHOT: AccountLocaleSnapshot = { active: "zh" }

/**
 * Adapt the locale service to React's external-store contract without
 * detaching its prototype methods from the service instance.
 */
export function createAccountLocaleStore(locale?: AccountLocale): AccountLocaleStore {
  if (locale === undefined) {
    return {
      subscribe: () => () => {},
      getSnapshot: () => EMPTY_LOCALE_SNAPSHOT,
    }
  }

  return {
    subscribe: listener => locale.subscribe(listener),
    getSnapshot: () => locale.getSnapshot(),
  }
}
