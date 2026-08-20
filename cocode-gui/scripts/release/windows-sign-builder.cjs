const path = require("node:path")
const { shouldSubmitWindowsFileForSigning, signFile } = require("./windows-sign-service.cjs")

module.exports = async function windowsSignBuilder(configuration) {
	const filePath = path.resolve(configuration.path)
	if (!shouldSubmitWindowsFileForSigning(filePath)) return
	await signFile(filePath)
}
