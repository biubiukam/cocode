export function createDshBundleLoader(): (url: string) => Promise<void> {
	return (url: string) =>
		new Promise<void>((resolve, reject) => {
			const script = document.createElement("script")
			script.async = true
			script.src = url
			script.addEventListener(
				"load",
				() => {
					script.remove()
					resolve()
				},
				{ once: true },
			)
			script.addEventListener(
				"error",
				() => {
					script.remove()
					reject(new Error(`Failed to load DSH client bundle: ${script.src}`))
				},
				{ once: true },
			)
			document.head.append(script)
		})
}
