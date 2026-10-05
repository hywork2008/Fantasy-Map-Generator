import { pointInPolygon } from "../core/geometry";
import type { BiomeKind, Point, RegionBiomeArea, RegionWetlandPatch } from "../core/types";
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

/** 冠水段階。旧データ（level なし）は kind から推定する。 */
export function wetlandPatchLevel(p: RegionWetlandPatch): number {
  return p.level ?? (p.kind === "water" ? 8 : p.kind === "sand" ? 1 : 3);
}

/** この段階以上は開放水面として扱う（樹木を消し、岸縁を付ける）。 */
export const WETLAND_WATER_LEVEL = 6;

const MUD_TONES = ["#9a9470", "#8c8262", "#7f805a", "#6f7b52"];
const SAND_TONES = ["#e6d5aa", "#dfc99a", "#d6c08c", "#cbb683"];
const WATER_MIX = [0.12, 0.3, 0.55, 0.8, 1];

/** 段階ごとの塗り。湿った地面 → 泥 → 冠水 → 開放水面へ連続的に変える。 */
export function wetlandLevelStyle(
  level: number,
  riverFill: string,
  sandy: boolean
): { color: string; opacity: number } {
  const tones = sandy ? SAND_TONES : MUD_TONES;
  if (level <= 3)
    return {
      color: tones[Math.max(0, level)],
      opacity: level === 0 ? 0.45 : level === 1 ? 0.75 : 1
    };
  if (level >= 9) return { color: mixHex(riverFill, "#1d3a4a", 0.3), opacity: 1 };
  return {
    color: mixHex(tones[3], riverFill, WATER_MIX[level - 4]),
    opacity: 1
  };
}

/**
 * 湿地の記号。冠水段階ごとに密度と種類を変える:
 * 2 スゲ（まばら）/ 3-5 葦（密）/ 6 葦 + 水面の筋 / 7-8 水面の筋のみ / 0-1, 9 なし。
 * 記号は湿地セル全体ではなく、該当する冠水段階の面の内側にだけ置く。
 */
export function renderWetlandMarks(wetlands: RegionBiomeArea[], strokeColor: string): string {
  const spacing = 5.2;
  const seen = new Set<number>();
  const reeds: string[] = [];
  const dashes: string[] = [];
  for (const b of wetlands) {
    const poly = b.polygon;
    if (poly.length < 3) continue;
    const patches = (b.wetlandPatches ?? [])
      .map(p => {
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        for (const [x, y] of p.polygon) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
        return {
          polygon: p.polygon,
          level: wetlandPatchLevel(p),
          minX,
          minY,
          maxX,
          maxY
        };
      })
      .filter(p => p.level >= 2 && p.level <= 8);
    if (!patches.length) continue;
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
        let level = -1;
        for (const p of patches) {
          if (p.level <= level || x < p.minX || x > p.maxX || y < p.minY || y > p.maxY) continue;
          if (pointInPolygon([x, y], p.polygon)) level = p.level;
        }
        if (level < 2) continue;
        const roll = hash2(ix, iy, 13);
        const reed = () => {
          const h = 3.2 + hash2(ix, iy, 14) * 1.8;
          reeds.push(
            `M${f1(x - 1.3)} ${f1(y)}L${f1(x - 1.7)} ${f1(y - h * 0.75)}M${f1(x)} ${f1(y)}L${f1(x + 0.1)} ${f1(y - h)}M${f1(x + 1.3)} ${f1(y)}L${f1(x + 1.8)} ${f1(y - h * 0.7)}`
          );
        };
        const ripple = () => {
          const w = 1.6 + hash2(ix, iy, 15) * 1.6;
          dashes.push(
            `M${f1(x - w)} ${f1(y)}L${f1(x + w)} ${f1(y)}M${f1(x - w * 0.5)} ${f1(y + 1)}L${f1(x + w * 0.5)} ${f1(y + 1)}`
          );
        };
        if (level === 2) {
          if (roll > 0.35) continue;
          reed();
        } else if (level <= 5) {
          if (roll < 0.2) continue;
          if (roll < 0.8 || level === 3) reed();
          else ripple();
        } else if (level === 6) {
          if (roll < 0.4) continue;
          if (roll < 0.7) reed();
          else ripple();
        } else {
          if (roll < 0.55) continue;
          ripple();
        }
      }
    }
  }
  if (!reeds.length && !dashes.length) return "";
  return `<path class="wetland-reeds" d="${reeds.join("")}" fill="none" stroke="${strokeColor}" stroke-width="0.55" stroke-linecap="round" opacity="0.9" />
    <path class="wetland-dashes" d="${dashes.join("")}" fill="none" stroke="#5f8691" stroke-width="0.4" stroke-linecap="round" opacity="0.7" />`;
}

export type RenderQuality = "low" | "high";
export const DEFAULT_RENDER_QUALITY: RenderQuality = "low";

/**
 * 低品質: 樹冠を 1 本ずつ描く代わりに、同じ見た目を繰り返しタイルにして塗る。
 * 要素数がセル数・ズームに依存せず、ブラウザのタイル再利用で再描画が軽い。
 */
export function forestCrownPattern(kind: ForestKind, colors: ForestCanopyColors): string {
  const r = CROWN_RADIUS[kind];
  const w = r * 3.7;
  const h = w * 0.86;
  const spots: Array<[number, number, number]> = [
    [w * 0.25, h * 0.25, 1],
    [w * 0.75, h * 0.25, 0.9],
    [w * 0.5, h * 0.75, 1.05],
    [0, h * 0.75, 0.92],
    [w, h * 0.75, 0.92]
  ];
  const base = colors[kind];
  const shape = (x: number, y: number, k: number, i: number) =>
    kind === "coniferous" ? spikyCrown(x, y, r * k, i) : lobedCrown(x, y, r * k, kind === "tropical" ? 9 : 7, i);
  const shadows = spots.map(([x, y, k]) => ellipse(x + r * 0.35, y + r * 0.55, r * k * 1.05, r * k * 0.8)).join("");
  const bodies = spots.map(([x, y, k], i) => shape(x, y, k, i * 1.3)).join("");
  const lights = spots.map(([x, y, k]) => ellipse(x - r * 0.3, y - r * 0.34, r * k * 0.42, r * k * 0.34)).join("");
  return `<pattern id="re-forest-crowns-${kind}" width="${f1(w)}" height="${f1(h)}" patternUnits="userSpaceOnUse">
      <path d="${shadows}" fill="${colors.shadow}" opacity="0.4" />
      <path d="${bodies}" fill="${base}" stroke="${colors.stroke}" stroke-width="0.25" stroke-opacity="0.55" />
      <path d="${lights}" fill="${colors.highlight}" opacity="0.38" />
    </pattern>`;
}

/** 低品質の湿地記号タイル（葦と水面の横線）。 */
export function wetlandMarkPattern(strokeColor: string): string {
  return `<pattern id="re-wetland-marks" width="11" height="9" patternUnits="userSpaceOnUse">
      <path d="M2 7l-.4-3.2M2 7l.1-4M2 7l.8-3.4M8 3.5h3M7 6h2" fill="none" stroke="${strokeColor}" stroke-width="0.5" stroke-linecap="round" opacity="0.85" />
    </pattern>`;
}
