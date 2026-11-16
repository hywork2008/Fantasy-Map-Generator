// Goods icon masters. viewBox is 0 0 128 128. Each SVG is the product only
// (no badge). Rasterize at 128 and let the UI scale to 64 and 32.
// Regenerate: node scripts/goods-icons/build.mjs
// Rasterizer: npm install @resvg/resvg-js (resolved from /tmp/goods-raster or node_modules).

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { extraIcons } from "./subjects.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const svgDir = path.join(root, "public/images/goods/svg");
const pngDir = path.join(root, "public/images/goods");
const indexPath = path.join(root, "src/index.html");
const INK = "#1a1612";

const GLYPH = {
  A: ["00100", "01010", "10001", "11111", "10001", "10001", "10001"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  M: ["10001", "11011", "10101", "10001", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  S: ["01110", "10001", "10000", "01110", "00001", "10001", "01110"],
  b: ["10000", "10000", "11110", "10001", "10001", "10001", "11110"],
  e: ["00000", "00000", "01110", "10001", "11111", "10000", "01110"],
  g: ["01111", "10000", "10000", "10011", "10001", "10001", "01110"],
  i: ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  l: ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  n: ["00000", "00000", "11110", "10001", "10001", "10001", "10001"],
  o: ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  r: ["00000", "00000", "10110", "11000", "10000", "10000", "10000"],
  u: ["00000", "00000", "10001", "10001", "10001", "10011", "01110"],
  "?": ["01110", "10001", "00010", "00100", "00100", "00000", "00100"]
};

function p(d, fill, sw = 4) {
  const stroke = sw > 0 ? ` stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"` : "";
  return `<path d="${d}" fill="${fill}"${stroke}/>`;
}

function o(d, stroke, sw = 4) {
  return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
}

function e(cx, cy, rx, ry, fill, sw = 4) {
  const stroke = sw > 0 ? ` stroke="${INK}" stroke-width="${sw}"` : "";
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}"${stroke}/>`;
}

function c(cx, cy, r, fill, sw = 4) {
  const stroke = sw > 0 ? ` stroke="${INK}" stroke-width="${sw}"` : "";
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${stroke}/>`;
}

function rect(x, y, w, h, fill, sw = 4, rx = 0) {
  const stroke = sw > 0 ? ` stroke="${INK}" stroke-width="${sw}" stroke-linejoin="round"` : "";
  const round = rx ? ` rx="${rx}"` : "";
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}"${round} fill="${fill}"${stroke}/>`;
}

function label(text, cx, cy, cell, color) {
  const gap = Math.max(6, cell);
  const glyphW = 5 * cell;
  const total = text.length * glyphW + (text.length - 1) * gap;
  let x = cx - total / 2;
  const y = cy - (7 * cell) / 2;
  let halo = "";
  let ink = "";
  for (const ch of text) {
    const rows = GLYPH[ch];
    if (!rows) throw new Error(`missing glyph ${ch}`);
    rows.forEach((row, ry) => {
      [...row].forEach((bit, rx) => {
        if (bit !== "1") return;
        const px = x + rx * cell;
        const py = y + ry * cell;
        halo += `<rect x="${px - 1}" y="${py - 1}" width="${cell + 2}" height="${cell + 2}" fill="${INK}"/>`;
        ink += `<rect x="${px}" y="${py}" width="${cell}" height="${cell}" fill="${color}"/>`;
      });
    });
    x += glyphW + gap;
  }
  return halo + ink;
}

function ingot(body, top, symbol, ink) {
  const stacked = symbol.length > 2;
  const cell = stacked ? 4 : 6;
  const mark = stacked
    ? label(symbol.slice(0, 2), 64, 70, cell, ink) + label(symbol.slice(2), 64, 102, cell, ink)
    : label(symbol, 64, 86, cell, ink);
  return [
    p("M10 32 L118 32 L106 50 L22 50 Z", top, 0),
    p("M22 50 H106 V118 H22 Z", body, 0),
    o("M10 32 L118 32 L106 50 V118 H22 V50 L10 32 Z", INK, 4),
    o("M22 50 H106", INK, 4),
    mark
  ].join("");
}

function logs(bark, cut, ring) {
  const one = (x, y) =>
    rect(x, y, 64, 24, bark, 4, 4) +
    e(x, y + 12, 12, 12, cut) +
    o(`M${x - 4} ${y + 6} q8 6 0 12`, ring, 2) +
    e(x + 64, y + 12, 7, 8, bark, 3);
  return one(14, 80) + one(38, 80) + one(26, 46);
}

function fish(body, fin, belly) {
  return (
    p("M16 64 C34 42 70 38 96 64 C70 90 34 88 16 64 Z", body) +
    p("M92 64 L112 48 V80 Z", fin) +
    p("M44 50 L54 34 L66 52 Z", fin) +
    p("M32 72 C44 80 66 78 80 68", belly, 0) +
    c(36, 60, 3, INK, 0) +
    c(37, 59, 1, "#fff", 0)
  );
}

function bottle(glass, liquid, x = 64) {
  return (
    p(
      `M${x - 10} 18 H${x + 10} V40 L${x + 22} 58 V108 H${x - 22} V58 L${x - 10} 40 Z`,
      glass
    ) +
    p(`M${x - 18} 70 H${x + 18} V104 H${x - 18} Z`, liquid, 0) +
    rect(x - 14, 16, 28, 8, glass, 3, 2)
  );
}

function pot(lip, body, y = 78) {
  return e(64, y, 30, 26, body) + e(64, y - 24, 22, 8, lip) + e(64, y - 24, 12, 4, "#1a1612", 0);
}

const icons = {
  "good-amber": () =>
    p("M38 26 C20 36 18 68 40 90 C60 110 98 102 110 74 C122 46 102 20 74 24 C58 14 48 16 38 26 Z", "#f0a030") +
    p("M48 40 L74 34 L82 58 L50 66 Z", "#ffd27a", 0) +
    e(66, 74, 4, 2.5, INK, 0) +
    o("M58 70 l-7 -4 M56 78 l-8 2 M74 72 l7 -3 M72 80 l8 4", INK, 2),

  "good-arms": () =>
    p("M70 14 L82 26 L46 86 L34 74 Z", "#d9dde2") +
    o("M58 30 L76 48", "#9aa3ad", 3) +
    p("M22 78 H58 L64 92 H28 Z", "#8a6a32") +
    rect(46, 88, 14, 22, "#6b4428", 4, 2) +
    c(53, 114, 8, "#c9a24a"),

  "good-artillery": () =>
    p("M18 96 L72 78 H80 L28 108 Z", "#6b5344") +
    c(78, 96, 20, "#4a4038") +
    c(78, 96, 7, "#2a2420", 2) +
    p("M68 80 L116 34 L128 48 L80 94 Z", "#3d4a3a") +
    c(120, 40, 7, "#1e2420"),

  "good-barrels": () =>
    p("M36 24 H92 C106 24 110 40 110 64 C110 88 106 104 92 104 H36 C22 104 18 88 18 64 C18 40 22 24 36 24 Z", "#c4843c") +
    rect(22, 36, 88, 8, "#8a5a28", 3) +
    rect(22, 84, 88, 8, "#8a5a28", 3) +
    o("M64 32 V96", "#8a5a28", 3),

  "good-beer": () =>
    p("M30 46 H86 V104 H30 Z", "#f4efe4") +
    p("M34 58 H82 V100 H34 Z", "#e0a020", 0) +
    p("M86 58 H100 C112 58 112 86 100 86 H86 Z", "#f4efe4") +
    e(46, 40, 14, 10, "#fffaf2") +
    e(64, 34, 16, 12, "#fffaf2") +
    e(80, 42, 12, 9, "#fffaf2"),

  "good-books": () =>
    p("M26 28 H100 V108 H26 Z", "#7d3b2d") +
    p("M34 24 H108 V100 H34 Z", "#f4efe4") +
    p("M34 24 H46 V100 H34 Z", "#8d3a32") +
    o("M54 40 H96 M54 52 H96 M54 64 H90", "#c8bfb0", 3),

  "good-boots": () =>
    p("M18 28 H46 V70 H74 V98 H16 C10 98 12 76 20 68 V40 Z", "#3a2418") +
    p("M18 28 H46 V42 H26 Z", "#f3e6d4") +
    p("M58 36 H86 V74 H112 V100 H56 C50 100 52 80 60 72 V46 Z", "#3a2418") +
    p("M58 36 H86 V50 H66 Z", "#f3e6d4"),

  "good-bronze": () => ingot("#d47820", "#f4b15a", "CuSn", "#2a1404"),

  "good-camels": () =>
    rect(34, 86, 10, 22, "#c4a06a", 3) +
    rect(86, 84, 10, 24, "#c4a06a", 3) +
    p("M30 86 C34 74 48 70 62 76 C70 42 96 38 108 62 C122 66 120 86 104 90 H40 Z", "#e2c08a") +
    p("M30 80 C18 62 14 40 32 30 L44 36 C36 50 40 66 46 76 Z", "#d4b07a") +
    e(24, 32, 12, 7, "#e2c08a") +
    c(18, 30, 2.4, INK, 0),

  "good-candles": () =>
    rect(50, 48, 28, 64, "#f7f1dc", 4, 3) +
    o("M64 48 V40", INK, 3) +
    p("M64 18 C56 28 54 36 64 42 C74 36 72 28 64 18 Z", "#f0c14a") +
    p("M64 24 C60 30 60 34 64 36 C68 34 68 30 64 24 Z", "#fff4c4", 0),

  "good-cattle": () =>
    p("M30 100 H42 V78 H30 Z", "#f7f4ee", 3) +
    p("M52 100 H64 V78 H52 Z", "#f7f4ee", 3) +
    p("M78 100 H90 V76 H78 Z", "#f7f4ee", 3) +
    e(74, 74, 34, 22, "#f7f4ee") +
    e(86, 66, 10, 7, "#6b5344", 0) +
    c(40, 60, 16, "#f7f4ee") +
    p("M28 50 L24 36 L36 48 Z", "#f7f4ee", 3) +
    p("M46 46 L52 32 L54 50 Z", "#f7f4ee", 3) +
    c(34, 58, 2.5, INK, 0) +
    e(22, 66, 6, 4, "#f0b4b0", 2),

  "good-ceramics": () =>
    p("M40 50 H88 L96 70 V100 H32 V70 Z", "#d07a4a") +
    e(64, 50, 28, 10, "#e8a07a") +
    e(64, 50, 16, 5, "#a85a38", 0) +
    o("M44 78 H84", "#a85a38", 3),

  "good-cheese": () =>
    p("M24 78 L64 28 L104 78 Z", "#f2c84b") +
    p("M24 78 H104 L96 96 H32 Z", "#e0b030") +
    c(52, 62, 5, "#f8e7a4", 2) +
    c(74, 68, 4, "#f8e7a4", 2) +
    c(60, 78, 3, "#f8e7a4", 2),

  "good-clay": () =>
    rect(22, 62, 40, 18, "#c46a45", 4, 2) +
    rect(46, 40, 40, 18, "#d4845c", 4, 2) +
    rect(30, 84, 64, 20, "#b85a38", 4, 2) +
    o("M34 48 H78 M38 70 H54", "#8a4030", 2),

  "good-cloth": () =>
    p("M22 46 H96 L108 70 V96 H34 L22 72 Z", "#f4efe6") +
    p("M22 46 L34 70 V96 L22 72 Z", "#d7cfc2") +
    o("M40 58 H100 M44 74 H104", "#b7aa96", 3),

  "good-coal": () =>
    p("M22 70 L36 46 L58 54 L70 40 L92 58 L104 84 L78 104 L40 100 Z", "#2a2a2a") +
    p("M30 78 L48 62 L40 88 Z", "#4a4a4a", 0) +
    p("M70 70 L88 60 L84 86 Z", "#3a3a3a", 0),

  "good-coins": () =>
    e(64, 86, 36, 14, "#e2ae12") +
    e(64, 70, 36, 14, "#f0c84a") +
    e(64, 54, 36, 14, "#ffe27a") +
    o("M40 54 H88", "#c49210", 2),

  "good-copper": () => ingot("#c46a28", "#f0a15a", "Cu", "#fff8f0"),

  "good-dates": () =>
    o("M40 30 H90", "#6b8f3a", 4) +
    e(46, 58, 12, 18, "#8a4a28") +
    e(70, 70, 12, 18, "#a85c30") +
    e(92, 54, 12, 18, "#7a3e22") +
    o("M46 40 V48 M70 40 V54 M92 36 V44", "#5a7a32", 3),

  "good-dyes": () =>
    pot("#f4efe6", "#d24a3a", 86).replaceAll("64", "36") +
    c(64, 78, 16, "#3a5ec4", 4) +
    e(64, 62, 12, 5, "#f4efe6") +
    c(96, 86, 16, "#e2b000", 4) +
    e(96, 70, 12, 5, "#f4efe6"),

  "good-elephants": () =>
    rect(36, 88, 12, 22, "#b0b0b0", 3) +
    rect(78, 86, 12, 24, "#b0b0b0", 3) +
    e(82, 76, 30, 22, "#d0d0d0") +
    e(52, 64, 18, 22, "#b7b7b7") +
    c(38, 58, 16, "#d8d8d8") +
    p("M30 66 C16 74 14 98 28 112 C36 102 28 82 38 72 Z", "#c4c4c4") +
    p("M26 74 L12 88 L24 80 Z", "#f7f4ee", 2) +
    c(32, 54, 2.5, INK, 0),

  "good-fish": () => fish("#3d8eb5", "#2f6f90", "#f2f7f4"),

  "good-furs": () =>
    p(
      "M64 16 C52 16 44 28 46 38 C26 42 14 56 18 70 C20 78 34 74 42 66 L34 98 L50 86 L54 112 L64 96 L74 112 L78 86 L94 98 L86 66 C94 74 108 78 110 70 C114 56 102 42 82 38 C84 28 76 16 64 16 Z",
      "#c4a06a"
    ) +
    p("M64 42 C54 52 52 74 64 92 C76 74 74 52 64 42 Z", "#e4c49a", 0) +
    p("M48 30 L40 14 L58 28 Z", "#a67c52") +
    p("M80 30 L88 14 L70 28 Z", "#a67c52") +
    c(56, 36, 2.4, INK, 0) +
    c(72, 36, 2.4, INK, 0),

  "good-game": () =>
    p("M36 100 H46 V72 H36 Z", "#c4a06a", 3) +
    p("M70 100 H80 V70 H70 Z", "#c4a06a", 3) +
    e(74, 74, 28, 16, "#d2b48a") +
    p("M40 64 L28 40 L36 62 Z", "#d2b48a") +
    c(36, 52, 10, "#e6d2b0") +
    o("M30 40 L22 22 L34 36 M34 38 L40 18 L42 40", "#6b5344", 3) +
    c(32, 50, 2, INK, 0),

  "good-garments": () =>
    p("M40 36 L64 28 L88 36 L104 52 L88 60 V108 H40 V60 L24 52 Z", "#6a8fbf") +
    p("M52 36 H76 L64 52 Z", "#f4efe6") +
    o("M64 52 V80", "#3e5e86", 3),

  "good-gemstones": () =>
    p("M64 18 L100 48 L64 112 L28 48 Z", "#3aa0c8") +
    p("M64 18 L86 48 H42 Z", "#8fd4ea", 0) +
    o("M42 48 H86 L64 112 L42 48 L64 18", "#1a6a86", 3),

  "good-glass": () =>
    p("M40 24 H88 L78 70 H50 Z", "#d7eef8") +
    p("M58 70 H70 V100 H58 Z", "#d7eef8") +
    rect(46, 100, 36, 8, "#d7eef8", 4, 2) +
    p("M48 36 H80 L76 52 H52 Z", "#ffffff", 0),

  "good-gold": () => ingot("#e2ae12", "#ffe27a", "Au", "#3a2800"),

  "good-grain": () =>
    o("M64 108 V36", "#c4a04a", 4) +
    [0, 1, 2, 3, 4, 5]
      .map(i => {
        const y = 40 + i * 10;
        return e(52, y, 10, 5, "#e6c86a") + e(76, y, 10, 5, "#e6c86a");
      })
      .join("") +
    e(64, 30, 8, 12, "#f0d48a"),

  "good-gunpowder": () =>
    p("M34 40 H90 C102 40 106 50 106 64 C106 78 102 88 90 88 H34 C22 88 18 78 18 64 C18 50 22 40 34 40 Z", "#6b5344") +
    rect(30, 48, 64, 8, "#3a2a22", 3) +
    p("M48 88 H80 L86 112 H42 Z", "#2a2a2a") +
    c(58, 100, 3, "#111", 0) +
    c(70, 106, 2.5, "#111", 0),

  "good-musket": () =>
    rect(16, 58, 62, 12, "#2c2c2c", 4, 2) +
    p("M74 48 H112 V80 H86 L74 64 Z", "#8a5a32") +
    rect(70, 52, 10, 24, "#c9a24a", 3, 2) +
    c(78, 64, 3, INK, 0),

  "good-harnesses": () =>
    o("M36 34 C16 48 18 108 64 112 C110 108 112 48 92 34", "#8a5a32", 14) +
    rect(52, 18, 24, 14, "#c9a24a", 3, 2) +
    o("M58 25 H70", "#6b5344", 2),

  "good-hemp": () =>
    o("M64 108 V28", "#6b8f3a", 5) +
    p("M64 40 C40 36 28 52 40 64 C52 56 60 56 64 50 Z", "#8fbf55") +
    p("M64 56 C88 50 104 66 90 80 C78 70 70 68 64 64 Z", "#6b9a40") +
    p("M64 72 C42 74 30 90 46 98 C56 88 60 84 64 80 Z", "#9ccc65") +
    e(64, 24, 8, 10, "#c46a45", 3),

  "good-honey": () =>
    p("M40 40 H88 L96 108 H32 Z", "#f4efe4") +
    p("M44 64 H84 L90 104 H38 Z", "#f0b429", 0) +
    e(64, 36, 16, 8, "#e7c98a") +
    p("M78 70 C90 78 92 96 80 100 C74 90 76 78 78 70 Z", "#f0b429"),

  "good-horses": () =>
    rect(40, 82, 10, 26, "#8a5a32", 3) +
    rect(58, 82, 10, 26, "#8a5a32", 3) +
    rect(86, 80, 10, 28, "#8a5a32", 3) +
    e(74, 74, 32, 16, "#a86b3c") +
    p("M46 70 C38 50 30 36 40 26 L52 32 C48 46 52 60 58 70 Z", "#8a5430") +
    e(32, 28, 16, 8, "#c4843c") +
    p("M44 32 C56 18 54 48 46 58 Z", "#5c3a22", 0) +
    p("M102 66 C120 58 122 90 104 92 Z", "#5c3a22") +
    c(22, 26, 2.2, INK, 0),

  "good-incense": () =>
    p("M28 78 H100 L90 108 H38 Z", "#8a6a48") +
    p("M40 78 C44 60 52 58 56 70 C60 56 70 54 74 70 C80 58 90 64 86 78 Z", "#c4a06a", 0) +
    o("M48 70 C46 40 40 28 52 16", "#d9d3cc", 3) +
    o("M70 64 C78 36 70 22 84 12", "#d9d3cc", 3),

  "good-ink": () =>
    p("M36 48 H80 L92 108 H28 Z", "#2c3a68") +
    e(58, 48, 26, 10, "#3d4e86") +
    p("M78 70 C100 50 118 60 104 86 C96 74 90 78 78 70 Z", "#f4efe4") +
    o("M96 40 L110 22", "#6b5344", 3),

  "good-iron": () => ingot("#6d757c", "#a8b0b6", "Fe", "#f7f4ee"),

  "good-jewelry": () =>
    c(64, 70, 28, "#e6c86a") +
    c(64, 70, 16, "#f4efe4", 0) +
    p("M64 40 L74 58 H54 Z", "#e23b4a") +
    c(64, 34, 6, "#f2d24a"),

  "good-leather": () =>
    p("M30 30 C18 50 20 90 48 104 L64 70 L80 104 C108 90 110 50 98 30 C80 22 48 22 30 30 Z", "#a86b3c") +
    o("M48 40 C40 60 46 80 58 90 M80 40 C88 60 82 80 70 90", "#6b4428", 3),

  "good-liquor": () => bottle("#d7e3ea", "#c45a2a"),

  "good-marble": () =>
    p("M28 40 H100 V104 H28 Z", "#f4f1ea") +
    o("M36 50 C50 70 40 80 60 96 M70 46 C80 70 70 84 96 90", "#d0cbc2", 4),

  "good-oil": () =>
    p("M50 22 H78 L86 40 V48 H42 V40 Z", "#c4843c") +
    p("M36 48 H92 C100 48 104 70 96 100 H32 C24 70 28 48 36 48 Z", "#e2b15a") +
    p("M44 70 H84 V92 H44 Z", "#f0d48a", 0),

  "good-olives": () =>
    o("M30 100 C50 40 70 30 100 24", "#5a7a32", 4) +
    e(46, 70, 10, 14, "#6b8f3a") +
    e(66, 54, 10, 14, "#7ea34a") +
    e(84, 40, 10, 14, "#5e8634") +
    p("M96 20 C110 16 112 32 100 34 C96 24 98 20 96 20 Z", "#6b9a40", 2),

  "good-paper": () =>
    p("M30 22 H86 L106 42 V110 H30 Z", "#f7f4ee") +
    p("M86 22 V42 H106 Z", "#e4ddd0") +
    o("M42 58 H92 M42 72 H92 M42 86 H78", "#d0c8ba", 3),

  "good-pearls": () =>
    o("M16 78 Q64 28 112 78", "#c9a24a", 4) +
    c(28, 82, 9, "#fff") +
    c(48, 62, 9, "#fff") +
    c(68, 50, 9, "#fff") +
    c(88, 62, 9, "#fff") +
    c(106, 82, 9, "#fff"),

  "good-perfume": () =>
    rect(56, 16, 16, 14, "#e7c2d4", 3, 2) +
    p("M48 32 H80 L88 48 V108 H40 V48 Z", "#f4d0e0") +
    p("M48 60 H80 V90 H48 Z", "#e7a0c4", 0) +
    c(64, 74, 6, "#fff", 2),

  "good-ropes": () =>
    c(64, 68, 36, "#e2c08a") +
    c(64, 68, 22, "#c9a36a") +
    c(64, 68, 8, "#a67c46", 3) +
    o("M64 32 C90 40 100 60 90 80", "#8a6234", 6),

  "good-sails": () =>
    p("M58 16 H70 V112 H58 Z", "#6b5344") +
    p("M70 24 L114 96 H70 Z", "#f7f4ee") +
    o("M78 40 L108 90", "#d9d0c4", 3),

  "good-salt": () =>
    p("M24 70 L40 48 H64 L78 64 L104 56 L112 86 L90 108 H36 Z", "#f7f7f7") +
    p("M40 64 L52 50 L60 66 Z", "#ffffff", 0) +
    p("M70 72 L86 58 L92 78 Z", "#e6e6e6", 0),

  "good-salted-fish": () =>
    fish("#5f8f9a", "#3e6c76", "#f7f7f7") +
    c(48, 58, 3, "#fff", 2) +
    c(62, 70, 3, "#fff", 2) +
    c(74, 56, 2.5, "#fff", 2),

  "good-saltpeter": () =>
    p("M40 80 L54 40 L70 74 Z", "#f7f7f7") +
    p("M60 88 L84 36 L104 90 Z", "#ffffff") +
    p("M28 92 L46 58 L62 96 Z", "#e4e4e4") +
    o("M54 40 L70 74 M84 36 L70 74", "#c8c8c8", 2),

  "good-sulfur": () =>
    p("M24 74 L40 48 L62 58 L74 42 L98 60 L110 86 L82 108 H36 Z", "#f0d429") +
    p("M36 80 L52 64 L46 92 Z", "#ffe98a", 0) +
    p("M74 78 L92 62 L96 90 Z", "#e0c020", 0),

  "good-sand": () =>
    p("M16 80 C30 50 50 46 64 60 C78 40 104 48 116 78 C100 108 30 112 16 80 Z", "#e2c48a") +
    c(40, 78, 3, "#c9a86a", 0) +
    c(70, 86, 2.5, "#c9a86a", 0) +
    c(90, 74, 2, "#c9a86a", 0),

  "good-sheep": () =>
    c(48, 70, 16, "#f7f4ee") +
    c(66, 62, 18, "#f7f4ee") +
    c(82, 72, 16, "#f7f4ee") +
    c(64, 80, 20, "#f7f4ee") +
    c(36, 66, 12, "#6b5344") +
    p("M24 100 H34 V80 H24 Z", "#6b5344", 3) +
    p("M70 100 H80 V82 H70 Z", "#6b5344", 3) +
    c(32, 64, 2, INK, 0),

  "good-ships": () =>
    p("M16 78 H112 L98 106 H30 Z", "#8a5a32") +
    rect(46, 24, 6, 54, "#3a2418", 3) +
    rect(78, 18, 6, 60, "#3a2418", 3) +
    p("M49 28 L74 72 H49 Z", "#f7f4ee") +
    p("M49 42 L28 72 H49 Z", "#f4efe4") +
    p("M81 22 L108 68 H81 Z", "#fff"),

  "good-silk": () =>
    e(64, 34, 30, 12, "#f4d4ea") +
    e(64, 96, 30, 12, "#e7b8dc") +
    rect(38, 34, 52, 62, "#fff5fb") +
    o("M42 48 H86 M42 62 H86 M42 76 H86", "#e7c0dc", 3),

  "good-silver": () => ingot("#b7bcc6", "#eef1f4", "Ag", "#1a1612"),

  "good-slaves": () =>
    c(40, 88, 26, "#6b6b6b") +
    c(66, 74, 7, "none", 4) +
    c(82, 58, 7, "none", 4) +
    c(96, 42, 7, "none", 4) +
    p("M88 22 H112 V42 H104 V32 H96 V42 H88 Z", "#c9a24a"),

  "good-soap": () =>
    rect(28, 40, 72, 52, "#f4d27a", 4, 12) +
    c(86, 36, 8, "#fff", 2) +
    c(100, 28, 5, "#fff", 2) +
    e(52, 58, 14, 8, "#fff6d4", 0),

  "good-spices": () =>
    p("M20 70 C20 50 48 48 48 70 C48 92 20 94 20 70 Z", "#8a3a2a") +
    p("M50 64 C50 42 82 40 82 66 C82 92 50 94 50 64 Z", "#c45a2a") +
    p("M78 74 C78 56 112 54 112 78 C112 100 78 100 78 74 Z", "#e2b15a") +
    c(64, 60, 4, "#3a2418", 0) +
    c(96, 72, 3, "#3a2418", 0),

  "good-stone": () =>
    p("M20 70 L36 46 H70 L84 68 L76 104 H28 Z", "#9aa0a6") +
    p("M60 58 L84 40 H112 L118 70 L100 100 H78 Z", "#b7bdc2") +
    o("M40 60 L52 88 M96 52 L104 80", "#7a8288", 3),

  "good-sugar": () =>
    p("M64 20 L100 100 H28 Z", "#f7f4ee") +
    p("M64 20 L80 100 H48 Z", "#fff", 0) +
    o("M48 70 H80 M42 86 H86", "#e4ddd0", 3),

  "good-tar": () =>
    p("M30 50 H98 L108 110 H20 Z", "#6b5344") +
    p("M36 58 H92 L100 100 H28 Z", "#1a1612", 0) +
    e(64, 62, 20, 8, "#2a2a2a"),

  "good-tea": () =>
    p("M28 50 H84 V96 H28 Z", "#f7f4ee") +
    p("M36 62 H76 V90 H36 Z", "#6b8f3a", 0) +
    p("M84 60 H104 C116 60 116 84 104 84 H84 Z", "#f7f4ee") +
    e(48, 42, 8, 5, "#3e6b32") +
    e(64, 36, 8, 5, "#5a8a40"),

  "good-tin": () => ingot("#8e949b", "#d5d9de", "Sn", "#1a1612"),

  "good-lead": () => ingot("#5a5e6c", "#9aa0ae", "Pb", "#f7f4ee"),

  "good-tobacco": () =>
    p("M70 20 C100 30 112 70 90 100 C70 80 40 90 28 70 C16 40 40 16 70 20 Z", "#6b8f3a") +
    o("M64 30 C60 60 50 80 40 96", "#3e6b32", 3) +
    o("M70 40 C80 60 78 80 70 96 M56 36 C48 56 46 74 52 90", "#3e6b32", 2),

  "good-tools": () =>
    p("M28 28 H52 L64 48 L48 64 L28 44 Z", "#9aa3ad") +
    rect(58, 50, 16, 62, "#8a5a32", 4, 3) +
    p("M52 36 H78 L70 22 H60 Z", "#c5ccd4"),

  "good-tropicalTimber": () => logs("#8a3e2c", "#e2b08a", "#a85c48"),

  "good-unknown": () => label("?", 64, 64, 8, "#f7f4ee"),

  "good-cats": () =>
    o("M90 78 C112 64 116 100 94 104", "#c49a62", 8) +
    e(72, 84, 26, 20, "#e8c99a") +
    c(48, 66, 16, "#e8c99a") +
    p("M36 56 L42 34 L52 54 Z", "#e8c99a") +
    p("M50 52 L62 32 L66 56 Z", "#e8c99a") +
    p("M40 52 L44 40 L48 52 Z", "#f4d7b0", 0) +
    c(42, 64, 2.2, INK, 0) +
    c(54, 66, 2.2, INK, 0) +
    p("M46 72 H54 L50 76 Z", "#e07a8a", 0),

  "good-vinegar": () => bottle("#f4efe4", "#6b8f3a", 64) + rect(50, 78, 28, 16, "#f7f4ee", 2, 2),

  "good-whales": () =>
    p(
      "M16 68 C18 40 52 36 92 52 C104 58 108 64 108 70 C108 76 104 82 92 88 C52 108 18 100 16 68 Z",
      "#4a7ea8"
    ) +
    p("M102 64 L124 46 L114 68 L124 92 L102 76 Z", "#3d6e96") +
    p("M40 86 L24 112 L58 96 Z", "#3d6e96") +
    c(34, 34, 5, "#e7f3fb") +
    c(34, 20, 3.5, "#e7f3fb") +
    c(34, 10, 2.5, "#e7f3fb") +
    c(32, 62, 3.5, INK, 0) +
    e(48, 82, 16, 8, "#d7e7f4", 0),

  "good-wine": () =>
    o("M64 22 V46", "#5a7a32", 4) +
    p("M64 30 C86 18 100 36 84 46 C78 32 70 32 64 36 Z", "#6b9a40") +
    c(48, 70, 12, "#6b2d6b") +
    c(70, 62, 12, "#7d3a86") +
    c(90, 74, 12, "#54245a") +
    c(40, 90, 11, "#7d3a86") +
    c(62, 96, 12, "#6b2d6b") +
    c(84, 94, 11, "#642868"),

  "good-wood": () => logs("#c4843c", "#e6c39a", "#a86b3c"),

  "good-peat": () =>
    rect(24, 30, 80, 22, "#4a3428", 4, 3) +
    rect(20, 56, 88, 22, "#3a2a22", 4, 3) +
    rect(26, 82, 76, 20, "#5c4030", 4, 3) +
    p("M24 30 H40 V52 H24 Z", "#8a6a4a", 0) +
    p("M20 56 H36 V78 H20 Z", "#a67c52", 0) +
    o("M48 40 H92 M46 66 H98 M50 92 H90", "#2a1c16", 2),

  "good-resin": () =>
    p("M64 18 C48 48 36 60 36 80 A28 28 0 0 0 92 80 C92 60 80 48 64 18 Z", "#f0b429") +
    p("M64 36 C56 52 50 62 50 76 A14 14 0 0 0 70 78 C68 64 66 52 64 36 Z", "#ffe08a", 0),

  "good-medicinal-herbs": () =>
    o("M64 108 V24", "#3e6b32", 4) +
    p("M64 40 C40 28 28 48 44 58 C52 46 58 48 64 46 Z", "#6b9a40") +
    p("M64 56 C90 42 108 60 90 74 C80 62 72 62 64 60 Z", "#8fbf55") +
    p("M64 74 C42 78 30 96 48 104 C58 92 60 86 64 82 Z", "#5a8a40") +
    c(64, 22, 6, "#f2d24a", 2),

  "good-shellfish": () =>
    p("M16 90 Q64 22 112 90 Q64 112 16 90 Z", "#f0e2c8") +
    o("M64 34 V102 M42 42 L52 100 M86 42 L76 100 M28 66 L44 104 M100 66 L84 104", "#c4a57a", 3),

  "good-reeds": () =>
    [28, 46, 64, 82, 100]
      .map((x, i) => o(`M${x} 108 V${30 + (i % 3) * 8}`, "#6b8f3a", 4) + e(x, 26 + (i % 3) * 8, 7, 12, "#8f6b3a"))
      .join("") + o("M16 108 H112", "#5c4030", 4),

  "good-goats": () =>
    rect(40, 86, 10, 22, "#f7f4ee", 3) +
    rect(78, 84, 10, 24, "#f7f4ee", 3) +
    e(78, 78, 28, 18, "#f4efe6") +
    c(46, 62, 14, "#fff") +
    p("M36 56 C26 40 22 26 32 22 C34 40 40 52 44 58 Z", "#e6dcc8") +
    p("M52 52 C60 34 72 22 64 18 C56 34 50 46 46 54 Z", "#e6dcc8") +
    p("M40 74 L46 98 L54 74 Z", "#d9d0c4") +
    c(40, 60, 2.2, INK, 0),

  "good-chromium": () => ingot("#3f6e64", "#8fbfb2", "Cr", "#f7f4ee"),
  "good-nickel": () => ingot("#7e9188", "#c9dbd2", "Ni", "#1a1612"),
  "good-molybdenum": () => ingot("#4d5966", "#8b98a6", "Mo", "#f7f4ee"),
  "good-silicon": () => ingot("#c2b59a", "#f3ead6", "Si", "#2a261c"),
  "good-aluminum": () => ingot("#c8ccd1", "#f5f7f8", "Al", "#1a1612"),

  "good-mercury": () =>
    p("M52 16 H76 V40 H52 Z", "#d7dbe0") +
    e(64, 16, 8, 5, "#eef1f4") +
    e(64, 74, 36, 32, "#d7dbe0") +
    e(64, 84, 26, 18, "#c5c9d1", 0) +
    label("Hg", 64, 80, 6, "#1a1612")
};

const extras = extraIcons({ p, o, e, c, rect, bottle, INK });
for (const id of Object.keys(extras)) {
  if (icons[id]) throw new Error(`duplicate goods icon ${id}`);
}
Object.assign(icons, extras);

function svgDocument(inner) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">\n${inner}\n</svg>\n`;
}

