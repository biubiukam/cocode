const { existsSync } = require("node:fs")
const path = require("node:path")
const {
	shouldSubmitWindowsFileForSigning,
	signFile,
} = require("./windows-sign-service.cjs")

function createWindowsSigner(sign = signFile) {
	return async function windowsSigner(configuration) {
		if (!configuration?.path) {
			throw new Error("electron-builder signing task is missing configuration.path")
		}
		if (!path.isAbsolute(configuration.path)) {
			throw new Error("electron-builder signing task requires an absolute path")
		}
		if (!existsSync(configuration.path)) {
			throw new Error(`electron-builder signing file does not exist: ${configuration.path}`)
		}
		if (!shouldSubmitWindowsFileForSigning(configuration.path)) {
			throw new Error(
				`electron-builder provided an unsupported Windows signing file: ${configuration.path}`,
			)
		}
		await sign(configuration.path)
	}
}

const windowsSignBuilder = createWindowsSigner()
module.exports = windowsSignBuilder
module.exports.createWindowsSigner = createWindowsSigner
