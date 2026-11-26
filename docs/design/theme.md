# split-it theme: "Thermal"

The tokens live in [`app/globals.css`](../../app/globals.css) (`@theme`); this file records
the values and the measured contrast for every text/surface pair the app uses. The same pairs
are asserted in [`lib/theme-contract.test.ts`](../../lib/theme-contract.test.ts), so changing a
value that breaks a pair fails `npm test`. **Contrast is a property of the pair, not the token:
add a pair here (and in the test) before using it.**

## Direction

Receipt paper. A warm off-white **ground** with near-black **ink**, hairline **rules** instead of
cards, monospace tabular figures for every amount (IBM Plex Mono), a receipt-header monospace
for headings (Space Mono 700), IBM Plex Sans for running text, and one confident accent: a
receipt-stamp green. Person colours are soft risograph inks with ink-coloured initials.

Light only: spec §8 describes a single "Thermal" palette. A dark variant would be a second
set of values for the same token names, redefined under a `prefers-color-scheme` block.

## Tokens

| Token | Value | Role |
|---|---|---|
| `ground` | `#F5F1E8` | page background |
| `ground-deep` | `#EAE4D6` | pressed/hover fill, inset areas |
| `raised` | `#FCFAF5` | rows, inputs, sheets |
| `rule` | `#DDD5C4` | decorative hairlines (never text, never a control's only edge) |
| `rule-strong` | `#857B68` | control borders, perforated dividers |
| `ink` | `#1C1A16` | primary text |
| `ink-muted` | `#5C564B` | secondary text |
| `accent` | `#13705A` | yes / primary / active |
| `accent-deep` | `#0B5142` | accent pressed and hover |
| `on-accent` | `#FCFAF5` | text and icons on accent and danger fills |
| `attention` | `#8F5200` | needs action (unclaimed): not an error |
| `danger` | `#B3261E` | destructive and error only |
| `danger-deep` | `#8C1D17` | danger pressed and hover |
| `person-0` | `#F2C14E` | person colour |
| `person-1` | `#ED9B7A` | person colour |
| `person-2` | `#CC6F9C` | person colour |
| `person-3` | `#9C9DEC` | person colour |
| `person-4` | `#95D6F4` | person colour |
| `person-5` | `#6CC6B0` | person colour |
| `person-6` | `#C3DFA1` | person colour |
| `person-7` | `#A39248` | person colour |
| `on-person` | `#1C1A16` | initials on person colours |

Fonts: `font-display` Space Mono 700 · `font-body` IBM Plex Sans 400/500/600 · `font-mono`
IBM Plex Mono 400/500/600 (with the `tabular` utility). Radius: `--radius-sm` 3px;
`rounded-full` only for avatars, dots and the FAB.

## Contrast (WCAG 2.x)

AA: 4.5:1 for text, 3:1 for non-text UI (WCAG 1.4.11). All pairs below are opaque; with an
opacity modifier, compute the alpha-composited colour first.

| Foreground | Background | Ratio | AA min | Used for |
|---|---|---|---|---|
| `ink` | `ground` | 15.41 | 4.5 | body text, item names, headings |
| `ink` | `ground-deep` | 13.71 | 4.5 | body text, item names, headings |
| `ink` | `raised` | 16.66 | 4.5 | body text, item names, headings |
| `ink-muted` | `ground` | 6.45 | 4.5 | dates, hints, qty, captions |
| `ink-muted` | `ground-deep` | 5.74 | 4.5 | dates, hints, qty, captions |
| `ink-muted` | `raised` | 6.97 | 4.5 | dates, hints, qty, captions |
| `accent` | `ground` | 5.33 | 4.5 | active labels, links |
| `accent` | `ground-deep` | 4.74 | 4.5 | active labels, links |
| `accent` | `raised` | 5.76 | 4.5 | active labels, links |
| `attention` | `ground` | 5.52 | 4.5 | "Unclaimed" labels and dots |
| `attention` | `ground-deep` | 4.91 | 4.5 | "Unclaimed" labels and dots |
| `attention` | `raised` | 5.97 | 4.5 | "Unclaimed" labels and dots |
| `danger` | `ground` | 5.80 | 4.5 | field errors, destructive text |
| `danger` | `ground-deep` | 5.16 | 4.5 | field errors, destructive text |
| `danger` | `raised` | 6.27 | 4.5 | field errors, destructive text |
| `on-accent` | `accent` | 5.76 | 4.5 | primary button, pressed chip, selected segment |
| `on-accent` | `accent-deep` | 8.87 | 4.5 | primary pressed / hover |
| `on-accent` | `danger` | 6.27 | 4.5 | danger button |
| `on-accent` | `danger-deep` | 8.74 | 4.5 | danger pressed / hover |
| `ground` | `ink` | 15.41 | 4.5 | "+k" overflow avatar |
| `ground` | `danger` | 5.80 | 4.5 | savor-style text-ground on a destructive fill |
| `ground` | `danger-deep` | 8.09 | 4.5 | ConfirmBox destructive confirm (#5) |
| `on-person` | `person-0` | 10.35 | 4.5 | avatar initials |
| `on-person` | `person-1` | 7.92 | 4.5 | avatar initials |
| `on-person` | `person-2` | 5.23 | 4.5 | avatar initials |
| `on-person` | `person-3` | 6.99 | 4.5 | avatar initials |
| `on-person` | `person-4` | 10.92 | 4.5 | avatar initials |
| `on-person` | `person-5` | 8.56 | 4.5 | avatar initials |
| `on-person` | `person-6` | 11.91 | 4.5 | avatar initials |
| `on-person` | `person-7` | 5.59 | 4.5 | avatar initials |
| `rule-strong` | `ground` | 3.70 | 3 | control borders (non-text, 1.4.11) |
| `rule-strong` | `ground-deep` | 3.29 | 3 | control borders (non-text, 1.4.11) |
| `rule-strong` | `raised` | 4.00 | 3 | control borders (non-text, 1.4.11) |
| `ink` | `ground` | 15.41 | 3 | focus ring (non-text) |

`rule` (`#DDD5C4`) is decorative: 1.29:1 on ground, 1.40:1 on raised. It is never text and never the only edge
of a control.

**Text on a danger fill:** there is no separate `on-danger` token. `on-accent` is the
text token for every solid action fill, `accent` and `danger` alike (this is what `Button
variant="danger"` uses). savor's `text-ground` on `danger-deep` also clears AA (8.09:1).

## Person colours and colour-vision deficiency

Each person colour carries ink initials (≥ 5.23:1). The eight were
chosen by maximising the smallest pairwise OKLab distance after simulating each deficiency
(Machado, Oliveira & Fernandes 2009, severity 1.0). For scale, ≈ 0.02 is a just-noticeable
difference; every pair stays well above it:

| Vision | Closest pair | Min OKLab distance |
|---|---|---|
| Typical | person-0 / person-6 | 0.102 |
| Protanopia | person-1 / person-7 | 0.081 |
| Deuteranopia | person-0 / person-6 | 0.081 |
| Tritanopia | person-4 / person-5 | 0.079 |

Colour is never the only cue: avatars always show initials, and names are printed beside them
wherever there's room.
