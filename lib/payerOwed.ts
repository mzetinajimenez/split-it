// lib/payerOwed.ts: what the payer is owed (spec §5.6): the sum of everyone else's totals.
// SplitResult carries no field for it; summing lives here, in lib/, never in a component.
import type { Cents, SplitResult } from "./types";

export function payerOwedCents(split: SplitResult, payerId: string): Cents {
  return split.people.reduce((sum, r) => (r.personId === payerId ? sum : sum + r.totalCents), 0);
}
