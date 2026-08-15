module.exports = {
	"*.{js,cjs,mjs,ts,tsx}": ["eslint --fix --max-warnings=0", "prettier --write"],
	"*.{css,html,json,yml,yaml}": "prettier --write",
}
