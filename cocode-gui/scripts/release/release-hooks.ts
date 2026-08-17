import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
	existsSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
	mkdtempSync,
} from "node:fs"
import os from "node:os"
import path from "node:path"
import type { ForgeMakeResult } from "@electron-forge/shared-types"
import { notarize } from "@electron/notarize"
import {
	createMacNotarizeOptions,
	isReleaseSigningRequired,
	resolveReleaseTarget,
	resolveWindowsSignLedgerDir,
	resolveWindowsSignMode,
} from "./release-config"

const WINDOWS_SIGNABLE_FILE = /\.(exe|dll|node|sys|efi|scr)$/i

export function normalizeArtifactNames(makeResults: readonly ForgeMakeResult[]): ForgeMakeResult[] {
	return makeResults.map((result) => {
		if (result.platform !== "darwin") return { ...result, artifacts: [...result.artifacts] }
		const version = String(result.packageJSON.version ?? "0.0.0")
		const artifacts = result.artifacts.map((artifact) => {
			const extension = artifact.toLowerCase().endsWith(".dmg")
				? ".dmg"
				: artifact.toLowerCase().endsWith(".zip")
				? ".zip"
				: artifact.toLowerCase().endsWith(".pkg")
				? ".pkg"
				: undefined
			if (!extension) return artifact
			const target = path.join(
				path.dirname(artifact),
				`Cocode-Desktop-${version}-${result.platform}-${result.arch}${extension}`,
			)
			if (artifact === target) return artifact
			if (existsSync(target)) rmSync(target, { force: true })
			renameSync(artifact, target)
			return target
		})
		return { ...result, artifacts }
	})
}

export function prepareMacDmgDependencies(): void {
	if (process.platform !== "darwin") return
	const nodeGyp = path.resolve("node_modules/.bin/node-gyp")
	for (const dependency of ["macos-alias", "fs-xattr"]) {
		const addon = path.join(
			"node_modules",
			dependency,
			"build",
			"Release",
			dependency === "macos-alias" ? "volume.node" : "xattr.node",
		)
		if (existsSync(addon)) continue
		if (!existsSync(nodeGyp))
			throw new Error(`Cannot build ${dependency}: node-gyp is missing.`)
		execFileSync(nodeGyp, ["rebuild"], {
			cwd: path.join("node_modules", dependency),
			stdio: "inherit",
		})
	}
}

export async function verifyPackagedApplication(packageResult: {
	readonly platform: string
	readonly arch: string
	readonly outputPaths: readonly string[]
}): Promise<void> {
	if (!isReleaseSigningRequired()) return
	const target = resolveReleaseTarget()
	if (packageResult.platform !== target.platform || packageResult.arch !== target.arch) {
		throw new Error(
			`Packaged target ${packageResult.platform}/${packageResult.arch} does not match ${target.platform}/${target.arch}.`,
		)
	}
	const packagePath = packageResult.outputPaths.find((candidate) => existsSync(candidate))
	if (!packagePath) throw new Error("Forge did not return a packaged application path.")
	if (packageResult.platform === "darwin") {
		const appPath = findFirstByExtension(packagePath, ".app")
		if (!appPath) throw new Error(`No .app bundle was found under ${packagePath}.`)
		run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath])
		return
	}
	const files = collectFiles(packagePath).filter((file) => WINDOWS_SIGNABLE_FILE.test(file))
	if (files.length === 0) throw new Error(`No Windows PE artifacts found under ${packagePath}.`)
	verifyWindowsSigningLedger(files)
	for (const file of files) verifyWindowsFile(file)
}

