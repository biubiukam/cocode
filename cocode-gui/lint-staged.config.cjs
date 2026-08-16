const isIgnoredByEslint = (file) => file.replace(/\\/g, "/").includes("/packages/cocode/")

module.exports = {
	"*.{js,cjs,mjs,ts,tsx}": (files) => {
		const eslintFiles = files.filter((file) => !isIgnoredByEslint(file))
		const commands = []
		if (eslintFiles.length > 0) {
			commands.push(
				`eslint --fix --max-warnings=0 ${eslintFiles
					.map((file) => JSON.stringify(file))
					.join(" ")}`,
			)
		}
		commands.push(`prettier --write ${files.map((file) => JSON.stringify(file)).join(" ")}`)
		return commands
	},
	"*.{css,html,json,yml,yaml}": "prettier --write",
}
