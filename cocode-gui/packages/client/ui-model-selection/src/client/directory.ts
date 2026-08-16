/**
 * Per-session model directory: the ONE state both selection entries share.
 * The /model popup and the composer-seat selector load through the same
 * controller and submit through the same selectModel call, so the host stays
 * the single fact source and the store is one shared echo — a switch made in
 * either entry is what the other shows next.
 */
import type {
  IApiClient, ModelCatalogFailure, ModelProviderGroup, ModelSelection, SessionId, SessionModels,
} from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'

/** Hosted Cocode Nut route and the pre-rename alias. */
const COCODE_NUT_PROVIDER = 'cocode-nut'
const LEGACY_COCODE_NUT_PROVIDER = 'cocode-cloud'
/** Preferred Nut model; name/id matching "flash" is enough when the exact id is absent. */
const PREFERRED_NUT_MODEL_ID = 'deepseek-v4-flash'

function isFlashModel(model: { id: string; name: string }): boolean {
  return /flash/i.test(model.id) || /flash/i.test(model.name)
}

/**
 * Recover an unroutable session onto Cocode Nut Flash when that catalog is live.
 * Prefers the current `cocode-nut` id over the legacy alias, then the exact
 * Flash id, then any advertised model whose id or name contains "flash".
 */
function preferredNutFlash(groups: readonly ModelProviderGroup[]): ModelSelection | undefined {
  const group = groups.find(entry => entry.id === COCODE_NUT_PROVIDER && entry.models.length > 0)
    ?? groups.find(entry => entry.id === LEGACY_COCODE_NUT_PROVIDER && entry.models.length > 0)
  if (group === undefined) return undefined
  const model = group.models.find(entry => entry.id === PREFERRED_NUT_MODEL_ID)
    ?? group.models.find(isFlashModel)
  if (model === undefined) return undefined
  return {
    provider: group.id,
    model: model.id,
    ...model.reasoning?.defaultEffort === undefined
      ? {}
      : { reasoningEffort: model.reasoning.defaultEffort },
  }
}

/** Directory snapshot both entries render from. */
export interface ModelDirectoryState {
  /** Model selection the host reports for the next assembled step; null before the first load. */
  current: ModelSelection | null
  /**
   * Whether an adapter serves the current selection's provider, as the host reports
   * it — null before the first load, which is NOT the same as blocked. Read
   * this rather than "current matches no group": catalog membership is
   * advisory, so a route serving a model it stopped advertising is missing
   * from the groups yet perfectly usable.
   */
  routable: boolean | null
  /** Successfully loaded provider groups (last good load). */
  groups: readonly ModelProviderGroup[]
  /** Provider-local failures from the last load; usable groups stay usable. */
  failures: readonly ModelCatalogFailure[]
  /** Lifecycle of the in-flight operation. */
  status: 'idle' | 'loading' | 'ready' | 'selecting' | 'error'
  /** Whole-request or selection failure text; null when none. */
  error: string | null
}

/** One session's shared directory controller; disposed with the session scope. */
export class ModelDirectory {
  /** The shared snapshot both entries render from (uSES-safe store). */
  readonly store: SnapshotStore<ModelDirectoryState> = createSnapshotStore<ModelDirectoryState>({
    current: null, routable: null, groups: [], failures: [], status: 'idle', error: null,
  })

  /** Latest operation wins; an older response never overwrites a newer one. */
  private generation = 0
  private disposed = false

  /**
   * @param sessions - the session wire face (captured from the plugin's root connection).
   * @param sessionId - the owning session.
   * @param available - whether this session may use Agent-bound model RPCs.
   */
  constructor(
    private readonly sessions: Pick<IApiClient['sessions'], 'models' | 'selectModel'>,
    private readonly sessionId: SessionId,
    private readonly available: () => boolean,
  ) {}

  /**
   * Refresh the advisory directory (both entries call this on open).
   * Failure preserves the last good groups and current selection.
   * @returns the fresh directory value.
   */
  async load(): Promise<SessionModels> {
    this.assertAvailable()
    const generation = ++this.generation
    this.store.update((s) => { s.status = 'loading'; s.error = null })
    const { result } = await this.sessions.models({ sessionId: this.sessionId })
    if (this.disposed || generation !== this.generation) {
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      return result.value
    }
    if (!result.ok) {
      this.store.update((s) => { s.status = 'error'; s.error = `${result.error.code}: ${result.error.message}` })
      throw new Error(`session.models failed: ${result.error.code}: ${result.error.message}`)
    }
    const { current, routable, groups, failures } = result.value
    this.store.update((s) => {
      s.current = current
      s.routable = routable
      s.groups = groups
      s.failures = failures
      s.status = 'ready'
      s.error = null
    })
    // Composer blocks when the host cannot serve the current provider. If Nut
    // Flash is advertised, switch onto it instead of leaving the user stuck.
    const fallback = preferredNutFlash(groups)
    if (
      !routable
      && fallback !== undefined
      && (current.provider !== fallback.provider || current.model !== fallback.model)
    ) {
      try {
        await this.select(fallback)
      } catch {
        // Selection error stays on the store; this catalog remains usable.
      }
    }
    const snapshot = this.store.getSnapshot()
    return {
      current: snapshot.current ?? current,
      routable: snapshot.routable ?? routable,
      groups: [...snapshot.groups],
      failures: [...snapshot.failures],
    }
  }

  /**
   * Select the complete provider/model/reasoning selection (both entries submit through here). Success
   * updates the shared current; failure surfaces on the store and throws so
   * each entry's own retry surface engages.
   * @param selection - provider, provider-owned model id, and optional adapter-owned effort.
 */
  async select(selection: ModelSelection): Promise<void> {
    this.assertAvailable()
    const generation = ++this.generation
    this.store.update((s) => { s.status = 'selecting'; s.error = null })
    const { result } = await this.sessions.selectModel({
      sessionId: this.sessionId,
      provider: selection.provider,
      model: selection.model,
      ...selection.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: selection.reasoningEffort },
    })
    if (this.disposed || generation !== this.generation) {
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      return
    }
    if (!result.ok) {
      this.store.update((s) => { s.status = 'error'; s.error = `${result.error.code}: ${result.error.message}` })
      throw new Error(`session.selectModel failed: ${result.error.code}: ${result.error.message}`)
    }
    // The Host validated the route before accepting it, so a selection that
    // landed is by construction one it can serve.
    this.store.update((s) => {
      s.current = result.value.selected
      s.routable = true
      s.status = 'ready'
      s.error = null
    })
  }

  /**
   * Drop the previous Host generation's projection and repull it. Clearing
   * first prevents an unconsumed process-local selection from being displayed
   * while the restarted Host has restored the last logged model selection.
   */
  resetConnected(): void {
    if (this.disposed) return
    ++this.generation
    this.store.update((s) => {
      s.current = null
      s.routable = null
      s.groups = []
      s.failures = []
      s.status = 'idle'
      s.error = null
    })
    if (!this.available()) return
    void this.load().catch(() => { /* the next menu open remains the explicit retry surface */ })
  }

  /** Scope teardown: late settlements lose write access to the store. */
  dispose(): void {
    this.disposed = true
  }

  private assertAvailable(): void {
    if (!this.available()) {
      throw new Error('model selection is unavailable for addressed subagent sessions')
    }
  }
}
