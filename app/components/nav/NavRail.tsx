"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlusGlyph } from "../ui";
import { emitNewBill } from "./newBill";
import { TABS } from "./tabs";

export function NavRail() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-1 border-r border-rule bg-ground px-3 py-5 md:flex"
    >
      <p className="px-3 pb-4 font-display text-xl text-ink">split-it</p>
      <button
        type="button"
        onClick={emitNewBill}
        className="mb-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-sm bg-accent px-4 text-sm font-medium text-on-accent transition-colors select-none active:bg-accent-deep md:hover:bg-accent-deep"
      >
        <PlusGlyph className="size-4" />
        New bill
      </button>
      {TABS.map((tab) => {
        const active = tab.isActive(pathname);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-sm px-3 text-sm font-medium transition-colors active:bg-ground-deep md:hover:bg-ground-deep ${
              active ? "bg-ground-deep text-accent" : "text-ink"
            }`}
          >
            {tab.icon}
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