function loadResvg() {
  const candidates = [
    "@resvg/resvg-js",
    "/tmp/goods-raster/node_modules/@resvg/resvg-js/index.js"
  ];
  for (const candidate of candidates) {
    try {
      const require = createRequire(import.meta.url);
      return require(candidate);
    } catch {
      // try the next location
    }
  }
  throw new Error("Install @resvg/resvg-js to rasterize goods icons");
}

function assertPng(buffer, file) {
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colorType = buffer[25];
  if (width !== 128 || height !== 128 || colorType !== 6) {
    throw new Error(`${file} is ${width}x${height} color ${colorType}, expected 128x128 RGBA`);
  }
}

function patchIndex(entries) {
  const block = [
    "      <!-- goods-icons:start. Generated by scripts/goods-icons/build.mjs -->",
    ...entries.map(([id, inner]) => {
      const body = inner
        .trim()
        .split("\n")
        .map(line => (line ? `        ${line}` : line))
        .join("\n");
      return `      <symbol id="${id}" viewBox="0 0 128 128">\n${body}\n      </symbol>`;
    }),
    "      <!-- goods-icons:end -->"
  ].join("\n");
  let html = fs.readFileSync(indexPath, "utf8");
  if (html.includes("<!-- goods-icons:start")) {
    html = html.replace(/ *<!-- goods-icons:start[\s\S]*?<!-- goods-icons:end -->/, block);
  } else {
    const from = html.indexOf('      <symbol id="good-amber"');
    const to = html.indexOf('      <g id="trade-markers">');
    if (from < 0 || to < 0) throw new Error("goods icon block not found in index.html");
    html = `${html.slice(0, from)}${block}\n${html.slice(to)}`;
  }
  fs.writeFileSync(indexPath, html);
}