export async function notarizeFinalMacArtifacts(
	makeResults: readonly ForgeMakeResult[],
): Promise<void> {
	if (!isReleaseSigningRequired() || process.platform !== "darwin") return
	const credentials = createMacNotarizeOptions()
	if (!credentials) throw new Error("Mac notarization credentials are missing.")
	const dmgs = makeResults
		.flatMap((result) => result.artifacts)
		.filter((artifact) => /\.(dmg|pkg)$/i.test(artifact))
	if (dmgs.length === 0)
		throw new Error("No DMG or PKG artifact was generated for the macOS release.")
	for (const artifact of dmgs) {
		await notarize({ appPath: artifact, ...credentials })
		run("xcrun", ["stapler", "validate", artifact])
		if (artifact.toLowerCase().endsWith(".dmg")) run("hdiutil", ["imageinfo", artifact])
		else run("pkgutil", ["--check-signature", artifact])
	}
}

export function addMacPkgArtifact(makeResults: readonly ForgeMakeResult[]): ForgeMakeResult[] {
	if (process.platform !== "darwin")
		return makeResults.map((result) => ({ ...result, artifacts: [...result.artifacts] }))
	const resultIndex = makeResults.findIndex((result) => result.platform === "darwin")
	if (resultIndex === -1)
		return makeResults.map((result) => ({ ...result, artifacts: [...result.artifacts] }))
	const result = makeResults[resultIndex]
	const outputDirectory = path.dirname(
		result.artifacts[0] ?? path.resolve(process.env.FORGE_OUT_DIR ?? "out"),
	)
	const appRoot = path.resolve(process.env.FORGE_OUT_DIR ?? "out")
	const appPath = findMacAppWithTui(appRoot)
	if (!appPath) throw new Error(`No packaged macOS App bundle was found under ${appRoot}.`)
	const version = String(result.packageJSON.version ?? "0.0.0")
	const outputPath = path.join(
		outputDirectory,
		`Cocode-Desktop-${version}-${result.platform}-${result.arch}.pkg`,
	)
	run(process.execPath, ["scripts/release/build-mac-pkg.mjs", appPath, outputPath, version])
	run(process.execPath, ["scripts/release/verify-mac-pkg.mjs", outputPath])
	return makeResults.map((candidate, index) =>
		index === resultIndex
			? { ...candidate, artifacts: [...candidate.artifacts, outputPath] }
			: { ...candidate, artifacts: [...candidate.artifacts] },
	)
}

export function verifyMadeArtifacts(makeResults: readonly ForgeMakeResult[]): void {
	if (!isReleaseSigningRequired()) return
	const target = resolveReleaseTarget()
	for (const result of makeResults) {
		if (result.platform !== target.platform || result.arch !== target.arch)
			throw new Error(
				`Made target ${result.platform}/${result.arch} does not match ${target.platform}/${target.arch}.`,
			)
		for (const artifact of result.artifacts) {
			if (!existsSync(artifact)) throw new Error(`Forge artifact is missing: ${artifact}`)
			if (target.platform === "darwin" && artifact.toLowerCase().endsWith(".zip"))
				run("unzip", ["-t", artifact])
			if (target.platform === "darwin" && artifact.toLowerCase().endsWith(".dmg"))
				run("hdiutil", ["imageinfo", artifact])
			if (target.platform === "darwin" && artifact.toLowerCase().endsWith(".pkg"))
				run("pkgutil", ["--check-signature", artifact])
			if (
				target.platform === "win32" &&
				/\.(exe|msi)$/i.test(artifact) &&
				process.platform === "win32"
			)
				verifyWindowsFile(artifact)
			if (
				target.platform === "win32" &&
				artifact.toLowerCase().endsWith(".nupkg") &&
				process.platform === "win32"
			)
				verifyWindowsNupkg(artifact)
		}
		if (target.platform === "win32" && process.platform === "win32")
			verifyWindowsReleaseMetadata(result.artifacts)
	}
}

export function cleanupWindowsSignLedger(): void {
	if (resolveReleaseTarget().platform !== "win32" || resolveWindowsSignMode() !== "service")
		return
	const ledgerDir = resolveWindowsSignLedgerDir()
	if (existsSync(ledgerDir)) rmSync(ledgerDir, { recursive: true, force: true })
}

