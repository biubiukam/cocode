import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
	mkdtempSync,
} from "node:fs"
import os from "node:os"
import * as path from "pathe"
import type { ForgeMakeResult } from "@electron-forge/shared-types"
import { notarize } from "@electron/notarize"
import windowsSigningService = require("./windows-sign-service.cjs")
import {
	createMacNotarizeOptions,
	isReleaseSigningRequired,
	resolveMsixPackageVersion,
	resolveReleaseTarget,
	resolveWindowsSignLedgerDir,
	resolveWindowsSignMode,
} from "./release-config"

interface WindowsSigningPolicy {
	isWindowsApplicationExecutable(filePath: string): boolean
	signFile(filePath: string): Promise<unknown>
}

const { isWindowsApplicationExecutable, signFile } = windowsSigningService as WindowsSigningPolicy

export function normalizeArtifactNames(makeResults: readonly ForgeMakeResult[]): ForgeMakeResult[] {
	return makeResults.map((result) => {
		if (result.platform === "win32") {
			const version = String(result.packageJSON.version ?? "0.0.0")
			const artifacts = result.artifacts.map((artifact) => {
				if (!artifact.toLowerCase().endsWith(".msix")) return artifact
				const target = path.join(
					path.dirname(artifact),
					`Cocode-Desktop-${version}-win32-${result.arch}.msix`,
				)
				if (artifact === target) return artifact
				if (existsSync(target)) rmSync(target, { force: true })
				renameSync(artifact, target)
				return target
			})
			return { ...result, artifacts }
		}
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
	const files = collectFiles(packagePath).filter(isWindowsApplicationExecutable)
	if (files.length === 0)
		throw new Error(`No Windows executable artifacts found under ${packagePath}.`)
	verifyWindowsSigningLedger(files)
	let signerSubject: string | undefined
	for (const file of files) {
		const signature = verifyWindowsFile(file)
		signerSubject ??= signature.Subject
	}
	assertMsixPublisherMatchesSigner(signerSubject)
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

export async function signWindowsPackageArtifacts(
	makeResults: readonly ForgeMakeResult[],
): Promise<void> {
	if (resolveWindowsSignMode() !== "service") return
	const packages = makeResults
		.flatMap((result) => result.artifacts)
		.filter((artifact) => artifact.toLowerCase().endsWith(".msix"))
	for (const file of packages) {
		if (!existsSync(file)) throw new Error(`Forge artifact is missing: ${file}`)
		await signFile(path.resolve(file))
	}
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
		}
		if (target.platform === "win32" && process.platform === "win32") {
			const packages = result.artifacts.filter((artifact) =>
				artifact.toLowerCase().endsWith(".msix"),
			)
			if (packages.length === 0)
				throw new Error(`No MSIX artifact was generated for ${result.platform}/${result.arch}.`)
			for (const artifact of packages)
				verifyWindowsMsix(artifact, target.arch, result.packageJSON.version)
		}
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

/** Windows GitHub releases ship MSIX only; omit leftover Squirrel feed files. */
export function selectGitHubReleaseArtifacts(
	makeResults: readonly ForgeMakeResult[],
): ForgeMakeResult[] {
	return makeResults.map((result) => {
		if (result.platform !== "win32")
			return { ...result, artifacts: [...result.artifacts] }
		return {
			...result,
			artifacts: result.artifacts.filter((artifact) => {
				const name = path.basename(artifact).toLowerCase()
				return name !== "releases" && !name.endsWith(".nupkg")
			}),
		}
	})
}

export function buildWindowsAuthenticodeVerificationScript(): string {
	return [
		"$signature = Get-AuthenticodeSignature -LiteralPath $env:VERIFY_FILE",
		"if ($signature.Status -ne 'Valid') { throw \"Invalid Authenticode signature: $env:VERIFY_FILE\" }",
		"$certificate = $signature.SignerCertificate",
		'if ($null -eq $certificate) { throw "Signer certificate is missing: $env:VERIFY_FILE" }',
		"$subjectUtf8 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes([string]$certificate.Subject))",
		"[PSCustomObject]@{ SubjectUtf8=$subjectUtf8; Thumbprint=$certificate.Thumbprint; Status=[string]$signature.Status } | ConvertTo-Json -Compress",
	].join("; ")
}

function verifyWindowsFile(file: string): { Subject?: string; Thumbprint?: string } {
	const script = buildWindowsAuthenticodeVerificationScript()
	const output = execFileSync(
		"powershell.exe",
		["-NoProfile", "-NonInteractive", "-Command", script],
		{
			env: { ...process.env, VERIFY_FILE: file },
			encoding: "utf8",
		},
	).trim()
	const signature = decodeAuthenticodeOutput(output)
	const expectedSubject = process.env.WINDOWS_SIGN_CERTIFICATE_SUBJECT?.trim()
	const expectedThumbprint = normalizeThumbprint(process.env.WINDOWS_SIGN_CERTIFICATE_SHA1)
	if (expectedSubject && signature.Subject !== expectedSubject)
		throw new Error(`Unexpected Windows signer subject: ${file}`)
	if (expectedThumbprint && normalizeThumbprint(signature.Thumbprint) !== expectedThumbprint)
		throw new Error(`Unexpected Windows signer certificate: ${file}`)
	return signature
}

function decodeAuthenticodeOutput(output: string): { Subject?: string; Thumbprint?: string } {
	const parsed = JSON.parse(output) as {
		SubjectUtf8?: string
		Subject?: string
		Thumbprint?: string
	}
	return {
		Subject: parsed.SubjectUtf8
			? Buffer.from(parsed.SubjectUtf8, "base64").toString("utf8")
			: parsed.Subject,
		Thumbprint: parsed.Thumbprint,
	}
}

function assertMsixPublisherMatchesSigner(signerSubject: string | undefined): void {
	const publisher = process.env.WINDOWS_MSIX_PUBLISHER?.trim()
	if (!publisher || !signerSubject) return
	const expected = normalizeMsixPublisher(publisher)
	if (expected === signerSubject) return
	throw new Error(
		`WINDOWS_MSIX_PUBLISHER must exactly match the signing certificate subject.\n  WINDOWS_MSIX_PUBLISHER=${expected}\n  certificate subject=${signerSubject}`,
	)
}

function verifyWindowsSigningLedger(files: readonly string[]): void {
	if (resolveWindowsSignMode() !== "service") return
	const ledgerDir = resolveWindowsSignLedgerDir()
	for (const file of files) {
		const digest = createHash("sha256").update(readFileSync(file)).digest("hex")
		const ledgerPath = path.join(ledgerDir, `${digest}.json`)
		if (!existsSync(ledgerPath))
			throw new Error(`Windows signing ledger entry is missing: ${file}`)
		const entry = JSON.parse(readFileSync(ledgerPath, "utf8")) as {
			inputSha256?: string
			outputSha256?: string
			status?: string
		}
		if (
			entry.status !== "signed" ||
			!isSha256(entry.inputSha256) ||
			entry.outputSha256 !== digest
		)
			throw new Error(`Windows signing ledger entry is invalid: ${file}`)
	}
}

function verifyWindowsMsix(file: string, arch: string, version: unknown): void {
	verifyWindowsSigningLedger([file])
	const signature = verifyWindowsFile(file)
	const directory = mkdtempSync(path.join(os.tmpdir(), "cocode-msix-"))
	try {
		const [manifestPath] = extractWindowsArchiveEntries({
			archivePath: file,
			destination: directory,
			mode: "named",
			names: ["AppxManifest.xml"],
		})
		if (!manifestPath) throw new Error(`MSIX manifest is missing: ${file}`)
		const manifest = readFileSync(manifestPath, "utf8")
		const identity = manifest.match(/<Identity\b[^>]*\/?>/i)?.[0]
		const packageIdentity = decodeXmlAttribute(identity?.match(/\bName="([^"]+)"/i)?.[1])
		const publisher = decodeXmlAttribute(identity?.match(/\bPublisher="([^"]+)"/i)?.[1])
		const packageVersion = identity?.match(/\bVersion="([^"]+)"/i)?.[1]
		const processorArchitecture = identity?.match(/\bProcessorArchitecture="([^"]+)"/i)?.[1]
		const executable = manifest.match(/\bExecutable="([^"]+\.exe)"/i)?.[1]
		if (
			!identity ||
			!packageIdentity ||
			!publisher ||
			!packageVersion ||
			!processorArchitecture ||
			!executable
		)
			throw new Error(`MSIX manifest is missing required identity fields: ${file}`)
		const expectedIdentity = process.env.WINDOWS_MSIX_PACKAGE_ID?.trim()
		if (expectedIdentity && packageIdentity !== expectedIdentity)
			throw new Error(`MSIX package identity mismatch: ${file}`)
		if (processorArchitecture.toLowerCase() !== arch.toLowerCase())
			throw new Error(`MSIX architecture mismatch: ${file}`)
		if (packageVersion !== resolveMsixPackageVersion(String(version)))
			throw new Error(`MSIX version mismatch: ${file}`)
		const [executablePath] = extractWindowsArchiveEntries({
			archivePath: file,
			destination: directory,
			mode: "named",
			names: [executable.replaceAll("\\", "/")],
		})
		if (!executablePath) throw new Error(`MSIX executable entry is missing: ${executable}`)
		const expectedPublisher = process.env.WINDOWS_MSIX_PUBLISHER?.trim()
		if (expectedPublisher && normalizeMsixPublisher(expectedPublisher) !== publisher)
			throw new Error(`MSIX publisher mismatch: ${file}`)
		if (signature.Subject && signature.Subject !== publisher)
			throw new Error(`MSIX signer publisher does not match manifest: ${file}`)
	} finally {
		rmSync(directory, { recursive: true, force: true })
	}
}

