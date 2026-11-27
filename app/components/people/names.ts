/** Case-insensitive, trimmed name match, for the duplicate warning and chip filtering. */
export function hasName(names: string[], name: string): boolean {
  const n = name.trim().toLowerCase();
  return names.some((x) => x.trim().toLowerCase() === n);
}
