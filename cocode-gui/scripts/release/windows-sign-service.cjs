const { execFileSync } = require("node:child_process")
const { createHash, webcrypto } = require("node:crypto")
const { createReadStream } = require("node:fs")
const { mkdir, open, readFile, rename, rm, writeFile } = require("node:fs/promises")
const FormData = require("form-data")
const fetch = require("node-fetch")
const path = require("pathe")
const windowsSignPolicy = require("./windows-sign-policy.json")

const KEYTAR_SERVICE = "cocode-windows-sign"
const WINDOWS_APPLICATION_EXTENSIONS = new Set(windowsSignPolicy.applicationExtensions)
const WINDOWS_APPLICATION_FILE_NAMES = new Set(
	(windowsSignPolicy.applicationFileNames || []).map((name) => String(name).toLowerCase()),
)
const WINDOWS_PACKAGE_EXTENSIONS = new Set(windowsSignPolicy.packageExtensions)

function isWindowsApplicationExecutable(filePath) {
	return (
		WINDOWS_APPLICATION_EXTENSIONS.has(path.extname(filePath).toLowerCase()) ||
		WINDOWS_APPLICATION_FILE_NAMES.has(path.basename(filePath).toLowerCase())
	)
}

function shouldSubmitWindowsFileForSigning(filePath) {
	const extension = path.extname(filePath).toLowerCase()
	return isWindowsApplicationExecutable(filePath) || WINDOWS_PACKAGE_EXTENSIONS.has(extension)
}

function base64ToBuffer(value) {
	return Buffer.from(String(value).replace(/-/g, "+").replace(/_/g, "/"), "base64")
}

function bufferToBase64(value) {
	return Buffer.from(value).toString("base64")
}

function parseCredential(value) {
	if (!value || typeof value !== "string")
		throw new Error("Windows signing credential is missing.")
	const parts = value.trim().split(":")
	if (parts.length !== 3 || parts.some((part) => part.length === 0))
		throw new Error("Windows signing credential is invalid.")
	const privateKey = base64ToBuffer(parts[1])
	if (privateKey.byteLength !== 32) throw new Error("Windows signing private key is invalid.")
	return {
		serverPublicKey: parts[0],
		privateKey,
		encryptedPin: base64ToBuffer(parts[2]),
	}
}

async function importCredential(value) {
	const parsed = parseCredential(value)
	const asn1 = Buffer.alloc(48)
	asn1.set(
		Buffer.from([
			0x30, 46, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 43, 101, 110, 0x04, 34, 0x04, 32,
		]),
	)
	asn1.set(parsed.privateKey, 16)
	const privateKey = await webcrypto.subtle.importKey("pkcs8", asn1, { name: "X25519" }, true, [
		"deriveBits",
		"deriveKey",
	])
	return { ...parsed, privateKey }
}

async function clientPublicKey(credential) {
	const jwk = await webcrypto.subtle.exportKey("jwk", credential.privateKey)
	return Buffer.from(jwk.x, "base64url").toString("base64")
}

async function sharedKey(credential, serverPublicKey) {
	const publicKey = await webcrypto.subtle.importKey(
		"raw",
		base64ToBuffer(serverPublicKey),
		{ name: "X25519" },
		false,
		[],
	)
	return webcrypto.subtle.deriveKey(
		{ name: "X25519", public: publicKey },
		credential.privateKey,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt"],
	)
}

function configFromEnvironment(environment = process.env) {
	const serviceUrl = environment.WINDOWS_SIGN_SERVICE_URL?.trim()
	if (!serviceUrl) throw new Error("WINDOWS_SIGN_SERVICE_URL is required.")
	const parsedUrl = new URL(serviceUrl)
	if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
		throw new Error("WINDOWS_SIGN_SERVICE_URL must use http or https.")
	}
	return {
		serviceUrl: serviceUrl.replace(/\/$/, ""),
		credentialTarget:
			environment.WINDOWS_SIGN_CREDENTIAL_TARGET?.trim() || "cocode/windows-sign",
		description:
			environment.WINDOWS_SIGN_DESCRIPTION?.trim() ||
			environment.RELEASE_DESCRIPTION?.trim() ||
			"Cocode Desktop",
		timeoutMs: positiveInteger(environment.WINDOWS_SIGN_TIMEOUT_MS, 1_200_000),
		retryCount: positiveInteger(environment.WINDOWS_SIGN_RETRY_COUNT, 2),
	}
}

