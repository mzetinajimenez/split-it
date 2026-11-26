import { IBM_Plex_Mono, IBM_Plex_Sans, Space_Mono } from "next/font/google";

// Three faces, subset to latin and to the weights the app uses. Each exposes a CSS variable
// that the `--font-display` / `--font-body` / `--font-mono` tokens in app/globals.css read,
// so components only ever say `font-display`, `font-body` or `font-mono`.

/** Headings and the wordmark: a receipt-header monospace. */
export const displayFont = Space_Mono({
  subsets: ["latin"],
  weight: ["700"],
  variable: "--font-display-face",
  display: "swap",
});

/** Running text and controls. */
export const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body-face",
  display: "swap",
});

/** Every money value and figure column (with the `tabular` utility). */
export const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono-face",
  display: "swap",
});

/** Class names that set all three variables; applied once on <html>. */
export const fontVariables = `${displayFont.variable} ${bodyFont.variable} ${monoFont.variable}`;
