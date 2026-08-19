import assert from "node:assert/strict"
import { createHash, webcrypto } from "node:crypto"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import os from "node:os"
import * as path from "pathe"
import test from "node:test"

interface SigningServiceConfig {
	serviceUrl: string
	timeoutMs: number
	retryCount: number
}

interface SigningServiceResult {
	signed: Buffer
	inputSha256: string
}

interface SigningServiceModule {
	isWindowsApplicationExecutable(filePath: string): boolean
	shouldSubmitWindowsFileForSigning(filePath: string): boolean
	getCredential(
		target: string,
		credentialProvider?: (target: string) => string | Promise<string>,
		environment?: NodeJS.ProcessEnv,
	): Promise<string>
	requestSignature(
		filePath: string,
		credentialValue: string,
		config: SigningServiceConfig,
	): Promise<SigningServiceResult>
	signingTemporaryPath(filePath: string): string
}

const localRequire = createRequire(path.resolve("tests/release/windows-sign-service.test.ts"))
const {
	getCredential,
	isWindowsApplicationExecutable,
	requestSignature,
	shouldSubmitWindowsFileForSigning,
	signingTemporaryPath,
} = localRequire(
	"../../scripts/release/windows-sign-service.cjs",
) as SigningServiceModule
const windowsSignHook = localRequire("../../scripts/release/windows-sign-hook.cjs") as (
	filePath: string,
) => Promise<void>

test("limits remote signing to Magic-compatible executables and required package containers", () => {
	assert.equal(typeof isWindowsApplicationExecutable, "function")
	assert.equal(typeof shouldSubmitWindowsFileForSigning, "function")

	for (const file of ["Cocode.exe", "HELPER.EXE"]) {
		assert.equal(isWindowsApplicationExecutable(file), true, file)
		assert.equal(shouldSubmitWindowsFileForSigning(file), true, file)
	}
	for (const file of ["Cocode-Setup.msi", "Cocode.msix"]) {
		assert.equal(isWindowsApplicationExecutable(file), false, file)
		assert.equal(shouldSubmitWindowsFileForSigning(file), true, file)
	}
	for (const file of [
		"native.dll",
		"better-sqlite3.node",
		"driver.sys",
		"boot.efi",
		"screen.scr",
		"install.ps1",
		"package.appx",
		"archive.cab",
	]) {
		assert.equal(isWindowsApplicationExecutable(file), false, file)
		assert.equal(shouldSubmitWindowsFileForSigning(file), false, file)
	}
})

test("does not call the signing service for excluded application files", async () => {
	await assert.doesNotReject(() => windowsSignHook("/tmp/native.node"))
})

test("keeps the original extension on signing temp files", () => {
	assert.match(signingTemporaryPath("C:/out/Cocode.exe"), /\/\.Cocode\.cocode-signing-\d+-\d+\.exe$/)
	assert.match(
		signingTemporaryPath("C:/out/Cocode-Desktop-1.0.1-win32-x64.msix"),
		/\/\.Cocode-Desktop-1\.0\.1-win32-x64\.cocode-signing-\d+-\d+\.msix$/,
	)
})

test("uses SIGN_CERTIFICATE from the environment before Credential Manager", async () => {
	await assert.doesNotReject(async () => {
		const credential = await getCredential("cocode/windows-sign", undefined, {
			SIGN_CERTIFICATE: "env-signing-credential",
		})
		assert.equal(credential, "env-signing-credential")
	})
})

