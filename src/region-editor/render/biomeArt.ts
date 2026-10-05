import { pointInPolygon } from "../core/geometry";
import type { BiomeKind, Point, RegionBiomeArea } from "../core/types";
import type { ForestCanopyColors } from "./styles/themes";

/**
 * 森林・湿地の手描き風描画。
 * SVG フィルタ（ノイズ/照明）には頼らず、ワールド座標に固定した揺らぎグリッド上に
 * 樹冠・湿地記号を置く。グリッドはセルに依存しないので、隣接セルの境界で継ぎ目が出ず、
 * 同じ文書は常に同じ絵になる（描画時の乱数なし）。
 */

const MAX_CROWNS = 9000;

type ForestKind = "deciduous" | "coniferous" | "tropical";

const CROWN_RADIUS: Record<ForestKind, number> = {
  deciduous: 3.1,
  coniferous: 2.6,
  tropical: 3.7
};

export function forestKindOf(kind: BiomeKind): ForestKind {
  return kind === "coniferous_forest" ? "coniferous" : kind === "tropical_forest" ? "tropical" : "deciduous";
}

/** 2 整数 + salt からの決定的ハッシュ → [0,1) */
function hash2(ix: number, iy: number, salt: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(salt | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? [...h].map(c => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
    return [0, 2, 4].map(i => Number.parseInt(full.slice(i, i + 2), 16));
  };
  const ca = parse(a);
  const cb = parse(b);
  return `#${ca
    .map((v, i) => Math.round(v + (cb[i] - v) * t))
    .map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0"))
    .join("")}`;
}

const f1 = (n: number) => n.toFixed(1);

function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  return `M${f1(cx - rx)} ${f1(cy)}a${f1(rx)} ${f1(ry)} 0 1 0 ${f1(rx * 2)} 0a${f1(rx)} ${f1(ry)} 0 1 0 ${f1(-rx * 2)} 0Z`;
}

/** 葉群のこぶ（スカラップ）を持つ広葉樹冠。 */
function lobedCrown(cx: number, cy: number, r: number, lobes: number, phase: number): string {
  const pt = (a: number, rad: number) => `${f1(cx + Math.cos(a) * rad)} ${f1(cy + Math.sin(a) * rad)}`;
  const step = (Math.PI * 2) / lobes;
  let d = `M${pt(phase, r * 0.92)}`;
  for (let i = 0; i < lobes; i++) {
    d += `Q${pt(phase + step * (i + 0.5), r * 1.22)} ${pt(phase + step * (i + 1), r * 0.92)}`;
  }
  return `${d}Z`;
}

/** 針葉樹を真上から見た、とがった星形の樹冠。 */
function spikyCrown(cx: number, cy: number, r: number, phase: number): string {
  const n = 8;
  let d = "";
  for (let i = 0; i < n * 2; i++) {
    const a = phase + (Math.PI * i) / n;
    const rad = i % 2 === 0 ? r * 1.12 : r * 0.52;
    d += `${i === 0 ? "M" : "L"}${f1(cx + Math.cos(a) * rad)} ${f1(cy + Math.sin(a) * rad)}`;
  }
  return `${d}Z`;
}

interface Crown {
  x: number;
  y: number;
  r: number;
  tone: number;
  phase: number;
}

function collectCrowns(biomes: RegionBiomeArea[], spacing: number, baseR: number, salt: number, cap: number): Crown[] {
  const seen = new Set<number>();
  const crowns: Crown[] = [];
  // 行ごとに半ピッチずらして、ランダム散布より詰まりの良い千鳥配置にする
  const pos = (ix: number, iy: number): Point => [
    (ix + (iy & 1 ? 0.5 : 0) + (hash2(ix, iy, salt) - 0.5) * 0.7) * spacing,
    (iy + (hash2(ix, iy, salt + 1) - 0.5) * 0.7) * spacing * 0.86
  ];
  for (const b of biomes) {
    const stock =
      b.forestCover && b.forestStock !== undefined ? Math.max(0, Math.min(1, b.forestStock / b.forestCover)) : 1;
    const keep = 0.35 + 0.65 * stock;
    for (const poly of b.forestPolygons ?? [b.polygon]) {
      if (poly.length < 3) continue;
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const [x, y] of poly) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const row = spacing * 0.86;
      for (let iy = Math.floor(minY / row) - 1; iy <= Math.ceil(maxY / row) + 1; iy++) {
        for (let ix = Math.floor(minX / spacing) - 1; ix <= Math.ceil(maxX / spacing) + 1; ix++) {
          const key = ix * 100003 + iy;
          if (seen.has(key)) continue;
          const p = pos(ix, iy);
          if (p[0] < minX || p[0] > maxX || p[1] < minY || p[1] > maxY || !pointInPolygon(p, poly)) continue;
          seen.add(key);
          if (hash2(ix, iy, salt + 2) > keep) continue;
          crowns.push({
            x: p[0],
            y: p[1],
            r: baseR * (0.82 + hash2(ix, iy, salt + 3) * 0.4),
            tone: Math.floor(hash2(ix, iy, salt + 4) * 3),
            phase: hash2(ix, iy, salt + 5) * Math.PI * 2
          });
          if (crowns.length >= cap) return crowns;
        }
      }
    }
  }
  return crowns;
}