function positiveInteger(value, fallback) {
	if (!value?.trim()) return fallback
	const parsed = Number(value)
	if (!Number.isInteger(parsed) || parsed <= 0)
		throw new Error("Signing retry/timeout value is invalid.")
	return parsed
}

async function getCredential(target, credentialProvider, environment = process.env) {
	if (credentialProvider) return credentialProvider(target)
	const configured = environment.SIGN_CERTIFICATE?.trim()
	if (configured) return configured
	let keytar
	try {
		keytar = require("keytar")
	} catch (error) {
		throw new Error(`Windows Credential Manager dependency is unavailable: ${error.message}`)
	}
	const value = await keytar.getPassword(KEYTAR_SERVICE, target)
	if (!value) throw new Error(`Windows signing credential is not configured for ${target}.`)
	return value
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

async function request(url, init, config) {
	let lastError
	for (let attempt = 0; attempt <= config.retryCount; attempt += 1) {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), config.timeoutMs)
		try {
			const response = await fetch(url, { ...init, signal: controller.signal })
			if (!response.ok) {
				const error = new Error(`Signing service returned HTTP ${response.status}.`)
				if (
					response.status >= 400 &&
					response.status < 500 &&
					![408, 429].includes(response.status)
				) {
					lastError = error
					break
				}
				throw error
			}
			return response
		} catch (error) {
			lastError = error
			if (attempt < config.retryCount) await sleep(250 * 2 ** attempt)
		} finally {
			clearTimeout(timer)
		}
	}
	throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function requestChallenge(credential, config) {
	const publicKey = await clientPublicKey(credential)
	// Magic Desktop's fixed service protocol uses a 32-byte zero challenge.
	// The challenge is an input marker; the X25519 exchange supplies freshness.
	const challenge = Buffer.alloc(32)
	const response = await request(
		`${config.serviceUrl}/v1/challenge`,
		{
			method: "POST",
			headers: { accept: "*/*", "content-type": "text/plain;charset=UTF-8" },
			body: JSON.stringify({ challenge: bufferToBase64(challenge), publicKey }),
		},
		config,
	)
	const contentType = response.headers.get("content-type") || ""
	if (contentType && !contentType.toLowerCase().includes("application/json")) {
		throw new Error("Signing service challenge response has an invalid content type.")
	}
	const body = await response.json()
	if (!body || typeof body.publicKey !== "string" || typeof body.nonce !== "string") {
		throw new Error("Signing service challenge response is invalid.")
	}
	return { ...body, clientPublicKey: publicKey }
}

async function requestSignature(filePath, credentialValue, config) {
	const credential = await importCredential(credentialValue)
	const challenge = await requestChallenge(credential, config)
	const key = await sharedKey(credential, challenge.publicKey)
	const encryptedPin = await webcrypto.subtle.encrypt(
		{ name: "AES-GCM", iv: base64ToBuffer(challenge.nonce) },
		key,
		credential.encryptedPin,
	)
	const file = await readFile(filePath)
	const sha256 = createHash("sha256").update(file).digest("hex")
	const info = {
		publicKey: challenge.clientPublicKey,
		nonce: challenge.nonce,
		eePIN: bufferToBase64(encryptedPin),
		sha256,
		extraSignOptions: {
			hashType: "sha256",
			desc: config.description,
		},
	}
	const formData = new FormData()
	formData.append("info", JSON.stringify(info))
	formData.append(
		"toBeSigned",
		createReadStream(filePath),
		{
			filename: path.basename(filePath),
			contentType: "application/octet-stream",
		},
	)
	const response = await request(
		`${config.serviceUrl}/v1/sign`,
		{
			method: "POST",
			headers: { accept: "*/*", ...formData.getHeaders() },
			body: formData,
		},
		{ ...config, retryCount: 0 },
	)
	const contentType = response.headers.get("content-type") || ""
	const signed = Buffer.from(await response.arrayBuffer())
	const declaredLengthHeader = response.headers.get("content-length")
	const declaredLength = declaredLengthHeader ? Number(declaredLengthHeader) : undefined
	const preview = signed.subarray(0, 128).toString("utf8").trimStart().toLowerCase()
	if (
		!signed.length ||
		(contentType &&
			(contentType.toLowerCase().includes("text/html") ||
				contentType.toLowerCase().includes("application/json"))) ||
		(Number.isFinite(declaredLength) && declaredLength !== signed.length) ||
		preview.startsWith("<!doctype html") ||
		preview.startsWith("<html") ||
		preview.startsWith("{") ||
		preview.startsWith("[")
	) {
		throw new Error("Signing service returned an invalid signed file.")
	}
	return { signed, inputSha256: sha256 }
}