const { Resvg } = loadResvg();
fs.mkdirSync(svgDir, { recursive: true });
fs.mkdirSync(pngDir, { recursive: true });

function centerArtwork(inner) {
  const pad = 6;
  const rendered = new Resvg(svgDocument(inner), {
    fitTo: { mode: "width", value: 128 },
    background: "rgba(0,0,0,0)"
  }).render();
  const pixels = rendered.pixels;
  const width = rendered.width;
  const height = rendered.height;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] < 20) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      count++;
    }
  }
  if (!count) return inner;
  let dx = Math.round(64 - (minX + maxX) / 2);
  let dy = Math.round(64 - (minY + maxY) / 2);
  if (minX + dx < pad) dx = pad - minX;
  if (maxX + dx > 127 - pad) dx = 127 - pad - maxX;
  if (minY + dy < pad) dy = pad - minY;
  if (maxY + dy > 127 - pad) dy = 127 - pad - maxY;
  if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return inner;
  return `<g transform="translate(${dx} ${dy})">${inner}</g>`;
}

const original = fs.readFileSync(indexPath, "utf8");
const previousIds = [...original.matchAll(/id="(good-[^"]+)"/g)].map(match => match[1]);
for (const id of previousIds) {
  if (!icons[id]) throw new Error(`missing redraw for ${id}`);
}

const entries = Object.entries(icons).map(([id, draw]) => [id, centerArtwork(draw())]);
for (const [id, inner] of entries) {
  const svg = svgDocument(inner);
  fs.writeFileSync(path.join(svgDir, `${id}.svg`), svg);
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 128 }, background: "rgba(0,0,0,0)" }).render().asPng();
  assertPng(png, id);
  fs.writeFileSync(path.join(pngDir, `${id}.png`), png);
}
patchIndex(entries);
console.log(`wrote ${entries.length} goods icons`);