/**
 * 森林の樹冠レイヤー。種類ごとに 影 → 樹冠(3トーン) → 陰影 → ハイライト の順で積む。
 * detail 0（引き）では間引いてパス総量を抑える。
 */
export function renderForestCrowns(
  forestBiomes: RegionBiomeArea[],
  colors: ForestCanopyColors,
  detail: number
): string {
  const kinds: ForestKind[] = ["deciduous", "coniferous", "tropical"];
  const lod = detail === 0 ? 1.7 : 1;
  const out: string[] = [];
  kinds.forEach((kind, kindIdx) => {
    const group = forestBiomes.filter(b => forestKindOf(b.kind) === kind);
    if (!group.length) return;
    const baseR = CROWN_RADIUS[kind];
    const spacing = baseR * 1.85 * lod;
    const crowns = collectCrowns(group, spacing, baseR, 7919 * (kindIdx + 1), MAX_CROWNS);
    if (!crowns.length) return;
    crowns.sort((a, b) => a.y - b.y);
    const base = colors[kind];
    const tones = [mixHex(base, colors.shadow, 0.22), base, mixHex(base, colors.highlight, 0.28)];
    const shape = (c: Crown) =>
      kind === "coniferous"
        ? spikyCrown(c.x, c.y, c.r, c.phase)
        : lobedCrown(c.x, c.y, c.r, kind === "tropical" ? 9 : 7, c.phase);
    const shadows = crowns.map(c => ellipse(c.x + c.r * 0.35, c.y + c.r * 0.55, c.r * 1.05, c.r * 0.8)).join("");
    const bodies = [0, 1, 2].map(t =>
      crowns
        .filter(c => c.tone === t)
        .map(shape)
        .join("")
    );
    const shades = crowns.map(c => ellipse(c.x + c.r * 0.3, c.y + c.r * 0.32, c.r * 0.52, c.r * 0.46)).join("");
    const lights = crowns.map(c => ellipse(c.x - c.r * 0.3, c.y - c.r * 0.34, c.r * 0.42, c.r * 0.34)).join("");
    out.push(`<g class="forest-crowns forest-crowns-${kind}">
      <path class="forest-crown-shadow" d="${shadows}" fill="${colors.shadow}" opacity="0.4" />
      ${bodies.map((d, t) => (d ? `<path class="forest-crown" d="${d}" fill="${tones[t]}" stroke="${colors.stroke}" stroke-width="0.25" stroke-opacity="0.55" />` : "")).join("\n")}
      <path class="forest-crown-shade" d="${shades}" fill="${colors.shadow}" opacity="0.22" />
      <path class="forest-crown-light" d="${lights}" fill="${colors.highlight}" opacity="0.38" />
    </g>`);
  });
  return out.join("\n");
}

/** 湿地記号（葦の株 + 水面の短い横線）。水・泥のパッチは後から上に重ねて覆う。 */
export function renderWetlandMarks(wetlands: RegionBiomeArea[], strokeColor: string): string {
  const spacing = 5.2;
  const seen = new Set<number>();
  const reeds: string[] = [];
  const dashes: string[] = [];
  for (const b of wetlands) {
    const poly = b.polygon;
    if (poly.length < 3) continue;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const [x, y] of poly) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    for (let iy = Math.floor(minY / spacing) - 1; iy <= Math.ceil(maxY / spacing) + 1; iy++) {
      for (let ix = Math.floor(minX / spacing) - 1; ix <= Math.ceil(maxX / spacing) + 1; ix++) {
        const key = ix * 100003 + iy;
        if (seen.has(key)) continue;
        const x = (ix + (iy & 1 ? 0.5 : 0) + (hash2(ix, iy, 11) - 0.5) * 0.8) * spacing;
        const y = (iy + (hash2(ix, iy, 12) - 0.5) * 0.8) * spacing;
        if (x < minX || x > maxX || y < minY || y > maxY || !pointInPolygon([x, y], poly)) continue;
        seen.add(key);
        const roll = hash2(ix, iy, 13);
        if (roll < 0.2) continue; // 余白を残して記号をまばらに
        if (roll < 0.6) {
          // 葦の株: 中央が高い 3 本 + 根元の短い水平線
          const h = 3.2 + hash2(ix, iy, 14) * 1.8;
          reeds.push(
            `M${f1(x - 1.3)} ${f1(y)}L${f1(x - 1.7)} ${f1(y - h * 0.75)}M${f1(x)} ${f1(y)}L${f1(x + 0.1)} ${f1(y - h)}M${f1(x + 1.3)} ${f1(y)}L${f1(x + 1.8)} ${f1(y - h * 0.7)}`
          );
        } else {
          const w = 1.6 + hash2(ix, iy, 15) * 1.6;
          dashes.push(
            `M${f1(x - w)} ${f1(y)}L${f1(x + w)} ${f1(y)}M${f1(x - w * 0.5)} ${f1(y + 1)}L${f1(x + w * 0.5)} ${f1(y + 1)}`
          );
        }
      }
    }
  }
  if (!reeds.length && !dashes.length) return "";
  return `<path class="wetland-reeds" d="${reeds.join("")}" fill="none" stroke="${strokeColor}" stroke-width="0.55" stroke-linecap="round" opacity="0.9" />
    <path class="wetland-dashes" d="${dashes.join("")}" fill="none" stroke="#5f8691" stroke-width="0.4" stroke-linecap="round" opacity="0.7" />`;
}
