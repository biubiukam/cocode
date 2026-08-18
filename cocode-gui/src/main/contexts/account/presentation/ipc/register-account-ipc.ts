import { ipcMain, webContents } from "electron"
import { accountChannels } from "../../../../../contracts/ipc/account.contract"
import type { AccountService } from "../../application/account-service"
import type { DesktopLogger } from "../../../../shared/logging/desktop-logger"

export function registerAccountIpc(account: AccountService, logger?: DesktopLogger): void {
	ipcMain.handle(accountChannels.snapshot, () =>
		invoke(logger, "account.snapshot", () => account.snapshot()),
	)
	ipcMain.handle(accountChannels.signIn, () =>
		invoke(logger, "account.sign-in", () => account.signIn(), true),
	)
	ipcMain.handle(accountChannels.cancelSignIn, () =>
		invoke(logger, "account.cancel-sign-in", () => account.cancelSignIn(), true),
	)
	ipcMain.handle(accountChannels.signOut, () =>
		invoke(logger, "account.sign-out", () => account.signOut(), true),
	)
	account.onChanged((snapshot) => {
		logger?.log("debug", "account.state.changed", {
			attributes: { phase: snapshot.phase, cloudStatus: snapshot.cloud.status },
		})
		for (const contents of webContents.getAllWebContents()) {
			if (!contents.isDestroyed()) contents.send(accountChannels.changed, snapshot)
		}
	})
}

export function unregisterAccountIpc(): void {
	ipcMain.removeHandler(accountChannels.snapshot)
	ipcMain.removeHandler(accountChannels.signIn)
	ipcMain.removeHandler(accountChannels.cancelSignIn)
	ipcMain.removeHandler(accountChannels.signOut)
}

function invoke<T>(
	logger: DesktopLogger | undefined,
	eventName: string,
	operation: () => T | Promise<T>,
	audit = false,
): T | Promise<T> {
	const started = Date.now()
	try {
		const result = operation()
		if (result instanceof Promise) {
			return result.then(
				(value) => {
					logger?.log("debug", eventName, {
						outcome: "success",
						durationMs: Date.now() - started,
						audit,
					})
					return value
				},
				(error: unknown) => {
					logger?.log("error", eventName, {
						outcome: "failure",
						durationMs: Date.now() - started,
						error,
						audit,
					})
					throw error
				},
			)
		}
		logger?.log("debug", eventName, {
			outcome: "success",
			durationMs: Date.now() - started,
			audit,
		})
		return result
	} catch (error) {
		logger?.log("error", eventName, {
			outcome: "failure",
			durationMs: Date.now() - started,
			error,
			audit,
		})
		throw error
	}
}
