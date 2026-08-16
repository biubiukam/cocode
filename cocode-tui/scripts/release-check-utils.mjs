export function npmCommandForPlatform(platform = process.platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm'
}

export function npmSpawnOptionsForPlatform(platform = process.platform) {
  return platform === 'win32' ? { shell: true } : {}
}

export function formatPackFailure(result) {
  const output = [result.stderr, result.stdout]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .find(Boolean)
  if (output) return output

  if (result.error instanceof Error) return result.error.message
  if (result.error) return String(result.error)
  return `exit code ${result.status ?? 'unknown'}`
}
