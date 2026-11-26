/**
 * Theme contract (spec §8, CLAUDE.md "Theme").
 *
 * 1. The `@theme` block in app/globals.css defines exactly the semantic colour tokens spec §8
 *    fixes — parallel issues code against these names.
 * 2. No raw hex colour anywhere in app/, except the token definitions themselves and a
 *    `themeColor` metadata line.
 * 3. Every colour utility in app/ names a split-it token. This is a positive check, not a
 *    denylist: `bg-gray-100`, `text-white`, `border-[#eee]` and `ring-sky-400` all fail, and
 *    so does a typo such as `text-ink-mute`.
 * 4. Every text/surface pair the app uses meets WCAG AA, measured from the live token values.
 *    Contrast is a property of the pair, not the token. Add a pair here before using it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const APP = join(ROOT, "app");
const GLOBALS = join(APP, "globals.css");

const SPEC_COLOR_TOKENS = [
  "ground",
  "ground-deep",
  "raised",
  "rule",
  "rule-strong",
  "ink",
  "ink-muted",
  "accent",
  "accent-deep",
  "on-accent",
  "attention",
  "danger",
  "danger-deep",
  "person-0",
  "person-1",
  "person-2",
  "person-3",
  "person-4",
  "person-5",
  "person-6",
  "person-7",
  "on-person",
];
const SPEC_FONT_TOKENS = ["display", "body", "mono"];

/* ---------------------------------------------------------------------------------------- */

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const appFiles = walk(APP).filter((f) => /\.(tsx?|css)$/.test(f));
const globalsCss = readFileSync(GLOBALS, "utf8");

function themeBlock(css: string): string {
  const start = css.indexOf("@theme");
  expect(start, "app/globals.css has an @theme block").toBeGreaterThanOrEqual(0);
  // Walk braces so nested @keyframes inside @theme are included.
  let depth = 0;
  for (let i = css.indexOf("{", start); i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error("unterminated @theme block");
}

const theme = themeBlock(globalsCss);
const colorTokens = new Map(
  [...theme.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1], m[2]]),
);
const fontTokens = [...theme.matchAll(/--font-([a-z0-9-]+):/gi)].map((m) => m[1]);

/* ---------------------------------------------------------------------------------------- */
/* Colour utilities                                                                          */
/* ---------------------------------------------------------------------------------------- */

const SIZES = ["0", "1", "2", "4", "8"];
const SIDES = ["x", "y", "t", "r", "b", "l", "s", "e"];
const TEXT_SIZES = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl"];

/** For each colour-capable prefix, the suffixes that are NOT colours (widths, styles, …). */
const NON_COLOR: Record<string, (s: string) => boolean> = {
  text: (s) =>
    TEXT_SIZES.includes(s) ||
    ["left", "center", "right", "justify", "start", "end", "wrap", "nowrap", "balance", "pretty", "ellipsis", "clip"].includes(s),
  bg: (s) =>
    /^(fixed|local|scroll|none|auto|cover|contain|repeat(-x|-y|-round|-space)?|no-repeat)$/.test(s) ||
    /^(top|bottom|left|right|center)(-(top|bottom|left|right))?$/.test(s) ||
    /^(clip|origin|blend)-/.test(s) ||
    /^(linear|radial|conic)(-|$)/.test(s),
  border: (s) =>
    SIZES.includes(s) ||
    SIDES.includes(s) ||
    new RegExp(`^(${SIDES.join("|")})-(${SIZES.join("|")})$`).test(s) ||
    /^(solid|dashed|dotted|double|hidden|none|collapse|separate)$/.test(s) ||
    /^spacing-/.test(s),
  ring: (s) => SIZES.includes(s) || s === "inset",
  "ring-offset": (s) => SIZES.includes(s),
  outline: (s) => SIZES.includes(s) || /^(none|hidden|solid|dashed|dotted|double)$/.test(s) || /^offset-/.test(s),
  divide: (s) => /^(x|y)(-\d+|-reverse)?$/.test(s) || /^(solid|dashed|dotted|double|none)$/.test(s),
  shadow: (s) => /^(2xs|xs|sm|md|lg|xl|2xl|none|inner)$/.test(s),
  "inset-shadow": (s) => /^(2xs|xs|sm|none)$/.test(s),
  "drop-shadow": (s) => /^(xs|sm|md|lg|xl|2xl|none)$/.test(s),
  "text-shadow": (s) => /^(2xs|xs|sm|md|lg|none)$/.test(s),
  stroke: (s) => /^\d+$/.test(s) || s === "none",
  fill: (s) => s === "none",
  decoration: (s) => /^(solid|double|dotted|dashed|wavy|auto|from-font|clone|slice|\d+)$/.test(s),
  accent: (s) => s === "auto",
  caret: () => false,
  placeholder: () => false,
};
// Longest prefix first, so `ring-offset-ink` is read as ring-offset + ink, not ring + offset-ink.
const PREFIXES = Object.keys(NON_COLOR).sort((a, b) => b.length - a.length);
// Gradient stops share their prefixes with ordinary words ("to-do"), so they get a narrower
// check: a token, a position, or else it must not look like a colour at all.
const GRADIENT = /^(from|via|to)-(.+)$/;
const TAILWIND_PALETTE =
  /^(white|black|(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe)-\d{2,3})$/;
