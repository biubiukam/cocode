import { createHash } from 'node:crypto'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Source keeps link:; pack/publish rewrite it to the sibling version.
const SUPERVISOR_PACKAGE = '@cocode-agency/host-supervisor'

function backupPathFor(root) {
  const id = createHash('sha1').update(root).digest('hex').slice(0, 12)
  return join(tmpdir(), `cocode-tui-prepack-${id}.json`)
}

export function isProtocolDependency(spec) {
  return typeof spec === 'string' && /^(link|file|workspace|portal):/.test(spec)
}

export function toPublishablePackageJson(pkg, supervisorVersion) {
  const next = structuredClone(pkg)
  const dep = next.dependencies?.[SUPERVISOR_PACKAGE]
  if (isProtocolDependency(dep)) {
    next.dependencies[SUPERVISOR_PACKAGE] = supervisorVersion
  }
  return next
}

export function applyPublishableManifest(root) {
  const packageJsonPath = resolve(root, 'package.json')
  const original = readFileSync(packageJsonPath, 'utf8')
  const pkg = JSON.parse(original)
  const supervisorVersion = JSON.parse(
    readFileSync(resolve(root, '../cocode-host-supervisor/package.json'), 'utf8'),
  ).version
  const publishable = toPublishablePackageJson(pkg, supervisorVersion)
  if (publishable.dependencies?.[SUPERVISOR_PACKAGE] === pkg.dependencies?.[SUPERVISOR_PACKAGE]) {
    return
  }
  writeFileSync(backupPathFor(root), original)
  writeFileSync(packageJsonPath, `${JSON.stringify(publishable, null, 2)}\n`)
}

export function restorePublishableManifest(root) {
  const backupPath = backupPathFor(root)
  if (!existsSync(backupPath)) return
  writeFileSync(resolve(root, 'package.json'), readFileSync(backupPath, 'utf8'))
  unlinkSync(backupPath)
}

const invokedPath = process.argv[1]
if (invokedPath && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  if (process.argv[2] === 'restore') restorePublishableManifest(root)
  else applyPublishableManifest(root)
}
