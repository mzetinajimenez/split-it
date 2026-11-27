// The five bill steps, in order. One list shared by every StepNav surface (phone bar, desktop
// segmented bar) so they can't drift apart. Framework-free apart from the icon component refs.

import { ReceiptGlyph, SplitGlyph, SummaryGlyph, TipGlyph, UsersGlyph } from "@/app/components/ui";

export type StepKey = "receipt" | "people" | "split" | "tip" | "summary";

export interface Step {
  key: StepKey;
  label: string;
  Icon: typeof ReceiptGlyph;
}

export const STEPS: readonly Step[] = [
  { key: "receipt", label: "Receipt", Icon: ReceiptGlyph },
  { key: "people", label: "People", Icon: UsersGlyph },
  { key: "split", label: "Split", Icon: SplitGlyph },
  { key: "tip", label: "Tip", Icon: TipGlyph },
  { key: "summary", label: "Summary", Icon: SummaryGlyph },
];

/** The step a pathname like `/bills/abc/split` is on, or null (the bare `/bills/abc`). */
export function activeStep(pathname: string): StepKey | null {
  const last = pathname.replace(/\/+$/, "").split("/").pop();
  return STEPS.find((s) => s.key === last)?.key ?? null;
}