function normalizeThumbprint(value) {
	return value?.replace(/\s+/g, "").toUpperCase() || ""
}

function inspectAuthenticode(filePath, environment = process.env) {
	if (process.platform !== "win32") throw new Error("Authenticode verification requires Windows.")
	const script = [
		"$s = Get-AuthenticodeSignature -LiteralPath $env:VERIFY_FILE",
		'if ($s.Status -ne \'Valid\') { throw "Invalid Authenticode signature ($($s.Status)): $($s.StatusMessage)" }',
		"$c = $s.SignerCertificate",
		'if ($null -eq $c) { throw "Signer certificate is missing" }',
		"$subjectUtf8 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$c.Subject))",
		"[PSCustomObject]@{ SubjectUtf8=$subjectUtf8; Thumbprint=$c.Thumbprint; Status=[string]$s.Status } | ConvertTo-Json -Compress",
	].join("; ")
	const output = execFileSync(
		"powershell.exe",
		["-NoProfile", "-NonInteractive", "-Command", script],
		{ env: { ...environment, VERIFY_FILE: filePath }, encoding: "utf8" },
	).trim()
	const parsed = JSON.parse(output)
	const result = {
		...parsed,
		Subject: parsed.SubjectUtf8
			? Buffer.from(parsed.SubjectUtf8, "base64").toString("utf8")
			: parsed.Subject,
	}
	const expectedSubject = environment.WINDOWS_SIGN_CERTIFICATE_SUBJECT?.trim()
	const expectedThumbprint = normalizeThumbprint(environment.WINDOWS_SIGN_CERTIFICATE_SHA1)
	if (expectedSubject && result.Subject !== expectedSubject)
		throw new Error(`Unexpected Windows signer subject for ${filePath}.`)
	if (expectedThumbprint && normalizeThumbprint(result.Thumbprint) !== expectedThumbprint)
		throw new Error(`Unexpected Windows signer certificate for ${filePath}.`)
	return result
}

function signingTemporaryPath(filePath) {
	const extension = path.extname(filePath)
	const stem = path.basename(filePath, extension)
	// Keep the original extension. Get-AuthenticodeSignature uses it to pick a
	// verifier; a .tmp suffix can make a signed package look unsigned or unknown.
	return path.join(
		path.dirname(filePath),
		`.${stem}.cocode-signing-${process.pid}-${Date.now()}${extension}`,
	)
}

function ledgerDirectory(environment = process.env) {
	return path.resolve(
		environment.WINDOWS_SIGN_LEDGER_DIR?.trim() ||
			path.join(".cache", "cocode", "windows-sign-ledger"),
	)
}

// Entries are keyed by file content, not by path: @electron/packager signs the
// application inside a temporary staging directory and only afterwards moves it
// to the Builder output directory, while installers may rename artifacts after signing.
function ledgerPath(contentSha256, environment = process.env) {
	return path.join(ledgerDirectory(environment), `${contentSha256}.json`)
}