function isSha256(value: string | undefined): value is string {
	return Boolean(value && /^[a-f0-9]{64}$/i.test(value))
}

// Expand-Archive unpacks every entry and keeps zip-relative paths. The
// packaged dsh-runtime has tens of thousands of files, some longer than
// MAX_PATH once extracted under %TEMP%. Verification only needs executables
// and AppxManifest.xml, extracted to short names via ZipFile.OpenRead.
export function extractWindowsArchiveEntries(options: {
	readonly archivePath: string
	readonly destination: string
	readonly mode: "executables" | "named"
	readonly names?: readonly string[]
}): string[] {
	if (process.platform !== "win32")
		throw new Error("Windows archive extraction requires PowerShell.")
	const archivePath = path.resolve(options.archivePath)
	const destination = path.resolve(options.destination)
	if (!existsSync(archivePath)) throw new Error(`Archive is missing: ${archivePath}`)
	mkdirSync(destination, { recursive: true })
	const script = [
		"$ErrorActionPreference = 'Stop'",
		"Add-Type -AssemblyName System.IO.Compression.FileSystem",
		"New-Item -ItemType Directory -Path $env:ZIP_DIR -Force | Out-Null",
		"$wanted = @()",
		"if ($env:ZIP_ENTRIES_FILE) {",
		"  $wanted = @(Get-Content -LiteralPath $env:ZIP_ENTRIES_FILE -Encoding UTF8 | ForEach-Object { $_.Trim().Replace('\\','/') } | Where-Object { $_ })",
		"}",
		"$zip = [IO.Compression.ZipFile]::OpenRead($env:ZIP_FILE)",
		"try {",
		"  $index = 0",
		"  foreach ($entry in $zip.Entries) {",
		"    if ($entry.FullName.EndsWith('/')) { continue }",
		"    $name = $entry.FullName.Replace('\\','/')",
		"    $include = $false",
		"    if ($env:ZIP_MODE -eq 'executables') {",
		"      $include = $name -like '*.exe'",
		"    } else {",
		"      foreach ($want in $wanted) { if ($name -eq $want) { $include = $true; break } }",
		"    }",
		"    if (-not $include) { continue }",
		"    $leaf = [IO.Path]::GetFileName($entry.FullName)",
		"    if ([string]::IsNullOrWhiteSpace($leaf)) { $leaf = 'entry' }",
		"    $target = Join-Path $env:ZIP_DIR ('{0:D4}-{1}' -f $index, $leaf)",
		"    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)",
		"    Write-Output $target",
		"    $index++",
		"  }",
		"} finally { $zip.Dispose() }",
	].join("\n")
	const env: NodeJS.ProcessEnv = {
		...process.env,
		ZIP_FILE: archivePath,
		ZIP_DIR: destination,
		ZIP_MODE: options.mode,
	}
	let entriesFile: string | undefined
	if (options.mode === "named") {
		entriesFile = path.join(destination, ".cocode-zip-entries.txt")
		writeFileSync(
			entriesFile,
			(options.names ?? []).map((name) => name.replaceAll("\\", "/")).join("\n"),
		)
		env.ZIP_ENTRIES_FILE = entriesFile
	}
	try {
		const output = execFileSync(
			"powershell.exe",
			["-NoProfile", "-NonInteractive", "-Command", script],
			{ env, encoding: "utf8" },
		)
		return output
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line && existsSync(line))
	} finally {
		if (entriesFile) rmSync(entriesFile, { force: true })
	}
}

function normalizeThumbprint(value: string | undefined): string {
	return value?.replace(/\s+/g, "").toUpperCase() || ""
}

function normalizeMsixPublisher(value: string): string {
	return value.startsWith("CN=") ? value : `CN=${value}`
}

function decodeXmlAttribute(value: string | undefined): string | undefined {
	return value
		?.replaceAll("&quot;", '"')
		.replaceAll("&apos;", "'")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&amp;", "&")
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

export function findMacAppWithTui(root: string): string | undefined {
	if (!existsSync(root)) return undefined
	if (!statSync(root).isDirectory()) return undefined
	if (root.endsWith(".app")) {
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
