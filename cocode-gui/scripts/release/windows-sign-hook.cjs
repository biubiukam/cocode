const { signFile } = require("./windows-sign-service.cjs")

module.exports = async function windowsSignHook(filePath) {
	await signFile(filePath)
}
