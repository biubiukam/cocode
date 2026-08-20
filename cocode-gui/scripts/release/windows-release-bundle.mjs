import { createHash } from "node:crypto"
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs"
import { fileURLToPath } from "node:url"
import * as path from "pathe"
import { parse as parseYaml } from "yaml"

const ARCHITECTURES = ["x64", "arm64"]

export function assembleWindowsReleaseBundle({ x64Dir, arm64Dir, outDir }) {
	const releases = {
		x64: readArchitectureRelease(x64Dir, "x64"),
		arm64: readArchitectureRelease(arm64Dir, "arm64"),
	}
	if (releases.x64.version !== releases.arm64.version) {
		throw new Error("Windows architecture release version mismatch.")
	}
	assertEmptyOutputDirectory(outDir)
	mkdirSync(outDir, { recursive: true })

	const targets = {}
	for (const arch of ARCHITECTURES) {
		const release = releases[arch]
		copyFileSync(release.installerPath, path.join(outDir, release.manifest.artifact.file))
		for (const metadata of release.manifest.metadata) {
			copyFileSync(path.join(release.directory, metadata), path.join(outDir, metadata))
		}
		const inventoryName = `windows-pe-signing-inventory-${arch}.json`
		copyFileSync(release.inventoryPath, path.join(outDir, inventoryName))
		targets[arch] = {
			...release.manifest,
			inventory: inventoryName,
		}
	}

	const aggregateManifest = {
		schemaVersion: 1,
		product: "Cocode",
		version: releases.x64.version,
		architectures: ARCHITECTURES,
		targets,
	}
	writeFileSync(
		path.join(outDir, "release-manifest.json"),
		`${JSON.stringify(aggregateManifest, null, 2)}\n`,
	)
	writeChecksumManifest(outDir)
	verifyWindowsReleaseBundle(outDir)
	return {
		version: aggregateManifest.version,
		architectures: [...ARCHITECTURES],
		files: readdirSync(outDir).sort(),
	}
}

export function verifyWindowsReleaseBundle(directory) {
	const manifestPath = path.join(directory, "release-manifest.json")
	const manifest = readJson(manifestPath)
	if (
		manifest.schemaVersion !== 1 ||
		manifest.product !== "Cocode" ||
		!manifest.version
	) {
		throw new Error(`Windows release bundle manifest is invalid: ${manifestPath}`)
	}
	for (const arch of ARCHITECTURES) {
		const target = manifest.targets?.[arch]
		if (target?.target?.platform !== "win32" || target.target.arch !== arch) {
			throw new Error(`Windows release bundle target is invalid: ${arch}`)
		}
		if (target.version !== manifest.version) {
			throw new Error(`Windows release bundle target identity mismatch: ${arch}`)
		}
		const installer = path.join(directory, target.artifact.file)
		assertFileHash(installer, target.artifact.sha256, target.artifact.sha512)
		for (const metadataName of target.metadata) {
			verifyMetadata(path.join(directory, metadataName), installer)
		}
		verifySigningInventory(path.join(directory, target.inventory))
		if (target.signature?.status !== "Valid") {
			throw new Error(`Windows release bundle signature evidence is not valid: ${arch}`)
		}
	}
	verifyChecksumManifest(directory)
	return {
		version: manifest.version,
		architectures: [...ARCHITECTURES],
	}
}

function readArchitectureRelease(directory, arch) {
	const manifestPath = path.join(directory, "release-manifest.json")
	const manifest = readJson(manifestPath)
	if (
		manifest.schemaVersion !== 1 ||
		manifest.product !== "Cocode" ||
		manifest.target?.platform !== "win32" ||
		manifest.target.arch !== arch ||
		manifest.build?.hostArch !== arch ||
		manifest.signature?.status !== "Valid"
	) {
		throw new Error(`Windows ${arch} release evidence is invalid: ${manifestPath}`)
	}
	const installerPath = path.join(directory, manifest.artifact.file)
	assertFileHash(installerPath, manifest.artifact.sha256, manifest.artifact.sha512)
	for (const metadata of manifest.metadata) {
		verifyMetadata(path.join(directory, metadata), installerPath)
	}
	const inventoryPath = path.join(directory, "windows-pe-signing-inventory.json")
	verifySigningInventory(inventoryPath)
	return {
		directory,
		manifest,
		installerPath,
		inventoryPath,
		version: manifest.version,
	}
}

