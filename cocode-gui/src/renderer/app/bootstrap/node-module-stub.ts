export function createRequire(): never {
	throw new Error("node:module is unavailable in the Renderer bundle")
}
