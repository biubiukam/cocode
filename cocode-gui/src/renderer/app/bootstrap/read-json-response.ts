export async function readJsonResponse<T>(response: Response, context: string): Promise<T> {
	const contentType = response.headers.get("content-type") ?? ""
	const body = await response.text()
	if (!response.ok) {
		let detail = `HTTP ${String(response.status)}`
		try {
			const payload = JSON.parse(body) as { readonly error?: unknown }
			if (typeof payload.error === "string" && payload.error.length > 0)
				detail = payload.error
		} catch {
			const preview = body.trim().slice(0, 160)
			if (preview.length > 0) detail = `${detail}: ${preview}`
		}
		throw new Error(`${context} failed (${detail}).`)
	}
	if (!contentType.toLowerCase().includes("application/json")) {
		const preview = body.trim().slice(0, 160)
		throw new Error(
			`${context} returned ${contentType || "an unknown content type"} instead of JSON${
				preview.length > 0 ? `: ${preview}` : "."
			}`,
		)
	}
	try {
		return JSON.parse(body) as T
	} catch (error) {
		throw new Error(`${context} returned invalid JSON: ${String(error)}`)
	}
}
