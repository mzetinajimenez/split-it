// lib/people.ts: small, framework-free helpers for people on a bill.

import type { Person } from "./types";

/** Number of person colours: tokens `person-0` … `person-7`. */
export const PERSON_COLORS = 8;

const segmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

/** First user-perceived character (grapheme), so "👩‍👩‍👧 Fam" yields the whole family emoji. */
function firstGrapheme(word: string): string {
  if (segmenter) {
    for (const { segment } of segmenter.segment(word)) return segment;
    return "";
  }
  return Array.from(word)[0] ?? ""; // code-point fallback: never splits a surrogate pair
}

/**
 * Avatar initials: the first grapheme of the first and last words, upper-cased.
 * "Alex Kim" → "AK", "blair" → "B", "Mary Jane Watson" → "MW", "  " → "". Emoji-safe.
 */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = firstGrapheme(words[0]);
  const last = words.length > 1 ? firstGrapheme(words[words.length - 1]) : "";
  return (first + last).toLocaleUpperCase();
}

/**
 * Colour for the next person added: the lowest index in 0..7 no one on the bill uses. Once
 * all 8 are taken it wraps: the least-used colour, lowest index first (the 9th person gets
 * 0, the 10th gets 1, …). Out-of-range indices are ignored.
 */
export function nextColorIndex(people: Person[]): number {
  const counts = new Array<number>(PERSON_COLORS).fill(0);
  for (const p of people) {
    if (Number.isInteger(p.colorIndex) && p.colorIndex >= 0 && p.colorIndex < PERSON_COLORS) counts[p.colorIndex] += 1;
  }
  let best = 0;
  for (let i = 1; i < PERSON_COLORS; i++) if (counts[i] < counts[best]) best = i;
  return best;
}