export function appendChecksumManifest(makeResults: readonly ForgeMakeResult[]): ForgeMakeResult[] {
	const outputDirectory = path.resolve(process.env.FORGE_OUT_DIR ?? "out")
	const artifacts = makeResults.flatMap((result) => result.artifacts).filter(existsSync)
	const rows = artifacts
		.map(
			(artifact) =>
				`${createHash("sha256")
					.update(readFileSync(artifact))
					.digest("hex")}  ${path.relative(outputDirectory, artifact)}`,
		)
		.sort()
	const target = makeResults[0] ? `-${makeResults[0].platform}-${makeResults[0].arch}` : ""
	const manifestPath = path.join(outputDirectory, `SHA256SUMS${target}.txt`)
	writeFileSync(manifestPath, `${rows.join("\n")}\n`)
	if (!makeResults[0]) return [...makeResults]
	return [
		{ ...makeResults[0], artifacts: [...makeResults[0].artifacts, manifestPath] },
		...makeResults.slice(1),
	]
}

/**
 * The public Electron update service cannot use Windows ARM64 Squirrel feed
 * metadata as an x64 feed. Keep those files available as CI artifacts, but do
 * not publish them into the shared GitHub release feed.
 */
export function selectGitHubReleaseArtifacts(
	makeResults: readonly ForgeMakeResult[],
): ForgeMakeResult[] {
	return makeResults.map((result) => {
		if (result.platform !== "win32" || result.arch !== "arm64") {
			return { ...result, artifacts: [...result.artifacts] }
		}
		return {
			...result,
			artifacts: result.artifacts.filter((artifact) => {
				const name = path.basename(artifact)
				return name !== "RELEASES" && !name.toLowerCase().endsWith(".nupkg")
			}),
		}
	})
}

function verifyWindowsFile(file: string): void {
	const script = [
		"$signature = Get-AuthenticodeSignature -LiteralPath $env:VERIFY_FILE",
		"if ($signature.Status -ne 'Valid') { throw \"Invalid Authenticode signature: $env:VERIFY_FILE\" }",
		"$certificate = $signature.SignerCertificate",
		'if ($null -eq $certificate) { throw "Signer certificate is missing: $env:VERIFY_FILE" }',
		"[PSCustomObject]@{ Subject=$certificate.Subject; Thumbprint=$certificate.Thumbprint; Status=$signature.Status } | ConvertTo-Json -Compress",
	].join(" ")
	const output = execFileSync(
		"powershell.exe",
		["-NoProfile", "-NonInteractive", "-Command", script],
		{
			env: { ...process.env, VERIFY_FILE: file },
			encoding: "utf8",
		},
	).trim()
	const signature = JSON.parse(output) as { Subject?: string; Thumbprint?: string }
	const expectedSubject = process.env.WINDOWS_SIGN_CERTIFICATE_SUBJECT?.trim()
	const expectedThumbprint = normalizeThumbprint(process.env.WINDOWS_SIGN_CERTIFICATE_SHA1)
	if (expectedSubject && signature.Subject !== expectedSubject)
		throw new Error(`Unexpected Windows signer subject: ${file}`)
	if (expectedThumbprint && normalizeThumbprint(signature.Thumbprint) !== expectedThumbprint)
		throw new Error(`Unexpected Windows signer certificate: ${file}`)
}

function verifyWindowsSigningLedger(files: readonly string[]): void {
	if (resolveWindowsSignMode() !== "service") return
	const ledgerDir = resolveWindowsSignLedgerDir()
	for (const file of files) {
		const ledgerPath = path.join(
			ledgerDir,
			`${createHash("sha256").update(path.resolve(file)).digest("hex")}.json`,
		)
		if (!existsSync(ledgerPath))
			throw new Error(`Windows signing ledger entry is missing: ${file}`)
		const entry = JSON.parse(readFileSync(ledgerPath, "utf8")) as {
			filePath?: string
			inputSha256?: string
			outputSha256?: string
			status?: string
		}
		if (
			entry.filePath !== path.resolve(file) ||
			entry.status !== "signed" ||
			!isSha256(entry.inputSha256) ||
			!isSha256(entry.outputSha256) ||
			createHash("sha256").update(readFileSync(file)).digest("hex") !== entry.outputSha256
		)
			throw new Error(`Windows signing ledger entry is invalid: ${file}`)
	}
}