test("speaks the Magic Desktop challenge and sign protocol", async () => {
	const client = await createX25519KeyPair()
	const server = await createX25519KeyPair()
	const serverPublicKey = await publicKeyBase64(server.publicKey)
	const clientPrivateKey = await privateKeyBase64(client.privateKey)
	const credential = `ignored:${clientPrivateKey}:${Buffer.from("encrypted-pin").toString(
		"base64",
	)}`
	const signedContent = Buffer.from("signed-content")
	const requests: Array<{ path: string; body: string }> = []
	const httpServer = await createMockServer({
		challenge: async (_request, body) => {
			requests.push({ path: "/v1/challenge", body: body.toString("utf8") })
			const payload = JSON.parse(body.toString("utf8")) as {
				challenge?: string
				publicKey?: string
			}
			assert.equal(payload.challenge, Buffer.alloc(32).toString("base64"))
			assert.equal(typeof payload.publicKey, "string")
			return jsonResponse({
				publicKey: serverPublicKey,
				nonce: Buffer.alloc(12, 7).toString("base64"),
			})
		},
		sign: async (_request, body) => {
			requests.push({ path: "/v1/sign", body: body.toString("latin1") })
			const multipart = body.toString("latin1")
			assert.match(multipart, /name="info"/)
			assert.match(multipart, /name="toBeSigned"/)
			const infoMatch = multipart.match(/name="info"\r\n\r\n([\s\S]*?)\r\n--/)
			assert.ok(infoMatch?.[1])
			const info = JSON.parse(infoMatch[1]) as {
				publicKey?: string
				nonce?: string
				eePIN?: string
				sha256?: string
				extraSignOptions?: { hashType?: string }
			}
			assert.equal(typeof info.publicKey, "string")
			assert.equal(info.nonce, Buffer.alloc(12, 7).toString("base64"))
			assert.equal(typeof info.eePIN, "string")
			assert.equal(info.sha256, createHash("sha256").update("unsigned-content").digest("hex"))
			assert.equal(info.extraSignOptions?.hashType, "sha256")
			return binaryResponse(signedContent)
		},
	})
	try {
		const root = mkdtempSync(path.join(os.tmpdir(), "cocode-sign-service-test-"))
		try {
			const file = path.join(root, "Cocode.exe")
			writeFileSync(file, "unsigned-content")
			const result = await requestSignature(file, credential, {
				serviceUrl: httpServer.url,
				timeoutMs: 2_000,
				retryCount: 0,
			})
			assert.deepEqual(result.signed, signedContent)
			assert.equal(
				result.inputSha256,
				createHash("sha256").update(readFileSync(file)).digest("hex"),
			)
			assert.deepEqual(
				requests.map((request) => request.path),
				["/v1/challenge", "/v1/sign"],
			)
		} finally {
			rmSync(root, { recursive: true, force: true })
		}
	} finally {
		await closeServer(httpServer.server)
	}
})

test("retries transient signing service failures and rejects error bodies", async () => {
	let challengeAttempts = 0
	const httpServer = await createMockServer({
		challenge: async () => {
			challengeAttempts += 1
			if (challengeAttempts === 1) return makeResponse(503, "text/plain", Buffer.from("busy"))
			return jsonResponse({ publicKey: "invalid", nonce: "invalid" })
		},
	})
	try {
		const file = path.join(
			mkdtempSync(path.join(os.tmpdir(), "cocode-sign-service-test-")),
			"Cocode.exe",
		)
		writeFileSync(file, "unsigned-content")
		const client = await createX25519KeyPair()
		const credential = `ignored:${await privateKeyBase64(client.privateKey)}:${Buffer.from(
			"pin",
		).toString("base64")}`
		await assert.rejects(
			requestSignature(file, credential, {
				serviceUrl: httpServer.url,
				timeoutMs: 2_000,
				retryCount: 1,
			}),
		)
		assert.equal(challengeAttempts, 2)
	} finally {
		await closeServer(httpServer.server)
	}
})

test("fails fast on unauthorized signing service responses", async () => {
	let attempts = 0
	const httpServer = await createMockServer({
		challenge: async () => {
			attempts += 1
			return makeResponse(401, "application/json", Buffer.from('{"error":"unauthorized"}'))
		},
	})
	try {
		const root = mkdtempSync(path.join(os.tmpdir(), "cocode-sign-service-test-"))
		const file = path.join(root, "Cocode.exe")
		writeFileSync(file, "unsigned-content")
		const client = await createX25519KeyPair()
		const credential = `ignored:${await privateKeyBase64(client.privateKey)}:${Buffer.from(
			"pin",
		).toString("base64")}`
		await assert.rejects(
			requestSignature(file, credential, {
				serviceUrl: httpServer.url,
				timeoutMs: 2_000,
				retryCount: 3,
			}),
		)
		assert.equal(attempts, 1)
		rmSync(root, { recursive: true, force: true })
	} finally {
		await closeServer(httpServer.server)
	}
})

