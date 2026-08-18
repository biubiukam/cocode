import {
  createExternalDshReadSource,
  resolveCocodeDshHome,
  resolveCocodeHome,
  type ExternalDshReadSource,
} from '@cocode/host-supervisor'

/** Filesystem reader for the shared DSH catalog; mutations still go through the Cocode Host. */
export function createExternalDshCatalog(options: {
  sourceHome?: string
  enableProjectionCache?: boolean
  enableAttachments?: boolean
} = {}): ExternalDshReadSource {
  return createExternalDshReadSource({
    sourceHome: options.sourceHome ?? resolveCocodeDshHome(),
    runtimeHome: resolveCocodeHome(),
    enableProjectionCache: options.enableProjectionCache,
    enableAttachments: options.enableAttachments,
  })
}
