"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "../Toast";
import { Button, Chip, EmptyState, UsersGlyph } from "../ui";
import { ActivePersonBar } from "./ActivePersonBar";
import { ClaimableItem } from "./ClaimableItem";
import { SplitRestSheet } from "./SplitRestSheet";
import { useSplit } from "@/lib/hooks";
import { useSheetParam } from "@/lib/useSheetParam";

type Filter = "all" | "unclaimed" | "mine";
const TAP_DEBOUNCE_MS = 250;
const storageKey = (billId: string) => `split-it:active-person:${billId}`;

// The active person lives in sessionStorage (per bill) so it survives step changes. Read via
// useSyncExternalStore: server snapshot is null, so hydration matches, then the client reads.
const activeListeners = new Set<() => void>();
function readActive(billId: string): string | null {
  try {
    return window.sessionStorage.getItem(storageKey(billId));
  } catch {
    return null;
  }
}
function writeActive(billId: string, personId: string | null) {
  try {
    if (personId) window.sessionStorage.setItem(storageKey(billId), personId);
    else window.sessionStorage.removeItem(storageKey(billId));
  } catch {
    /* storage unavailable: the selection just won't survive a step change */
  }
  activeListeners.forEach((l) => l());
}
function subscribeActive(cb: () => void) {
  activeListeners.add(cb);
  return () => void activeListeners.delete(cb);
}

/**
 * The claim board: pick who you are, tap what you had. Claims are never mirrored locally;
 * every tap is a Dexie write and the liveQuery behind `useSplit` re-renders. Must sit inside
 * a <Suspense> boundary (useSheetParam).
 *
 * `onOpenItemSplit` opens #20's ItemSplitSheet for an item (the id stays in local state,
 * never in the URL).
 */
export function ClaimBoard({
  billId,
  onOpenItemSplit,
}: {
  billId: string;
  onOpenItemSplit: (itemId: string) => void;
}) {
  const data = useSplit(billId);
  const storedActive = useSyncExternalStore(
    subscribeActive,
    () => readActive(billId),
    () => null,
  );
  const [filter, setFilter] = useState<Filter>("all");
  const lastTap = useRef(new Map<string, number>());
  const rest = useSheetParam("split-rest");

  // lib/repo pulls in zod (~37 kB gzip), which would push this route past its first-load
  // budget. Load it as a separate chunk, started on mount so the first tap doesn't wait.
  useEffect(() => {
    void import("@/lib/repo");
  }, []);

  if (data === undefined) return <div aria-busy className="px-4 py-6 text-sm text-ink-muted">Loading…</div>;
  if (data === null) return <EmptyState title="Bill not found" body="It may have been deleted." />;

  const { bill, split } = data;
  const { people, items } = bill;
  // A removed person must not stay "active".
  const activeId = people.some((p) => p.id === storedActive) ? storedActive : null;
  const effectiveFilter: Filter = filter === "mine" && activeId === null ? "all" : filter;
  const unclaimedIds = new Set(split.unclaimed.itemIds);

  if (people.length === 0) {
    return (
      <EmptyState
        icon={<UsersGlyph />}
        title="Add people first"
        body="Add everyone at the table, then tap what each person had."
        action={
          <Link
            href={`/bills/${billId}/people`}
            className="inline-flex min-h-11 items-center rounded-sm bg-accent px-4 text-sm font-medium text-on-accent active:bg-accent-deep md:hover:bg-accent-deep"
          >
            Go to People
          </Link>
        }
      />
    );
  }

  const select = (personId: string | null) => writeActive(billId, personId);

  function onTap(itemId: string) {
    if (activeId === null) {
      onOpenItemSplit(itemId);
      return;
    }
    const key = `${activeId}:${itemId}`;
    const now = Date.now();
    if (now - (lastTap.current.get(key) ?? 0) < TAP_DEBOUNCE_MS) return;
    lastTap.current.set(key, now);
    import("@/lib/repo")
      .then(({ toggleClaim }) => toggleClaim(billId, itemId, activeId))
      .catch(() => toast("Couldn't save that claim. Try again.", true));
  }

  const visible = items.filter((item) =>
    effectiveFilter === "unclaimed"
      ? unclaimedIds.has(item.id)
      : effectiveFilter === "mine"
        ? activeId !== null && (item.claims[activeId] ?? 0) > 0
        : true,
  );

  return (
    <>
      <div className="sticky top-0 z-10 border-b border-rule bg-ground pt-[env(safe-area-inset-top)]">
        <ActivePersonBar people={people} activeId={activeId} onSelect={select} />
      </div>

      <div className="flex flex-wrap items-center gap-1 px-3 pt-2" role="group" aria-label="Filter items">
        <Chip pressed={effectiveFilter === "all"} onPressedChange={() => setFilter("all")}>All</Chip>
        <Chip pressed={effectiveFilter === "unclaimed"} onPressedChange={() => setFilter("unclaimed")}>
          Unclaimed ({unclaimedIds.size})
        </Chip>
        <Chip
          pressed={effectiveFilter === "mine"}
          onPressedChange={() => setFilter("mine")}
          disabled={activeId === null}
          className="disabled:opacity-50"
        >
          Mine
        </Chip>
      </div>

      {unclaimedIds.size > 0 ? (
        <div className="px-3 pt-1">
          <Button variant="secondary" className="w-full" onClick={rest.openSheet}>
            Split the rest evenly
          </Button>
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState title="No items yet" body="Add items on the Receipt step first." />
      ) : visible.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-muted" role="status">
          {effectiveFilter === "unclaimed" ? "Everything is claimed ✓" : "Nothing here yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2 px-3 py-3">
          {visible.map((item) => (
            <ClaimableItem
              key={item.id}
              item={item}
              people={people}
              currency={bill.currency}
              activeId={activeId}
              onTap={onTap}
              onOpenSplit={onOpenItemSplit}
            />
          ))}
        </ul>
      )}

      {rest.open && unclaimedIds.size > 0 ? (
        <SplitRestSheet
          billId={billId}
          people={people}
          unclaimedCount={unclaimedIds.size}
          onClose={rest.closeSheet}
        />
      ) : null}
    </>
  );
}