const COLORISH_ARBITRARY = /#|rgba?\(|hsla?\(|oklch\(|oklab\(|lab\(|lch\(|color-mix\(|^color:|--color-/i;

/** Returns an error message if `cls` is a colour utility that doesn't name a token. */
export function checkClass(cls: string, tokens: ReadonlySet<string>): string | null {
  // Drop variants (`md:hover:`, `group-active:`, `aria-invalid:`), keeping bracketed parts whole.
  let depth = 0;
  let cut = 0;
  for (let i = 0; i < cls.length; i++) {
    const c = cls[i];
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (c === ":" && depth === 0) cut = i + 1;
  }
  let u = cls.slice(cut).replace(/^!|!$/g, "").replace(/^-/, "");
  // Opacity modifier: bg-ink/40.
  const slash = u.match(/^(.*?)\/(\d+|\[[^\]]+\]|\([^)]+\))$/);
  if (slash) u = slash[1];

  const isToken = (s: string) => tokens.has(s) || s === "transparent" || s === "current" || s === "inherit";

  // A bare token name (e.g. a swatch label "accent-deep") is not a utility.
  if (tokens.has(u)) return null;

  const g = u.match(GRADIENT);
  if (g) {
    const s = g[2];
    if (isToken(s) || /^\d+%$/.test(s)) return null;
    if (TAILWIND_PALETTE.test(s) || /^[[(]/.test(s)) return `${cls}: gradient stop must be a split-it token`;
    return null;
  }

  for (const prefix of PREFIXES) {
    if (!u.startsWith(prefix + "-")) continue;
    let s = u.slice(prefix.length + 1);
    // Side-specific border colours: border-t-rule, border-x-ink.
    if (prefix === "border") {
      const side = s.match(new RegExp(`^(${SIDES.join("|")})-(.+)$`));
      if (side && !SIZES.includes(side[2])) s = side[2];
    }
    if (/^[[(]/.test(s)) {
      return COLORISH_ARBITRARY.test(s) ? `${cls}: arbitrary colour; use a split-it token` : null;
    }
    if (isToken(s) || NON_COLOR[prefix](s)) return null;
    return `${cls}: "${s}" is not a split-it colour token`;
  }
  return null;
}

/** Every string literal / template chunk in a TS(X) file: where class names live. */
function stringLiterals(file: string, source: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) ||
      ts.isTemplateTail(n)
    ) {
      out.push(n.text);
    }
    n.forEachChild(visit);
  };
  visit(sf);
  return out;
}

/* ---------------------------------------------------------------------------------------- */
/* Contrast                                                                                  */
/* ---------------------------------------------------------------------------------------- */

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const SURFACES = ["ground", "ground-deep", "raised"];
const PERSONS = Array.from({ length: 8 }, (_, i) => `person-${i}`);
/** [foreground, background, minimum ratio]. 4.5 = AA text; 3 = AA non-text (WCAG 1.4.11). */
const PAIRS: [string, string, number][] = [
  ...["ink", "ink-muted", "accent", "attention", "danger"].flatMap((fg) =>
    SURFACES.map((bg): [string, string, number] => [fg, bg, 4.5]),
  ),
  ["on-accent", "accent", 4.5],
  ["on-accent", "accent-deep", 4.5],
  ["on-accent", "danger", 4.5],
  ["on-accent", "danger-deep", 4.5],
  ["ground", "ink", 4.5], // the "+k" overflow avatar
  ["ground", "danger", 4.5], // savor's convention on destructive fills (ConfirmBox, #5)
  ["ground", "danger-deep", 4.5],
  ...PERSONS.map((p): [string, string, number] => ["on-person", p, 4.5]),
  // Control boundaries (input, stepper, secondary button, chip borders) and the focus ring.
  ["rule-strong", "ground", 3],
  ["rule-strong", "raised", 3],
  ["rule-strong", "ground-deep", 3],
  ["ink", "ground", 3],
];

