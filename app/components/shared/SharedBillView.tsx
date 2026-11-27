"use client";

// SharedBillView (#25, spec §7): the read-only bill behind a `/s#<payload>` link.
//
// The payload lives ONLY in the URL fragment, which the browser never sends to a server, so
// nothing is rendered from it on the server: the page prerenders a loading shell and this
// component reads `location.hash` after mount (and again on `hashchange`). Decoding needs no
// network beyond the app's own static chunks, so a cached shell renders a link offline.
//
// Bundle: `lib/share` (zod) and `lib/repo` (zod + Dexie writes) are dynamic imports. The
// codec loads right after mount; the repo only when "Save a copy" is pressed.
//
// Nothing here writes until "Save a copy": the "Which one are you?" choice is local state.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { computeSplit } from "@/lib/split";
import type { Bill, BillSnapshot } from "@/lib/types";
import { PayerLine } from "../summary/PayerLine";
import { PersonBreakdown } from "../summary/PersonBreakdown";
import { ReconcileBanner } from "../summary/ReconcileBanner";
import { toast } from "../Toast";
import { Button, Chip, EmptyState, HeaderShell, ReceiptGlyph } from "../ui";

type State =
  | { status: "loading" }
  | { status: "error"; reason: "version" | "broken" }
  | { status: "ready"; snapshot: BillSnapshot };

const ERRORS = {
  version: {
    title: "Newer link",
    body: "This link was made by a newer version of split-it — refresh to update",
  },
  broken: {
    title: "Can’t open this bill",
    body: "This link looks broken or incomplete",
  },
} as const;

/** "2026-11-25" → "Nov 25, 2026". A calendar day, so formatted in UTC. */
function formatDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return date;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(dt);
}

/** The summary components take a `Bill`; a snapshot is one minus its sync fields. */
function asBill(snapshot: BillSnapshot): Bill {
  return { ...snapshot, id: "shared", createdAt: "", updatedAt: "", deletedAt: null };
}

function useSharedSnapshot(): State {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let current = 0;
    const decode = () => {
      const run = ++current;
      const hash = window.location.hash;
      setState({ status: "loading" });
      import("@/lib/share")
        .then(({ decodeShare }) => decodeShare(hash))
        .then(
          (snapshot) => {
            if (run === current) setState({ status: "ready", snapshot });
          },
          (err: unknown) => {
            if (run !== current) return;
            const reason = err instanceof Error && "reason" in err && err.reason === "version" ? "version" : "broken";
            setState({ status: "error", reason });
          },
        );
    };
    decode();
    window.addEventListener("hashchange", decode);
    return () => {
      current = -1;
      window.removeEventListener("hashchange", decode);
    };
  }, []);

  return state;
}

const openApp = (
  <Link
    href="/"
    className="inline-flex min-h-11 items-center rounded-sm px-3 text-sm font-medium text-accent-deep active:bg-ground-deep md:hover:bg-ground-deep"
  >
    Open split-it
  </Link>
);

export function SharedBillView() {
  const state = useSharedSnapshot();

  if (state.status === "loading") {
    return (
      <>
        <HeaderShell title="Shared bill" actions={openApp} />
        <main className="px-4 py-12" aria-busy="true">
          <p role="status" className="text-center text-sm text-ink-muted">
            Opening the bill…
          </p>
        </main>
      </>
    );
  }

  if (state.status === "error") {
    const copy = ERRORS[state.reason];
    return (
      <>
        <HeaderShell title="Shared bill" actions={openApp} />
        <main className="px-4" data-testid="shared-error">
          <EmptyState icon={<ReceiptGlyph />} title={copy.title} body={copy.body} />
        </main>
      </>
    );
  }

  return <SharedBill snapshot={state.snapshot} />;
}

function SharedBill({ snapshot }: { snapshot: BillSnapshot }) {
  const router = useRouter();
  const bill = useMemo(() => asBill(snapshot), [snapshot]);
  const split = useMemo(() => computeSplit(bill), [bill]);
  const [me, setMe] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pick = (personId: string, pressed: boolean) => {
    const next = pressed ? personId : null;
    setMe(next);
    if (next === null) return;
    // After the highlight renders, bring that row into view.
    requestAnimationFrame(() => {
      const row = document.querySelector(`[data-person-id="${CSS.escape(next)}"]`);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      row?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    });
  };

  const saveCopy = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const { importBill } = await import("@/lib/repo");
      const saved = await importBill(snapshot);
      router.push(`/bills/${saved.id}/summary`);
      toast("Saved to your bills");
    } catch {
      setSaving(false);
      toast("Couldn’t save a copy", true);
    }
  };

  return (
    <>
      <HeaderShell title={bill.title} subtitle={`${formatDate(bill.date)} · shared bill`} actions={openApp} />
      <main className="flex flex-col gap-4 px-4 py-4 md:pb-8" data-testid="shared-bill">
        <ReconcileBanner bill={bill} split={split} readOnly />
        <PayerLine bill={bill} split={split} readOnly />

        {bill.people.length > 0 ? (
          <div role="group" aria-label="Which one are you?" className="flex flex-col gap-1">
            <p className="text-sm font-medium text-ink">Which one are you?</p>
            <div className="flex flex-wrap gap-x-2">
              {bill.people.map((p) => (
                <Chip key={p.id} pressed={me === p.id} onPressedChange={(pressed) => pick(p.id, pressed)}>
                  {p.name}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}

        <PersonBreakdown
          bill={bill}
          split={split}
          readOnly
          partial={split.status === "unclaimed"}
          highlightPersonId={me}
        />

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-ground px-4 pb-[env(safe-area-inset-bottom)] md:static md:border-0 md:bg-transparent md:px-0 md:pb-0">
          <div className="flex h-16 items-center md:h-auto md:pt-2">
            <Button variant="primary" size="lg" className="w-full" onClick={saveCopy} disabled={saving}>
              {saving ? "Saving…" : "Save a copy"}
            </Button>
          </div>
        </div>
      </main>
    </>
  );
}
