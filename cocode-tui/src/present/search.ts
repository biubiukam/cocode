/** Shared case-insensitive filtering for picker and command panels. */

export function filterSearchItems<T>(
  items: readonly T[],
  query: string,
  getSearchText: (item: T) => string,
): readonly T[] {
  const needle = query.trim().toLocaleLowerCase()
  if (needle === '') return items
  return items.filter((item) => getSearchText(item).toLocaleLowerCase().includes(needle))
}
