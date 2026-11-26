import type { ReactNode } from "react";
import { ReceiptGlyph } from "../ui";

/**
 * The one tab list shared by BottomNav (< md) and NavRail (≥ md), so the two surfaces can't
 * drift apart.
 */

export type NavTab = {
  href: string;
  label: string;
  icon: ReactNode;
  /** Whether this tab is the active one for the current pathname. */
  isActive: (pathname: string) => boolean;
};

function GearGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="square"
      aria-hidden
      focusable="false"
      className="size-5 shrink-0"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
    </svg>
  );
}

export const TABS: NavTab[] = [
  {
    href: "/",
    label: "Bills",
    icon: <ReceiptGlyph />,
    // Bills also owns the bill workspace (/bills/*).
    isActive: (p) => p === "/" || p === "/bills" || p.startsWith("/bills/"),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: <GearGlyph />,
    isActive: (p) => p === "/settings" || p.startsWith("/settings/"),
  },
];

/** Height of the bottom bar's content row (the safe-area inset is added on top). */
export const BOTTOM_BAR_HEIGHT = "4rem";

/**
 * `bottom-*` classes that sit a fixed element just above the bottom bar (BottomNav, or the
 * StepNav / shared-view bar that takes its slot) below `md`, and near the viewport edge at
 * `md`+ where there is no bottom bar. Used by Toaster, StepNav and TotalsTray.
 */
export const BOTTOM_BAR_CLEARANCE =
  "bottom-[calc(5.75rem+env(safe-area-inset-bottom))] md:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]";
