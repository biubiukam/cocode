export async function runCleanupStep(
	name: string,
	cleanup: () => void | Promise<void>,
	onError: (name: string, error: unknown) => void,
): Promise<void> {
	try {
		await cleanup()
	} catch (error) {
		onError(name, error)
	}
}
