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
} from "node:fs"
import path from "node:path"
import type { ForgeMakeResult } from "@electron-forge/shared-types"
import { notarize } from "@electron/notarize"
import {
	createMacNotarizeOptions,
	isReleaseSigningRequired,
	resolveReleaseTarget,
} from "./release-config"

export function normalizeArtifactNames(makeResults: readonly ForgeMakeResult[]): ForgeMakeResult[] {
	return makeResults.map((result) => {
		if (result.platform !== "darwin") return { ...result, artifacts: [...result.artifacts] }
		const version = String(result.packageJSON.version ?? "0.0.0")
		const artifacts = result.artifacts.map((artifact) => {
			const extension = artifact.toLowerCase().endsWith(".dmg")
				? ".dmg"
				: artifact.toLowerCase().endsWith(".zip")
				? ".zip"
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
	const files = collectFiles(packagePath).filter((file) => /\.(exe|dll|node|msi)$/i.test(file))
	if (files.length === 0) throw new Error(`No Windows PE artifacts found under ${packagePath}.`)
}

export async function notarizeFinalMacArtifacts(
	makeResults: readonly ForgeMakeResult[],
): Promise<void> {
	if (!isReleaseSigningRequired() || process.platform !== "darwin") return
	const credentials = createMacNotarizeOptions()
	if (!credentials) throw new Error("Mac notarization credentials are missing.")
	const dmgs = makeResults
		.flatMap((result) => result.artifacts)
		.filter((artifact) => artifact.toLowerCase().endsWith(".dmg"))
	if (dmgs.length === 0) throw new Error("No DMG artifact was generated for the macOS release.")
	for (const artifact of dmgs) {
		await notarize({ appPath: artifact, ...credentials })
		run("xcrun", ["stapler", "validate", artifact])
		run("hdiutil", ["imageinfo", artifact])
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
			if (
				target.platform === "win32" &&
				/\.(exe|msi)$/i.test(artifact) &&
				process.platform === "win32"
			)
				verifyWindowsFile(artifact)
		}
	}
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
	].join(" ")
	execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
		env: { ...process.env, VERIFY_FILE: file },
		stdio: "inherit",
	})
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

function run(command: string, args: readonly string[]): void {
	execFileSync(command, [...args], { stdio: "inherit" })
}