function verifyWindowsReleaseMetadata(artifacts: readonly string[]): void {
	const releases = artifacts.find((artifact) => path.basename(artifact) === "RELEASES")
	if (!releases) throw new Error("Squirrel RELEASES metadata is missing.")
	const rows = readFileSync(releases, "utf8")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
	if (rows.length === 0) throw new Error("Squirrel RELEASES metadata is empty.")
	for (const row of rows) {
		const [expectedSha1, fileName, expectedSize, ...rest] = row.split(/\s+/)
		if (rest.length > 0 || !/^[a-f0-9]{40}$/i.test(expectedSha1) || !fileName)
			throw new Error(`Invalid Squirrel RELEASES row: ${row}`)
		const artifact = path.join(path.dirname(releases), fileName)
		if (!existsSync(artifact))
			throw new Error(`RELEASES references a missing file: ${fileName}`)
		if (expectedSize && Number(expectedSize) !== statSync(artifact).size)
			throw new Error(`RELEASES size mismatch: ${fileName}`)
		const actualSha1 = createHash("sha1").update(readFileSync(artifact)).digest("hex")
		if (actualSha1.toLowerCase() !== expectedSha1.toLowerCase())
			throw new Error(`RELEASES hash mismatch: ${fileName}`)
	}
}

function isSha256(value: string | undefined): value is string {
	return Boolean(value && /^[a-f0-9]{64}$/i.test(value))
}

function verifyWindowsNupkg(file: string): void {
	const directory = mkdtempSync(path.join(os.tmpdir(), "cocode-nupkg-"))
	try {
		execFileSync(
			"powershell.exe",
			[
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				"$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath $env:NUPKG_FILE -DestinationPath $env:NUPKG_DIR -Force",
			],
			{ env: { ...process.env, NUPKG_FILE: file, NUPKG_DIR: directory }, stdio: "inherit" },
		)
		const files = collectFiles(directory).filter((candidate) =>
			WINDOWS_SIGNABLE_FILE.test(candidate),
		)
		if (files.length === 0) throw new Error(`No signed PE artifacts found inside ${file}.`)
		for (const candidate of files) verifyWindowsFile(candidate)
	} finally {
		rmSync(directory, { recursive: true, force: true })
	}
}

function normalizeThumbprint(value: string | undefined): string {
	return value?.replace(/\s+/g, "").toUpperCase() || ""
}

function collectFiles(root: string): string[] {
	if (!existsSync(root)) return []
	if (!statSync(root).isDirectory()) return [root]
	return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
		const file = path.join(root, entry.name)
		return entry.isDirectory() ? collectFiles(file) : [file]
	})
}

function findFirstByExtension(root: string, extension: string): string | undefined {
	if (!existsSync(root)) return undefined
	if (!statSync(root).isDirectory()) return root.endsWith(extension) ? root : undefined
	if (root.endsWith(extension)) return root
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const found = findFirstByExtension(path.join(root, entry.name), extension)
		if (found) return found
	}
	return undefined
}

function findMacAppWithTui(root: string): string | undefined {
	if (!existsSync(root)) return undefined
	if (root.endsWith(".app") && statSync(root).isDirectory()) {
		return existsSync(path.join(root, "Contents", "Resources", "tui", "manifest.json"))
			? root
			: undefined
	}
	for (const entry of readdirSync(root, { withFileTypes: true })) {
		const found = findMacAppWithTui(path.join(root, entry.name))
		if (found) return found
	}
	return undefined
}

function run(command: string, args: readonly string[]): void {
	execFileSync(command, [...args], { stdio: "inherit" })
}
