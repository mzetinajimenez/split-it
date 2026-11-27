"use client";

// StepNav (spec §8 "Global navigation"): the five steps as plain <Link>s, so each change pushes
// history and phone Back walks back through the steps and then to `/`. Below `md` it is the
// fixed bottom bar in BottomNav's slot (BottomNav hides itself under /bills/*, lib/navRoutes.ts);
// from `md` it is a segmented bar under the header. Badge text is part of the accessible name.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckGlyph } from "@/app/components/ui";
import type { SplitResult } from "@/lib/types";
import { activeStep, STEPS, type StepKey } from "./steps";

type Badge = { text: string; name: string; tone: "attention" | "accent" } | null;

function badgeFor(key: StepKey, split: SplitResult | undefined): Badge {
  if (!split) return null;
  if (key === "split" && split.status === "unclaimed") {
    const n = split.unclaimed.itemIds.length;
    return { text: String(n), name: `${n} unclaimed`, tone: "attention" };
  }
  if (key === "summary" && split.status === "balanced") {
    return { text: "✓", name: "balanced", tone: "accent" };
  }
  return null;
}

export default function StepNav({ billId, split }: { billId: string; split?: SplitResult }) {
  const pathname = usePathname();
  const current = activeStep(pathname);

  const items = STEPS.map((step) => {
    const active = step.key === current;
    const badge = badgeFor(step.key, split);
    return (
      <li key={step.key} className="min-w-0 flex-1">
        <Link
          href={`/bills/${billId}/${step.key}`}
          aria-current={active ? "step" : undefined}
          aria-label={badge ? `${step.label}, ${badge.name}` : step.label}
          className={`relative flex min-h-11 w-full flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-xs font-medium select-none md:flex-row md:gap-2 md:rounded-sm md:px-3 md:text-sm ${
            active
              ? "text-accent md:bg-accent md:text-on-accent"
              : "text-ink-muted active:bg-ground-deep md:text-ink md:hover:bg-ground-deep"
          }`}
        >
          <span className="relative">
            <step.Icon className="size-5 shrink-0" />
            {badge ? (
              <span
                aria-hidden
                className={`absolute -top-1.5 -right-2.5 flex min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] leading-4 font-bold md:hidden ${
                  badge.tone === "attention" ? "bg-attention text-ink" : "bg-accent text-on-accent"
                }`}
              >
                {badge.text}
              </span>
            ) : null}
          </span>
          <span className="truncate">{step.label}</span>
          {badge ? (
            <span
              aria-hidden
              className={`hidden min-w-5 items-center justify-center rounded-full px-1.5 text-xs leading-5 font-bold md:flex ${
                badge.tone === "attention" ? "bg-attention text-ink" : "bg-accent text-on-accent"
              }`}
            >
              {badge.text === "✓" ? <CheckGlyph className="size-3.5" /> : badge.text}
            </span>
          ) : null}
        </Link>
      </li>
    );
  });

  return (
    <nav
      aria-label="Bill steps"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-ground pb-[env(safe-area-inset-bottom)] md:static md:z-auto md:border-t-0 md:border-b md:pb-0"
    >
      <ol className="mx-auto flex h-16 max-w-[720px] items-stretch md:h-auto md:gap-1 md:px-2 md:py-2">{items}</ol>
    </nav>
  );
}
