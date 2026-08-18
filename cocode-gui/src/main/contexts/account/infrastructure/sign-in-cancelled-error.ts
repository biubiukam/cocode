/**
 * Raised when a sign-in is abandoned on purpose. It is not a failure: the
 * account simply stays signed out, so surfaces must not present it as an error.
 */
export class SignInCancelledError extends Error {
	constructor(message = "sign-in was cancelled") {
		super(message)
		this.name = "SignInCancelledError"
	}
}
