export const name = "dsh-desktop-hmr"

export function apply(ctx) {
	ctx.provide("hmr", {
		registerConfig: async () => async () => Promise.resolve(),
	})
}
