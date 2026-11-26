"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SHEET_PARAM, withSheet, withoutSheet } from "./sheetParam";

/**
 * URL-derived sheet state. `open` is true iff `?sheet=<name>` is on the current URL, so the
 * Android back gesture / browser Back closes the sheet by removing the param — with no
 * popstate listener of our own. Next patches window.history.pushState and owns the popstate
 * path; see lib/sheetParam.ts's header for why the patched GLOBAL must be what we call.
 *
 * `pushedRef` tracks whether *this hook instance* is the one that pushed the history entry
 * currently making `open` true. It's a ref, not state, so setting it never causes a re-render.
 * Two ways `open` can become true:
 *   - `openSheet()` ran, which pushed a new entry — `pushedRef.current` is set `true`.
 *   - the param simply arrived on the URL (cold load before the strip runs, a client-side nav
 *     that lands with `?sheet=` already on it, e.g. a `router.replace("/bills/x/receipt?sheet=paste")`)
 *     — nothing was pushed by this instance, so `pushedRef.current` stays `false`.
 * `closeSheet()` branches on that: if this instance pushed, `history.back()` consumes that
 * entry and the history stack stays balanced. If it didn't, calling `history.back()` would
 * walk off to whatever entry preceded the page (savor's reload-then-✕ regression: reload with
 * `?sheet=` on the URL, tap ✕, and you were ejected from the page) — so instead the current
 * entry is replaced with the param-free URL, closing the sheet in place without moving history.
 *
 * Delete-then-navigate: a sheet whose action deletes the entity the route is for must NOT call
 * `closeSheet()` before navigating away. `history.back()` queues a traversal that resolves
 * against the history index when the queue drains, not when it was called, so a synchronous
 * `router.replace` right after it lands first and the deferred `back()` then resolves against
 * the post-navigation index — landing on `?sheet=…` for an entity that no longer exists.
 * Navigate with `router.replace` (not `push`, which would stack a new entry instead of
 * consuming the `?sheet=` one) and let the sheet unmount with the route.
 *
 * NOTE: the calling component must sit inside a <Suspense> boundary — useSearchParams()
 * makes the route dynamic and `next build` fails outright without one.
 */
export function useSheetParam(name: string) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const open = searchParams.get(SHEET_PARAM) === name;
  const pushedRef = useRef(false);

  function openSheet() {
    if (open) return;
    pushedRef.current = true;
    window.history.pushState(null, "", withSheet(window.location.search, name));
  }

  function closeSheet() {
    if (!open) return;
    if (pushedRef.current) {
      window.history.back();
    } else {
      router.replace(
        `${window.location.pathname}${withoutSheet(window.location.search)}${window.location.hash}`,
        { scroll: false }
      );
    }
    pushedRef.current = false;
  }

  return { open, openSheet, closeSheet };
}

/**
 * `?sheet=` is ephemeral: it describes a gesture in progress, not a destination. A reload or
 * a shared link must never restore a half-filled form, so the param is stripped once on cold
 * load.
 *
 * This goes through the PATCHED GLOBAL `window.history.replaceState(...)`, NOT
 * `router.replace(...)`. That is the reverse of savor's rule, and it is deliberate (#5):
 *
 *   - `router.replace` to the param-free URL is a silent no-op on a statically prerendered
 *     page whenever the result is the bare path (`/bills/x/split?sheet=tip` → `/bills/x/split`).
 *     The router's initial URL for a prerendered page is the prerendered path, without the
 *     search, so Next sees "navigate to where I already am" and drops it. The URL keeps
 *     `?sheet=`, the sheet stays mounted, and its ✕ would `router.replace` the same dead URL.
 *     It works when another query param survives the strip, and savor had no e2e on this
 *     path, which is how it went unnoticed. e2e/sheet.spec.ts's cold-load test pins it.
 *   - savor's reason for avoiding `replaceState` ("invisible to `useSearchParams()`") no longer
 *     holds: since Next 14.1 the patched `pushState`/`replaceState` sync into the router, which
 *     is exactly what `openSheet()`'s `pushState` already relies on. Passing `null` state is
 *     fine for the same reason: the patch copies Next's `__NA` entry state in.
 *
 * Either way no new history entry is pushed, so there's nothing extra to go back to. Call the
 * global at call time, never a captured reference (see lib/sheetParam.ts).
 *
 * It reads no search params through React (only `window.location`), so the calling component
 * needn't sit inside a `<Suspense>` boundary, and `AppInit` — which mounts once in the root
 * layout and is not itself Suspense-wrapped — can call this directly. The effect's empty dependency array is
 * what keeps this cold-load-only: `AppInit` mounts once per app lifetime and never remounts on
 * client-side navigation, so this never fires for a same-session nav that lands on `?sheet=`
 * on purpose, which must be left alone for that sheet to open.
 */
export function useStripSheetParamOnLoad() {
  useEffect(() => {
    const search = window.location.search;
    if (!new URLSearchParams(search).has(SHEET_PARAM)) return;
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${withoutSheet(search)}${window.location.hash}`
    );
  }, []);
}