test("rejects empty, HTML, and JSON signing responses", async () => {
	const client = await createX25519KeyPair()
	const server = await createX25519KeyPair()
	const credential = `ignored:${await privateKeyBase64(client.privateKey)}:${Buffer.from(
		"pin",
	).toString("base64")}`
	const serverPublicKey = await publicKeyBase64(server.publicKey)
	for (const body of [
		Buffer.alloc(0),
		Buffer.from("<html>error</html>"),
		Buffer.from('{"error":"failed"}'),
	]) {
		const httpServer = await createMockServer({
			challenge: async () =>
				jsonResponse({
					publicKey: serverPublicKey,
					nonce: Buffer.alloc(12).toString("base64"),
				}),
			sign: async () => binaryResponse(body),
		})
		try {
			const root = mkdtempSync(path.join(os.tmpdir(), "cocode-sign-service-test-"))
			const file = path.join(root, "Cocode.exe")
			writeFileSync(file, "unsigned-content")
			await assert.rejects(
				requestSignature(file, credential, {
					serviceUrl: httpServer.url,
					timeoutMs: 2_000,
					retryCount: 0,
				}),
			)
			assert.equal(readFileSync(file, "utf8"), "unsigned-content")
			rmSync(root, { recursive: true, force: true })
		} finally {
			await closeServer(httpServer.server)
		}
	}
})

async function createX25519KeyPair(): Promise<CryptoKeyPair> {
	return (await webcrypto.subtle.generateKey({ name: "X25519" }, true, [
		"deriveBits",
		"deriveKey",
	])) as unknown as CryptoKeyPair
}

async function publicKeyBase64(key: CryptoKey): Promise<string> {
	const jwk = (await webcrypto.subtle.exportKey("jwk", key)) as JsonWebKey
	return Buffer.from(jwk.x ?? "", "base64url").toString("base64")
}

async function privateKeyBase64(key: CryptoKey): Promise<string> {
	const jwk = (await webcrypto.subtle.exportKey("jwk", key)) as JsonWebKey
	return Buffer.from(jwk.d ?? "", "base64url").toString("base64")
}

interface MockServerOptions {
	challenge?: (request: IncomingMessage, body: Buffer) => Promise<MockResponse>
	sign?: (request: IncomingMessage, body: Buffer) => Promise<MockResponse>
}

interface MockResponse {
	status: number
	contentType: string
	body: Buffer
}

async function createMockServer(
	options: MockServerOptions,
): Promise<{ server: Server; url: string }> {
	const server = createServer(async (request, target) => {
		const body = await readRequestBody(request)
		try {
			const handler = request.url === "/v1/challenge" ? options.challenge : options.sign
			if (!handler)
				return writeResponse(
					target,
					makeResponse(404, "text/plain", Buffer.from("not found")),
				)
			writeResponse(target, await handler(request, body))
		} catch (error) {
			writeResponse(target, makeResponse(500, "text/plain", Buffer.from(String(error))))
		}
	})
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject)
		server.listen(0, "127.0.0.1", () => resolve())
	})
	const address = server.address()
	if (!address || typeof address === "string")
		throw new Error("Mock signing server did not start.")
	return { server, url: `http://127.0.0.1:${address.port}` }
}

function makeResponse(status: number, contentType: string, body: Buffer): MockResponse {
	return { status, contentType, body }
}

function jsonResponse(value: unknown): MockResponse {
	return makeResponse(200, "application/json", Buffer.from(JSON.stringify(value)))
}

function binaryResponse(body: Buffer): MockResponse {
	return makeResponse(200, "application/octet-stream", body)
}

function writeResponse(target: ServerResponse, result: MockResponse): void {
	target.writeHead(result.status, {
		"content-type": result.contentType,
		"content-length": String(result.body.length),
	})
	target.end(result.body)
}

function readRequestBody(request: IncomingMessage): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = []
		request.on("data", (chunk: Buffer) => chunks.push(chunk))
		request.on("end", () => resolve(Buffer.concat(chunks)))
		request.on("error", reject)
	})
}

function closeServer(server: Server): Promise<void> {
	return new Promise((resolve, reject) =>
		server.close((error) => (error ? reject(error) : resolve())),
	)
}