/* ---------------------------------------------------------------------------------------- */

describe("theme contract", () => {
  it("defines exactly the spec §8 colour tokens", () => {
    expect([...colorTokens.keys()].sort()).toEqual([...SPEC_COLOR_TOKENS].sort());
  });

  it("defines the spec §8 font tokens and --radius-sm", () => {
    expect(fontTokens.filter((f) => f !== "*").sort()).toEqual([...SPEC_FONT_TOKENS].sort());
    expect(theme).toMatch(/--radius-sm:/);
  });

  it("resets Tailwind's default palette so off-palette utilities generate nothing", () => {
    expect(theme).toMatch(/--color-\*:\s*initial/);
  });

  it("provides the motion classes #5's Sheet and Toast consume, with a reduced-motion block", () => {
    for (const cls of ["anim-fade", "anim-sheet", "anim-pop", "anim-toast"]) {
      expect(globalsCss).toMatch(new RegExp(`\\.${cls}\\s*\\{\\s*animation:`));
    }
    expect(globalsCss).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
  });

  it("has no raw hex colours in app/ outside the token definitions", () => {
    const hex = /(?<![\w&])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/gi;
    const offenders: string[] = [];
    for (const f of appFiles) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (!hex.test(line)) return;
          hex.lastIndex = 0;
          const isTokenDef = f === GLOBALS && /^\s*--color-[a-z0-9-]+:\s*#[0-9a-f]{6}\s*;/i.test(line);
          const isThemeColor = /\bthemeColor\b/.test(line);
          if (!isTokenDef && !isThemeColor) offenders.push(`${relative(ROOT, f)}:${i + 1}: ${line.trim()}`);
        });
      hex.lastIndex = 0;
    }
    expect(offenders).toEqual([]);
  });

  it("uses only split-it tokens in colour utilities", () => {
    const tokens = new Set(colorTokens.keys());
    const offenders: string[] = [];
    for (const f of appFiles) {
      const src = readFileSync(f, "utf8");
      const chunks = f.endsWith(".css")
        ? [...src.matchAll(/@apply\s+([^;]+);/g)].map((m) => m[1])
        : stringLiterals(f, src);
      for (const chunk of chunks) {
        for (const cls of chunk.split(/\s+/).filter(Boolean)) {
          const err = checkClass(cls, tokens);
          if (err) offenders.push(`${relative(ROOT, f)}: ${err}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("references only defined tokens through var(--color-…)", () => {
    const offenders: string[] = [];
    for (const f of appFiles) {
      for (const m of readFileSync(f, "utf8").matchAll(/var\(--color-([a-z0-9-]+)\)/g)) {
        if (!colorTokens.has(m[1])) offenders.push(`${relative(ROOT, f)}: --color-${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it.each(PAIRS)("%s on %s meets %s:1", (fg, bg, min) => {
    const a = colorTokens.get(fg);
    const b = colorTokens.get(bg);
    expect(a, fg).toBeDefined();
    expect(b, bg).toBeDefined();
    expect(contrast(a!, b!)).toBeGreaterThanOrEqual(min);
  });

  describe("checkClass (self-test)", () => {
    const tokens = new Set(SPEC_COLOR_TOKENS);
    it.each([
      "bg-gray-100",
      "text-white",
      "md:hover:bg-black",
      "border-[#eeeeee]",
      "bg-[rgb(0,0,0)]",
      "text-ink-mute",
      "ring-sky-400/50",
      "border-t-slate-200",
      "from-rose-500",
      "fill-red-500",
      "text-(--color-nope)",
    ])("rejects %s", (cls) => {
      expect(checkClass(cls, tokens)).not.toBeNull();
    });
    it.each([
      "bg-ground",
      "text-on-accent",
      "md:hover:bg-accent-deep",
      "group-active:bg-ground-deep",
      "bg-ink/40",
      "border-rule-strong",
      "border-t-rule",
      "border-t",
      "border-b-2",
      "border-dashed",
      "ring-2",
      "ring-ground",
      "text-sm",
      "text-[0.625rem]",
      "text-center",
      "bg-transparent",
      "outline-none",
      "shadow-sm",
      "aria-invalid:border-danger",
      "placeholder:text-ink-muted",
      "to-do",
      "rounded-sm",
      "-ml-1.5",
    ])("accepts %s", (cls) => {
      expect(checkClass(cls, tokens)).toBeNull();
    });
  });
});