function verifyMetadata(metadataPath, installerPath) {
	const metadata = parseYaml(readFileSync(metadataPath, "utf8"))
	const installerName = path.basename(installerPath)
	const sha512 = fileHash(installerPath, "sha512", "base64")
	if (
		metadata.path !== installerName ||
		metadata.files?.[0]?.url !== installerName ||
		metadata.sha512 !== sha512 ||
		metadata.files?.[0]?.sha512 !== sha512
	) {
		throw new Error(`Windows release metadata hash mismatch: ${metadataPath}`)
	}
}

function verifySigningInventory(inventoryPath) {
	const inventory = readJson(inventoryPath)
	if (!Array.isArray(inventory.files)) {
		throw new Error(`Windows PE signing inventory is invalid: ${inventoryPath}`)
	}
	for (const file of inventory.files) {
		if (file.signing === "required" && file.status !== "Valid") {
			throw new Error(`Required Windows PE signature is not valid: ${file.path}`)
		}
		if (file.extension === ".dll" && file.signing !== "excluded") {
			throw new Error(`Windows DLL signing policy is not explicit: ${file.path}`)
		}
	}
}

function assertFileHash(file, expectedSha256, expectedSha512) {
	if (
		!existsSync(file) ||
		fileHash(file, "sha256", "hex") !== expectedSha256 ||
		fileHash(file, "sha512", "base64") !== expectedSha512
	) {
		throw new Error(`Windows release bundle hash mismatch: ${file}`)
	}
}

function writeChecksumManifest(directory) {
	const files = readdirSync(directory)
		.filter((file) => file !== "SHA256SUMS")
		.sort()
	const rows = files.map(
		(file) => `${fileHash(path.join(directory, file), "sha256", "hex")}  ${file}`,
	)
	writeFileSync(path.join(directory, "SHA256SUMS"), `${rows.join("\n")}\n`)
}

function verifyChecksumManifest(directory) {
	const checksumPath = path.join(directory, "SHA256SUMS")
	const rows = readFileSync(checksumPath, "utf8")
		.trim()
		.split(/\r?\n/)
	for (const row of rows) {
		const match = row.match(/^([a-f0-9]{64})  (.+)$/i)
		if (!match || fileHash(path.join(directory, match[2]), "sha256", "hex") !== match[1]) {
			throw new Error(`Windows release checksum manifest mismatch: ${row}`)
		}
	}
}

function fileHash(file, algorithm, encoding) {
	return createHash(algorithm).update(readFileSync(file)).digest(encoding)
}

function readJson(file) {
	if (!existsSync(file)) throw new Error(`Windows release evidence is missing: ${file}`)
	return JSON.parse(readFileSync(file, "utf8"))
}

function assertEmptyOutputDirectory(directory) {
	if (existsSync(directory) && readdirSync(directory).length > 0) {
		throw new Error(`Windows release bundle output directory must be empty: ${directory}`)
	}
}

function readOption(args, name) {
	const index = args.indexOf(name)
	return index < 0 ? undefined : args[index + 1]
}

function runCli() {
	const [command, ...args] = process.argv.slice(2)
	if (command === "assemble") {
		const x64Dir = readOption(args, "--x64-dir")
		const arm64Dir = readOption(args, "--arm64-dir")
		const outDir = readOption(args, "--out")
		if (!x64Dir || !arm64Dir || !outDir) {
			throw new Error("Usage: windows-release-bundle.mjs assemble --x64-dir <dir> --arm64-dir <dir> --out <dir>")
		}
		const result = assembleWindowsReleaseBundle({ x64Dir, arm64Dir, outDir })
		console.log(`Windows release bundle ready: ${outDir} (${result.version})`)
		return
	}
	if (command === "verify") {
		const directory = readOption(args, "--dir")
		if (!directory) {
			throw new Error("Usage: windows-release-bundle.mjs verify --dir <dir>")
		}
		const result = verifyWindowsReleaseBundle(directory)
		console.log(`Windows release bundle verified: ${directory} (${result.version})`)
		return
	}
	throw new Error("Expected assemble or verify command.")
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		runCli()
	} catch (error) {
		console.error(error instanceof Error ? error.message : String(error))
		process.exitCode = 1
	}
}
