"use client";

import { useState } from "react";
import type { Bill, SplitResult } from "@/lib/types";
import { summaryText } from "@/lib/summaryText";
import { ConfirmBox } from "../ConfirmBox";
import { toast } from "../Toast";
import { Button } from "../ui";

type Kind = "summary" | "link" | "both";

const isAbort = (e: unknown) => e instanceof DOMException && e.name === "AbortError";

/** Feature-detected clipboard write; false when the API is missing or refuses. */
async function copyText(text: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** The link is minted on click; lib/share (and its zod) is loaded lazily, off the summary route's first load. */
async function buildLink(bill: Bill): Promise<string> {
  const { encodeShare, shareUrl } = await import("@/lib/share");
  return shareUrl(window.location.origin, await encodeShare(bill));
}

/**
 * Share the result: text summary, a read-only link (the bill rides in the URL fragment, never a
 * query string or a request), or both. Prop-driven; the page passes the bill and its split.
 */
export function ShareActions({ bill, split }: { bill: Bill; split: SplitResult }) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Kind | null>(null);
  const unclaimed = split.unclaimed.itemIds.length;

  async function run(kind: Kind) {
    setConfirm(null);
    setBusy(true);
    try {
      const text = kind === "link" ? "" : summaryText(bill, split);
      const url = kind === "summary" ? "" : await buildLink(bill);
      const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

      if (kind === "summary") {
        if (canShare) await navigator.share({ title: bill.title, text });
        else if (await copyText(text)) toast("Copied summary");
        else toast("Couldn’t copy the summary", true);
      } else if (kind === "link") {
        if (await copyText(url)) toast("Link copied — anyone with it can view this bill");
        else if (canShare) await navigator.share({ title: bill.title, url });
        else toast("Couldn’t copy the link", true);
      } else {
        const data: ShareData = { title: bill.title, text, url };
        if (canShare && (typeof navigator.canShare !== "function" || navigator.canShare(data))) {
          await navigator.share(data);
        } else if (await copyText(`${text}\n${url}`)) {
          toast("Copied summary and link");
        } else {
          toast("Couldn’t copy", true);
        }
      }
    } catch (e) {
      if (!isAbort(e)) toast("Couldn’t share. Try again", true);
    } finally {
      setBusy(false);
    }
  }

  function start(kind: Kind) {
    if (unclaimed > 0) setConfirm(kind);
    else void run(kind);
  }

  return (
    <section aria-label="Share" className="flex flex-col gap-3">
      {confirm ? (
        <ConfirmBox
          message={`${unclaimed} ${unclaimed === 1 ? "item is" : "items are"} still unclaimed — share anyway?`}
          confirmLabel="Share anyway"
          onCancel={() => setConfirm(null)}
          onConfirm={() => void run(confirm)}
        />
      ) : null}
      <Button variant="primary" size="lg" disabled={busy} onClick={() => start("summary")}>
        Share summary
      </Button>
      <div className="flex gap-2">
        <Button className="flex-1" disabled={busy} onClick={() => start("link")}>
          Copy link
        </Button>
        <Button className="flex-1" disabled={busy} onClick={() => start("both")}>
          Share both
        </Button>
      </div>
    </section>
  );
}
