const { KEYTAR_SERVICE } = require("./windows-sign-service.cjs")

const target = process.env.WINDOWS_SIGN_CREDENTIAL_TARGET?.trim() || "cocode/windows-sign"

function loadKeytar() {
	try {
		return require("keytar")
	} catch (error) {
		throw new Error(`Windows Credential Manager dependency is unavailable: ${error.message}`)
	}
}

function promptSecret(question) {
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		throw new Error("windows-sign:configure requires an interactive terminal.")
	}
	return new Promise((resolve, reject) => {
		const stdin = process.stdin
		const stdout = process.stdout
		let value = ""
		const cleanup = () => {
			stdin.setRawMode?.(false)
			stdin.pause()
			stdin.removeListener("data", onData)
			stdin.removeListener("error", onError)
			stdout.write("\n")
		}
		const onError = (error) => {
			cleanup()
			reject(error)
		}
		const onData = (chunk) => {
			for (const character of String(chunk)) {
				if (character === "\u0003") {
					cleanup()
					resolve("")
					return
				}
				if (character === "\r" || character === "\n") {
					cleanup()
					resolve(value)
					return
				}
				if (character === "\u0008" || character === "\u007f") {
					value = value.slice(0, -1)
					continue
				}
				value += character
			}
		}
		stdout.write(question)
		stdin.setRawMode(true)
		stdin.setEncoding("utf8")
		stdin.resume()
		stdin.on("data", onData)
		stdin.on("error", onError)
	})
}

async function main() {
	const command = process.argv[2] || "status"
	if (!["configure", "clear", "status", "check"].includes(command))
		throw new Error(`Unknown windows-sign command: ${command}`)
	if (process.platform !== "win32")
		throw new Error("Windows signing credentials can only be managed on Windows.")
	if (command === "configure") {
		const keytar = loadKeytar()
		const value = await promptSecret("SIGN_CERTIFICATE (input hidden): ")
		if (!value) throw new Error("No signing credential was provided.")
		await keytar.setPassword(KEYTAR_SERVICE, target, value)
		console.log(`Windows signing credential stored for ${target}.`)
		return
	}
	if (command === "clear") {
		const keytar = loadKeytar()
		const deleted = await keytar.deletePassword(KEYTAR_SERVICE, target)
		console.log(
			deleted
				? `Windows signing credential removed for ${target}.`
				: `No credential was stored for ${target}.`,
		)
		return
	}
	if (command === "status" || command === "check") {
		const configured = process.env.SIGN_CERTIFICATE?.trim()
		const value = configured || (await loadKeytar().getPassword(KEYTAR_SERVICE, target))
		if (!value) throw new Error(`Windows signing credential is not configured for ${target}.`)
		if (command === "status")
			console.log(`Windows signing credential is configured for ${target}.`)
		return
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error))
	process.exitCode = 1
})
