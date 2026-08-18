const {
	shouldSubmitWindowsFileForSigning,
	signFile,
} = require("./windows-sign-service.cjs")

module.exports = async function windowsSignHook(filePath) {
	if (!shouldSubmitWindowsFileForSigning(filePath)) return
	await signFile(filePath)
}
