// Query-string plumbing for URL-derived sheet state (`?sheet=<name>`).
//
// Sheets are NOT routes and will not become routes — this param exists so the Android back
// gesture and the browser Back button close the top sheet instead of leaving the page. No
// entity id ever goes in here: the owning route already carries it in the path
// (/bills/[id]/split?sheet=split-item). Framework-free so the string handling is
// unit-testable; lib/useSheetParam.ts is the React side.
//
// Why the patched GLOBAL `window.history.pushState` must be what opens a sheet: Next patches
// `window.history.pushState` at runtime so that every entry carries its `__NA` marker (and
// router tree state). Its popstate handler treats an entry WITHOUT that marker as foreign and
// performs a full page reload on Back. So `useSheetParam` calls `window.history.pushState`
// at call time — never a reference captured at module load (which would be the unpatched
// original), and never before mount (before Next has installed the patch).

export const SHEET_PARAM = "sheet";

/** Normalises URLSearchParams back to a leading-`?` string, or "" when it holds nothing. */
function serialize(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** `search` with `sheet=<name>` set, every other param preserved in order. */
export function withSheet(search: string, name: string): string {
  const params = new URLSearchParams(search);
  params.set(SHEET_PARAM, name);
  return serialize(params);
}

/** `search` with any `sheet` param removed. */
export function withoutSheet(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(SHEET_PARAM);
  return serialize(params);
}
