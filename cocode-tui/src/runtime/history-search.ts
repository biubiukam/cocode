/** Pure fuzzy filtering for the local composer history. */

export function searchHistory(entries: readonly string[], query: string, limit = 20): string[] {
  const needle = query.trim().toLocaleLowerCase()
  const seen = new Set<string>()
  const result: string[] = []
  for (let index = entries.length - 1; index >= 0 && result.length < limit; index -= 1) {
    const entry = entries[index]
    if (entry === undefined || seen.has(entry)) continue
    if (needle !== '' && !entry.toLocaleLowerCase().includes(needle)) continue
    seen.add(entry)
    result.push(entry)
  }
  return result
}
