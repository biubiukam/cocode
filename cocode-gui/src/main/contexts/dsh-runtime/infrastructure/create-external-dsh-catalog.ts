import {
	createExternalDshReadSource,
	resolveCocodeDshHome,
	resolveCocodeHome,
} from "@cocode-agency/host-supervisor"
import { SharedDshCatalog } from "./external-dsh-catalog"

/** Compose the Desktop-only reader without exposing filesystem access to Renderer. */
export function createSharedDshCatalog(): SharedDshCatalog {
	return new SharedDshCatalog(
		createExternalDshReadSource({
			sourceHome: resolveCocodeDshHome(),
			runtimeHome: resolveCocodeHome(),
			enableAttachments: process.env.COCODE_DSH_EXTERNAL_ATTACHMENTS === "1",
		}),
	)
}

/** @deprecated Use createSharedDshCatalog. */
export const createExternalDshCatalog = createSharedDshCatalog