async function writeLedger(contentSha256, entry, environment = process.env) {
	const directory = ledgerDirectory(environment)
	await mkdir(directory, { recursive: true })
	const target = ledgerPath(contentSha256, environment)
	const temporary = `${target}.${process.pid}.${Date.now()}.tmp`
	await writeFile(temporary, `${JSON.stringify(entry)}\n`, "utf8")
	await rename(temporary, target)
}

async function readLedger(contentSha256, environment = process.env) {
	try {
		return JSON.parse(await readFile(ledgerPath(contentSha256, environment), "utf8"))
	} catch (error) {
		if (error && error.code === "ENOENT") return undefined
		throw error
	}
}

async function replaceFileAtomically(temporary, target) {
	try {
		await rename(temporary, target)
		return
	} catch (error) {
		if (!error || !["EACCES", "EEXIST", "EPERM"].includes(error.code)) throw error
	}
	const backup = `${target}.${process.pid}.${Date.now()}.backup`
	await rename(target, backup)
	try {
		await rename(temporary, target)
		await rm(backup, { force: true })
	} catch (error) {
		await rename(backup, target).catch(() => undefined)
		throw error
	}
}

async function signFile(filePath, options = {}) {
	const environment = options.environment || process.env
	if (environment.WINDOWS_SIGN_MODE === "pfx")
		throw new Error("Service hook cannot run in PFX mode.")
	if (!path.isAbsolute(filePath))
		throw new Error("Windows signing hook requires an absolute path.")
	if (!shouldSubmitWindowsFileForSigning(filePath))
		throw new Error(`Unsupported Windows signing file: ${filePath}`)
	await assertWindowsPortableExecutable(filePath)
	const config = { ...configFromEnvironment(environment), ...(options.config || {}) }
	const input = await readFile(filePath)
	const inputSha256 = createHash("sha256").update(input).digest("hex")
	try {
		const existing = await readLedger(inputSha256, environment)
		if (existing?.status === "signed" && existing.outputSha256 === inputSha256) {
			const signature = inspectAuthenticode(filePath, environment)
			return { inputSha256, outputSha256: inputSha256, signature, skipped: true }
		}
		const credential = await getCredential(
			config.credentialTarget,
			options.credentialProvider,
			environment,
		)
		const result = await requestSignature(filePath, credential, config)
		const temporary = signingTemporaryPath(filePath)
		await writeFile(temporary, result.signed)
		let signature
		try {
			signature = inspectAuthenticode(temporary, environment)
			await replaceFileAtomically(temporary, filePath)
		} catch (error) {
			await rm(temporary, { force: true })
			throw error
		}
		const outputSha256 = createHash("sha256").update(result.signed).digest("hex")
		await writeLedger(
			outputSha256,
			{
				filePath: path.resolve(filePath),
				inputSha256,
				outputSha256,
				signerSubject: signature.Subject,
				signerSha1: signature.Thumbprint,
				status: "signed",
			},
			environment,
		)
		return { inputSha256, outputSha256, signature }
	} catch (error) {
		await writeLedger(
			inputSha256,
			{
				filePath: path.resolve(filePath),
				inputSha256,
				status: "failed",
				error: error instanceof Error ? error.message : String(error),
			},
			environment,
		)
		throw error
	}
}

async function assertWindowsPortableExecutable(filePath) {
	const handle = await open(filePath, "r")
	try {
		const header = Buffer.alloc(2)
		const { bytesRead } = await handle.read(header, 0, header.length, 0)
		if (bytesRead !== 2 || header[0] !== 0x4d || header[1] !== 0x5a) {
			throw new Error(`Signing input is not a Windows PE file: ${filePath}`)
		}
	} finally {
		await handle.close()
	}
}

module.exports = {
	KEYTAR_SERVICE,
	configFromEnvironment,
	getCredential,
	inspectAuthenticode,
	isWindowsApplicationExecutable,
	ledgerDirectory,
	ledgerPath,
	requestChallenge,
	requestSignature,
	readLedger,
	replaceFileAtomically,
	shouldSubmitWindowsFileForSigning,
	signFile,
	signingTemporaryPath,
}
