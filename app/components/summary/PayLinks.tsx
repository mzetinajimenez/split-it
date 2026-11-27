"use client";

// PayLinks (#30): "Pay Sam $38.20" links into Venmo, Cash App and PayPal.me, one row per
// person who owes the payer. Prop-driven and render-only: the amounts are the SplitResult
// totals (the payer absorbs rounding, spec §5.2, so a non-payer's total is exactly what they
// owe), formatted by lib/payLinks from integer minor units. The links are plain anchors: the
// person taps one and their payment app opens. Nothing is fetched or sent from here.

import Link from "next/link";
import type { ReactNode } from "react";
import { buildPayLinks, supportsCurrency } from "@/lib/payLinks";
import { initials } from "@/lib/people";
import type { Bill, SplitResult } from "@/lib/types";
import { Avatar, Money } from "../ui";

export function PayLinks({ bill, split }: { bill: Bill; split: SplitResult }) {
  const payer = bill.people.find((p) => p.id === bill.paidBy);
  if (!payer) return null;

  const handles = payer.handles;
  const owing = split.people.filter((r) => r.personId !== payer.id && !r.settled && r.totalCents > 0);
  if (owing.length === 0) return null;

  const heading = (
    <h2 id="pay-links-heading" className="font-display text-lg font-bold text-ink">
      Pay {payer.name}
    </h2>
  );
  const hint = (text: ReactNode) => (
    <section aria-labelledby="pay-links-heading" data-testid="pay-links" className="flex flex-col gap-1">
      {heading}
      <p className="text-sm text-ink-muted">{text}</p>
    </section>
  );

  if (!handles) {
    return hint(
      <>
        Add {payer.name}’s Venmo, Cash App or PayPal.me on the{" "}
        <Link href={`/bills/${bill.id}/people`} className="font-medium text-accent-deep underline underline-offset-2">
          People step
        </Link>{" "}
        to show pay links here.
      </>,
    );
  }

  const usable = (["venmo", "cashapp", "paypal"] as const).filter(
    (s) => handles[s === "cashapp" ? "cashtag" : s] !== undefined && supportsCurrency(s, bill.currency),
  );
  if (usable.length === 0) {
    return hint(`${payer.name}’s payment apps don’t take ${bill.currency}. Venmo and Cash App are USD only.`);
  }
  if (split.status === "unclaimed") {
    return hint("Pay links appear once every item is claimed, so nobody pays a total that’s still changing.");
  }

  const note = `${bill.title} (split-it)`;

  return (
    <section aria-labelledby="pay-links-heading" data-testid="pay-links" className="flex flex-col gap-2">
      {heading}
      <ul className="flex flex-col gap-2">
        {owing.map((r) => {
          const person = bill.people.find((p) => p.id === r.personId);
          if (!person) return null;
          const links = buildPayLinks({ handles, cents: r.totalCents, currency: bill.currency, note });
          if (links.length === 0) return null;
          return (
            <li
              key={r.personId}
              data-testid={`pay-${person.name}`}
              className="flex flex-col gap-2 rounded-sm border border-rule bg-raised px-3 py-3"
            >
              <div className="flex items-center gap-3">
                <Avatar initials={initials(person.name)} colorIndex={person.colorIndex} size="sm" />
                <span className="min-w-0 flex-1 truncate text-ink">
                  <span className="font-medium">{person.name}</span>
                  <span className="text-ink-muted"> pays {payer.name}</span>
                </span>
                <Money cents={r.totalCents} currency={bill.currency} className="font-bold text-ink" />
              </div>
              <div className="flex flex-wrap gap-2">
                {links.map((l) => (
                  <a
                    key={l.service}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                    aria-label={`${person.name}: pay ${payer.name} with ${l.label}`}
                    className="inline-flex min-h-11 items-center justify-center rounded-sm border border-rule-strong bg-raised px-4 text-sm font-medium text-accent-deep active:bg-ground-deep md:hover:bg-ground-deep"
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-ink-muted">Opens the app with the amount filled in. Check it before you send.</p>
    </section>
  );
}
