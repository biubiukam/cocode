import { readFile, unlink } from "node:fs/promises"

const target = process.env.MAC_CLI_INSTALL_PATH?.trim() || "/usr/local/bin/cocode"
try {
	const contents = await readFile(target, "utf8")
	if (!contents.includes("cocode-desktop-cli-shim:v1")) {
		throw new Error(`Refusing to remove an unmanaged command: ${target}`)
	}
	await unlink(target)
	console.log(`Removed Desktop-managed CLI: ${target}`)
} catch (error) {
	if (isMissing(error)) {
		console.log(`Desktop CLI is already absent: ${target}`)
		process.exit(0)
	}
	throw error
}

function isMissing(error) {
	return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
}
