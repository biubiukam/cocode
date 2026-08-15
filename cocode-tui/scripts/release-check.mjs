import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  formatPackFailure,
  npmCommandForPlatform,
  npmSpawnOptionsForPlatform,
} from './release-check-utils.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const failures = []
const releaseFiles = [
  'bin/cocode-tui.mjs',
  'dist/cocode-tui.mjs',
  'dist/companion-layout.mjs',
  'dist/companion.mjs',
  'dist/companion-runner.mjs',
  'dist/companion.cordis.yml',
  'dist/vision.mjs',
]

if (packageJson.private === true) failures.push('package.json must not be private')
if (!packageJson.version) failures.push('package.json must declare a version')
if (!packageJson.bin?.cocode) failures.push('package.json must expose the cocode bin')
if (packageJson.bin?.['cocode-tui']) failures.push('package.json must not expose the cocode-tui compatibility bin')
if (!packageJson.dependencies?.tsx) failures.push('package.json must include tsx for the Harness bridge')
for (const file of releaseFiles) {
  if (!existsSync(resolve(root, file))) failures.push(`missing release file: ${file}`)
}

const pack = spawnSync(npmCommandForPlatform(), ['pack', '--dry-run', '--json'], {
  cwd: root,
  encoding: 'utf8',
  ...npmSpawnOptionsForPlatform(),
})
if (pack.status !== 0) {
  failures.push(`npm pack failed: ${formatPackFailure(pack)}`)
} else {
  try {
    const manifest = JSON.parse(pack.stdout)[0]
    const names = new Set(manifest.files.map(({ path }) => path))
    for (const file of releaseFiles) {
      if (!names.has(file)) failures.push(`release file is not included in npm pack: ${file}`)
    }
  } catch {
    failures.push('npm pack returned invalid JSON')
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`release-check: ${failure}`)
  process.exit(1)
}

console.log(`release-check: ${packageJson.name}@${packageJson.version} is packable`)
