#!/usr/bin/env node
// Generates the PWA icons into public/ with Node's built-in zlib (no dependencies).
//   node scripts/generate-icons.mjs
// The mark: a receipt (raised paper, torn bottom edge) on a full-bleed accent field, with a
// vertical "split" line and two item rows. All content sits inside the maskable safe zone
// (a circle of 40% of the icon size, centred), so one geometry serves any + maskable.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Theme tokens (app/globals.css): accent, accent-deep, raised.
const ACCENT = [0x13, 0x70, 0x5a];
const DEEP = [0x0b, 0x51, 0x42];
const PAPER = [0xfc, 0xfa, 0xf5];

const SS = 4; // supersampling per axis

/** Colour of the mark at (x, y) in unit space [0,1]², scaled about the centre by `k`. */
function sample(x, y, k) {
  const u = (x - 0.5) / k; // receipt space, centred, ±0.5 ≈ icon edge at k=1
  const v = (y - 0.5) / k;
  const hw = 0.19; // receipt half width
  const top = -0.25;
  const bottom = 0.25;
  if (Math.abs(u) <= hw && v >= top && v <= bottom) {
    // torn bottom edge: triangular teeth, 6 per receipt width
    const teeth = 6;
    const t = ((u + hw) / (2 * hw)) * teeth;
    const tooth = Math.abs((t % 1) - 0.5) * 2; // 1 at tooth valleys, 0 at points
    const edge = bottom - 0.035 * tooth;
    if (v > edge) return ACCENT;
    // split line down the middle
    if (Math.abs(u) < 0.011) return ACCENT;
    // item rows: left of the split are names, right are amounts
    const rows = [-0.14, -0.04, 0.06];
    for (const r of rows) {
      if (Math.abs(v - r) < 0.018) {
        if (u < -0.03 && u > -0.15) return DEEP;
        if (u > 0.05 && u < 0.15) return DEEP;
      }
    }
    // total bar
    if (Math.abs(v - 0.15) < 0.022 && Math.abs(u) < 0.15) return DEEP;
    return PAPER;
  }
  return ACCENT;
}

function render(size, k) {
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size, k);
          r += c[0]; g += c[1]; b += c[2];
        }
      }
      const n = SS * SS;
      row[1 + px * 3] = Math.round(r / n);
      row[2 + px * 3] = Math.round(g / n);
      row[3 + px * 3] = Math.round(b / n);
    }
    rows.push(row);
  }
  return encodePng(size, size, Buffer.concat(rows));
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB, opaque (iOS fills transparency with black)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
mkdirSync(out, { recursive: true });
const files = [
  ["icon-192.png", 192, 1.25],
  ["icon-512.png", 512, 1.25],
  ["icon-maskable-512.png", 512, 1], // smaller mark: safe zone for any mask shape
  ["apple-touch-icon.png", 180, 1.1],
];
for (const [name, size, k] of files) {
  writeFileSync(join(out, name), render(size, k));
  console.log(`wrote public/${name}`);
}
