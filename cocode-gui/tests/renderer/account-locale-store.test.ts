import assert from "node:assert/strict"
import test from "node:test"
import {
	createAccountLocaleStore,
	type AccountLocaleSnapshot,
} from "../../packages/cocode/cocode-account/src/client/account-locale-store.ts"

test("account locale store preserves the locale service receiver", () => {
	class LocaleService {
		private snapshot: AccountLocaleSnapshot = { active: "en" }
		private listeners = new Set<() => void>()

		getSnapshot(): AccountLocaleSnapshot {
			return this.snapshot
		}

		subscribe(listener: () => void): () => void {
			this.listeners.add(listener)
			return () => this.listeners.delete(listener)
		}
	}

	const store = createAccountLocaleStore(new LocaleService())
	const detachedGetSnapshot = store.getSnapshot
	const detachedSubscribe = store.subscribe

	assert.deepEqual(detachedGetSnapshot(), { active: "en" })
	assert.doesNotThrow(() => detachedSubscribe(() => {}))
})

test("account locale store falls back safely when locale is unavailable", () => {
	const store = createAccountLocaleStore()

	assert.deepEqual(store.getSnapshot(), { active: "zh" })
	assert.doesNotThrow(() => store.subscribe(() => {})())
})
