"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlusGlyph } from "../ui";
import { emitNewBill } from "./newBill";
import { ownsBottomBar } from "@/lib/navRoutes";
import { TABS } from "./tabs";

const tabClass = (active: boolean) =>
  `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors active:bg-ground-deep ${
    active ? "text-accent" : "text-ink-muted"
  }`;

export function BottomNav() {
  const pathname = usePathname();
  // /bills/* and /s render their own bar in this same slot.
  if (ownsBottomBar(pathname)) return null;

  const [bills, settings] = TABS;
  const link = (tab: (typeof TABS)[number]) => {
    const active = tab.isActive(pathname);
    return (
      <Link
        key={tab.href}
        href={tab.href}
        aria-current={active ? "page" : undefined}
        className={tabClass(active)}
      >
        {tab.icon}
        {tab.label}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-ground pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center">
        {link(bills)}
        <button
          type="button"
          onClick={emitNewBill}
          aria-label="New bill"
          className="-mt-7 flex size-14 items-center justify-center rounded-full border-4 border-ground bg-accent text-on-accent shadow-lg transition-colors select-none active:bg-accent-deep"
        >
          <PlusGlyph className="size-6" />
        </button>
        {link(settings)}
      </div>
    </nav>
  );
}
