import { pointInPolygon } from "../core/geometry";
import type { BiomeKind, Point, RegionBiomeArea, RegionHeightfield } from "../core/types";
import { forestThinning, mixHex } from "./biomeArt";
import { FOREST_KINDS, type ForestKind, type ForestMass } from "./forestMass";
import type { ThemeColors } from "./styles/themes";

/**
 * 斜め上（鳥瞰）から見た山・丘・樹木の絵画風描画（illustrated テーマ専用）。
 * Mike Schley / Watabou "Perilous Shores" 風に、記号は地面の一点に「立つ」スプライトとして描き、
 * 奥（北＝y 小）から手前へ順に重ねて前の記号が後ろを隠すようにする。
 * 光源は左上。左面を明るく、右面を暗くしてハッチングを入れる。
 * 位置はワールド座標に固定した揺らぎ格子＋ハッシュで決め、描画時の乱数は使わない。
 */

const f1 = (n: number) => n.toFixed(1);

function hash2(ix: number, iy: number, salt: number): number {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(salt | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 揺らぎ付き千鳥格子の点列を bbox 内に作る */
function jitteredGrid(
  bbox: [number, number, number, number],
  spacing: number,
  salt: number,
  visit: (x: number, y: number, rnd: (k: number) => number) => boolean | undefined
): void {
  const row = spacing * 0.8;
  const [minX, minY, maxX, maxY] = bbox;
  for (let iy = Math.floor(minY / row) - 1; iy <= Math.ceil(maxY / row) + 1; iy++) {
    for (let ix = Math.floor(minX / spacing) - 1; ix <= Math.ceil(maxX / spacing) + 1; ix++) {
      const rnd = (k: number) => hash2(ix, iy, salt + k);
      const x = (ix + (iy & 1 ? 0.5 : 0) + (rnd(0) - 0.5) * 0.8) * spacing;
      const y = (iy + (rnd(1) - 0.5) * 0.8) * row;
      if (visit(x, y, rnd) === false) return;
    }
  }
}

// ---------------------------------------------------------------------------
// 樹木

/** 樹木スプライトの高さ（ワールド単位）。上面図の樹冠半径 3.1 前後に合わせる */
const TREE_HEIGHT: Record<ForestKind, number> = { deciduous: 7.5, coniferous: 8.5, tropical: 8.5 };
const MAX_TREES = 14_000;

/** 広葉樹: こぶ状の丸い樹冠＋短い幹。原点は幹の根元、高さ 1 に正規化 */
function deciduousSprite(id: string, fill: string, colors: ThemeColors["forestCanopy"], variant: number): string {
  const lobes = 6 + variant;
  const cx = 0;
  const cy = -0.6;
  const r = 0.36;
  // 葉群のこぶ（スカラップ）を Q で作る
  const pt = (a: number, rad: number) =>
    `${(cx + Math.cos(a) * rad).toFixed(3)} ${(cy + Math.sin(a) * rad).toFixed(3)}`;
  const step = (Math.PI * 2) / lobes;
  const ph = variant * 0.5;
  let d = `M${pt(ph, r * 0.9)}`;
  for (let i = 0; i < lobes; i++) d += `Q${pt(ph + step * (i + 0.5), r * 1.2)} ${pt(ph + step * (i + 1), r * 0.9)}`;
  d += "Z";
  return `<g id="${id}">
    <ellipse cx="0.12" cy="0" rx="0.34" ry="0.1" fill="${colors.shadow}" opacity="0.45" />
    <path d="M-0.05 0L-0.04 -0.3L0.04 -0.3L0.05 0Z" fill="#4a3522" />
    <path d="${d}" fill="${fill}" stroke="${colors.stroke}" stroke-width="0.05" stroke-linejoin="round" />
    <path d="M${f3(cx + 0.02)} ${f3(cy + r * 0.95)}A${f3(r)} ${f3(r)} 0 0 0 ${f3(cx + r * 1.02)} ${f3(cy - 0.02)}Q${f3(cx + 0.12)} ${f3(cy + 0.1)} ${f3(cx + 0.02)} ${f3(cy + r * 0.95)}Z" fill="${colors.shadow}" opacity="0.35" />
    <ellipse cx="${f3(cx - 0.12)}" cy="${f3(cy - 0.12)}" rx="0.12" ry="0.09" fill="${colors.highlight}" opacity="0.55" />
  </g>`;
}

const f3 = (n: number) => n.toFixed(3);

/** 針葉樹: 段々になった細い円錐。原点は根元、高さ 1 */
function coniferSprite(id: string, fill: string, colors: ThemeColors["forestCanopy"], variant: number): string {
  const w = 0.24 + variant * 0.03;
  // 3 段の枝の層: 各段の外端と、次の段へ戻る内側のくびれ
  const tiers = [0.45, 0.72, 1].map((k, t) => ({ yb: -1 + 0.28 * (t + 1), ww: w * k }));
  const left = tiers.map(
    ({ yb, ww }, t) => `L${f3(-ww)} ${f3(yb)}${t < 2 ? `L${f3(-ww * 0.5)} ${f3(yb - 0.03)}` : ""}`
  );
  const right = tiers.map(({ yb, ww }, t) => `${t < 2 ? `L${f3(ww * 0.5)} ${f3(yb - 0.03)}` : ""}L${f3(ww)} ${f3(yb)}`);
  const body = `M0 -1${left.join("")}${right.reverse().join("")}Z`;
  return `<g id="${id}">
    <ellipse cx="0.1" cy="0" rx="0.24" ry="0.08" fill="${colors.shadow}" opacity="0.45" />
    <path d="M-0.035 0L-0.035 -0.18L0.035 -0.18L0.035 0Z" fill="#4a3522" />
    <path d="${body}" fill="${fill}" stroke="${colors.stroke}" stroke-width="0.05" stroke-linejoin="round" />
    <path d="M0 -1L${f3(w)} -0.16L0 -0.16Z" fill="${colors.shadow}" opacity="0.35" />
  </g>`;
}

/** 熱帯樹: 背の高い幹と垂れた葉の房 */
function tropicalSprite(id: string, fill: string, colors: ThemeColors["forestCanopy"], variant: number): string {
  const lean = (variant - 1) * 0.06;
  const top: Point = [lean, -0.78];
  const fronds = [-2.6, -2.0, -1.2, -0.5, 0.15]
    .map(a => {
      const ex = top[0] + Math.cos(a) * 0.36;
      const ey = top[1] + Math.sin(a) * 0.2 + 0.12;
      const mx = top[0] + Math.cos(a) * 0.2;
      const my = top[1] + Math.sin(a) * 0.2 - 0.08;
      return `M${f3(top[0])} ${f3(top[1])}Q${f3(mx)} ${f3(my - 0.06)} ${f3(ex)} ${f3(ey)}Q${f3(mx)} ${f3(my + 0.06)} ${f3(top[0])} ${f3(top[1])}Z`;
    })
    .join("");
  return `<g id="${id}">
    <ellipse cx="0.1" cy="0" rx="0.3" ry="0.09" fill="${colors.shadow}" opacity="0.4" />
    <path d="M-0.04 0Q${f3(lean * 0.5 - 0.03)} -0.4 ${f3(top[0] - 0.02)} ${f3(top[1])}L${f3(top[0] + 0.02)} ${f3(top[1])}Q${f3(lean * 0.5 + 0.03)} -0.4 0.04 0Z" fill="#5a4128" />
    <circle cx="${f3(top[0])}" cy="${f3(top[1] + 0.03)}" r="0.2" fill="${mixHex(fill, colors.shadow, 0.3)}" stroke="${colors.stroke}" stroke-width="0.04" />
    <path d="${fronds}" fill="${fill}" stroke="${colors.stroke}" stroke-width="0.04" stroke-linejoin="round" />
  </g>`;
}

const TREE_VARIANTS = 3;

/** <defs> に置く樹木スプライト群 */
export function obliqueTreeDefs(colors: ThemeColors["forestCanopy"]): string {
  const out: string[] = [];
  for (const kind of FOREST_KINDS) {
    const base = colors[kind];
    const tones = [mixHex(base, colors.shadow, 0.2), base, mixHex(base, colors.highlight, 0.25)];
    for (let v = 0; v < TREE_VARIANTS; v++) {
      const id = `re-otree-${kind}-${v}`;
      const fill = tones[v];
      out.push(
        kind === "coniferous"
          ? coniferSprite(id, fill, colors, v)
          : kind === "tropical"
            ? tropicalSprite(id, fill, colors, v)
            : deciduousSprite(id, fill, colors, v)
      );
    }
  }
  return out.join("\n");
}

/**
 * 森林塊の内側に斜め見下ろしの樹木を密に並べる。奥から手前へ描くので手前の木が奥の木の根元を隠し、
 * 「樹冠が連なる森」になる。
 */
export function renderObliqueForest(mass: ForestMass, detail: number, mapAreaKm2 = 0): string {
  // 広い地図では本数を間引く代わりに 1 本を大きく描き、森の「木が見える」密度を保つ
  const grow = Math.max(1, Math.sqrt(forestThinning(mapAreaKm2)) * 0.55);
  const lod = detail === 0 ? 1.4 : 1;
  type Tree = { x: number; y: number; s: number; kind: ForestKind; v: number };
  const collect = (spread: number, cap: number): Tree[] => {
    const trees: Tree[] = [];
    FOREST_KINDS.forEach((kind, ki) => {
      if (!mass.kinds.includes(kind)) return;
      const h = TREE_HEIGHT[kind] * grow;
      const spacing = h * (kind === "coniferous" ? 0.42 : 0.5) * lod * spread;
      jitteredGrid(mass.bbox, spacing, 104729 * (ki + 1), (x, y, rnd) => {
        const at = mass.sample([x, y]);
        if (!at || at.kind !== kind) return;
        if (rnd(2) > 0.4 + 0.6 * at.stock) return;
        trees.push({ x, y, s: h * (0.8 + rnd(3) * 0.4), kind, v: Math.floor(rnd(4) * TREE_VARIANTS) });
        if (trees.length >= cap) return false;
      });
    });
    return trees;
  };
  // 面積から総数を見積もり、上限を超えるなら全域で均等に間隔を広げる
  // 上限で打ち切ると先に数えた種類（広葉樹）が枠を使い切り、後の種類（針葉樹）が消える。
  // 粗い格子（間隔 3 倍 = 1/9）で総数を見積もり、全種類へ同じ比率で間隔を広げてから上限なしで集める
  const estimate = collect(3, Number.POSITIVE_INFINITY).length * 9;
  const trees = collect(Math.max(1, Math.sqrt(estimate / MAX_TREES)), Number.POSITIVE_INFINITY);
  trees.sort((a, b) => a.y - b.y || a.x - b.x);
  return `<g class="oblique-forest">${trees
    .map(
      t => `<use href="#re-otree-${t.kind}-${t.v}" transform="translate(${f1(t.x)} ${f1(t.y)}) scale(${f1(t.s)})" />`
    )
    .join("")}</g>`;
}

// ---------------------------------------------------------------------------
// 山・丘

const RELIEF_KINDS: Partial<Record<BiomeKind, "mountain" | "snow" | "hill" | "volcano">> = {
  mountains: "mountain",
  snow_mountains: "snow",
  glacier: "snow",
  hills: "hill",
  badlands: "hill",
  volcanic_rock: "volcano"
};

/** 山並みを敷き詰めるバイオームか（そこに手置きの山・丘シンボルを重ねない判定に使う） */
export function isReliefBiome(b: RegionBiomeArea): boolean {
  return !b.isWater && Boolean(RELIEF_KINDS[b.terrainKind ?? b.kind] ?? RELIEF_KINDS[b.kind]);
}

function elevationAt(hf: RegionHeightfield | undefined, x: number, y: number, w: number, h: number): number | null {
  if (!hf?.cols || !hf.rows) return null;
  const c = Math.max(0, Math.min(hf.cols - 1, Math.round((x / w) * (hf.cols - 1))));
  const r = Math.max(0, Math.min(hf.rows - 1, Math.round((y / h) * (hf.rows - 1))));
  return hf.elevationsMeters[r * hf.cols + c] ?? null;
}

interface ReliefColors {
  light: string;
  dark: string;
  stroke: string;
  snow: string;
  hill: string;
}

/** 非対称な峰。左面は明るく、右面は暗くて斜面に沿ったハッチング。必要なら雪冠を載せる */
function mountainSprite(
  x: number,
  y: number,
  w: number,
  h: number,
  rnd: (k: number) => number,
  col: ReliefColors,
  snowy: boolean,
  volcano: boolean
): string {
  const px = x + (rnd(10) - 0.5) * w * 0.5;
  const py = y - h;
  const lx = x - w * (0.9 + rnd(11) * 0.25);
  const rx = x + w * (0.9 + rnd(12) * 0.25);
  // 尾根の足（光と影の境界）は峰から手前やや右に落ちる
  const fx = px + w * (0.1 + rnd(13) * 0.25);
  const fy = y + h * 0.04;
  // 左右の稜線に小さな肩を入れて手描きらしく
  const ls: Point = [px - (px - lx) * 0.45, py + h * (0.42 + rnd(14) * 0.15)];
  const rs: Point = [px + (rx - px) * 0.5, py + h * (0.45 + rnd(15) * 0.15)];
  const tip = volcano ? `L${f1(px - w * 0.12)} ${f1(py)}L${f1(px + w * 0.12)} ${f1(py)}` : `L${f1(px)} ${f1(py)}`;
  const outline = `M${f1(lx)} ${f1(y)}L${f1(ls[0])} ${f1(ls[1])}${tip}L${f1(rs[0])} ${f1(rs[1])}L${f1(rx)} ${f1(y)}Q${f1(x)} ${f1(y + h * 0.08)} ${f1(lx)} ${f1(y)}Z`;
  const shadow = `M${f1(volcano ? px + w * 0.12 : px)} ${f1(py)}L${f1(rs[0])} ${f1(rs[1])}L${f1(rx)} ${f1(y)}Q${f1((rx + fx) / 2)} ${f1(y + h * 0.06)} ${f1(fx)} ${f1(fy)}Z`;
  const ridge = `M${f1(px)} ${f1(py)}Q${f1(px + (fx - px) * 0.3)} ${f1(py + h * 0.55)} ${f1(fx)} ${f1(fy)}`;
  // 影側のハッチング: 峰から放射状に斜面を下る線
  const hatch: string[] = [];
  const n = Math.max(4, Math.round(w / 1.6));
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const bx = fx + (rx - fx) * t;
    const by = fy + (y - fy) * t;
    const sx = px + (rs[0] - px) * t * 0.6 + (bx - px) * 0.25;
    const sy = py + h * (0.25 + t * 0.2);
    hatch.push(`M${f1(sx)} ${f1(sy)}L${f1(bx - (bx - sx) * 0.15)} ${f1(by - (by - sy) * 0.15)}`);
  }
  let cap = "";
  if (snowy && !volcano) {
    const sh = h * (0.32 + rnd(16) * 0.1);
    const capL: Point = [px - (px - ls[0]) * (sh / (ls[1] - py)), py + sh];
    const capR: Point = [px + (rs[0] - px) * (sh / (rs[1] - py)), py + sh];
    cap = `<path d="M${f1(px)} ${f1(py)}L${f1(capR[0])} ${f1(capR[1])}L${f1(px + (capR[0] - px) * 0.4)} ${f1(py + sh * 0.7)}L${f1(px + (fx - px) * 0.2)} ${f1(py + sh * 1.15)}L${f1(px - (px - capL[0]) * 0.4)} ${f1(py + sh * 0.75)}L${f1(capL[0])} ${f1(capL[1])}Z" fill="${col.snow}" stroke="${col.stroke}" stroke-width="0.35" stroke-linejoin="round" />`;
  }
  const smoke = volcano
    ? `<path d="M${f1(px)} ${f1(py - 1)}q${f1(-w * 0.2)} ${f1(-h * 0.25)} ${f1(w * 0.1)} ${f1(-h * 0.45)}" fill="none" stroke="${col.stroke}" stroke-width="0.4" opacity="0.5" />`
    : "";
  return `<g class="oblique-mountain"><path d="${outline}" fill="${col.light}" stroke="${col.stroke}" stroke-width="0.55" stroke-linejoin="round" /><path d="${shadow}" fill="${col.dark}" /><path d="${hatch.join("")}" fill="none" stroke="${col.stroke}" stroke-width="0.3" opacity="0.65" /><path d="${ridge}" fill="none" stroke="${col.stroke}" stroke-width="0.45" />${cap}${smoke}<path d="${outline}" fill="none" stroke="${col.stroke}" stroke-width="0.55" stroke-linejoin="round" /></g>`;
}

/** なだらかな丘: 左が明るく、右下に影の弧 */
function hillSprite(x: number, y: number, w: number, h: number, rnd: (k: number) => number, col: ReliefColors): string {
  const lx = x - w;
  const rx = x + w;
  const top = x + (rnd(20) - 0.5) * w * 0.4;
  const d = `M${f1(lx)} ${f1(y)}C${f1(lx + w * 0.3)} ${f1(y - h * 1.1)} ${f1(top + w * 0.25)} ${f1(y - h * 1.25)} ${f1(rx)} ${f1(y)}Z`;
  const shade = `M${f1(top + w * 0.15)} ${f1(y - h * 0.85)}C${f1(top + w * 0.6)} ${f1(y - h * 0.8)} ${f1(rx - w * 0.15)} ${f1(y - h * 0.3)} ${f1(rx)} ${f1(y)}L${f1(x + w * 0.2)} ${f1(y)}Q${f1(top + w * 0.35)} ${f1(y - h * 0.4)} ${f1(top + w * 0.15)} ${f1(y - h * 0.85)}Z`;
  return `<g class="oblique-hill"><path d="${d}" fill="${col.hill}" /><path d="${shade}" fill="${col.dark}" opacity="0.35" /><path d="M${f1(lx)} ${f1(y)}C${f1(lx + w * 0.3)} ${f1(y - h * 1.1)} ${f1(top + w * 0.25)} ${f1(y - h * 1.25)} ${f1(rx)} ${f1(y)}" fill="none" stroke="${col.stroke}" stroke-width="0.5" stroke-linecap="round" /></g>`;
}

export function reliefColors(theme: ThemeColors): ReliefColors {
  return {
    light: theme.mountainHighlight,
    dark: mixHex(theme.mountainFill, theme.mountainStroke, 0.2),
    stroke: theme.mountainStroke,
    snow: "#f6f4ef",
    hill: theme.hillFill
  };
}

/**
 * 山岳・丘陵バイオームの内側に、斜め見下ろしの山並みを敷き詰める。
 * 標高場があれば標高で山の高さと雪冠を決める。奥から手前へ重ねて山脈の連なりにする。
 */
export function renderObliqueRelief(
  biomes: RegionBiomeArea[],
  heightfield: RegionHeightfield | undefined,
  widthUnits: number,
  heightUnits: number,
  theme: ThemeColors,
  detail: number,
  mapAreaKm2 = 0
): string {
  const col = reliefColors(theme);
  const areas = biomes
    .map(b => ({ b, kind: RELIEF_KINDS[b.terrainKind ?? b.kind] ?? RELIEF_KINDS[b.kind] }))
    .filter((a): a is { b: RegionBiomeArea; kind: NonNullable<typeof a.kind> } => Boolean(a.kind) && !a.b.isWater);
  if (!areas.length) return "";

  // 地図が広いほど山を大きく粗く（1 枚あたり数百〜数千個に収める）
  const scale = Math.max(1, Math.sqrt(forestThinning(mapAreaKm2)) * 0.6) * (detail === 0 ? 1.3 : 1);
  const mountainW = 15 * scale;
  const hillW = 9 * scale;
  const elevRange = heightfield
    ? Math.max(1, heightfield.maxElevationMeters - Math.max(0, heightfield.minElevationMeters))
    : 1;

  type Item = { y: number; svg: string };
  const items: Item[] = [];
  areas.forEach(({ b, kind }) => {
    const poly = b.polygon;
    if (poly.length < 3) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [px, py] of poly) {
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
    const isHill = kind === "hill";
    const spacing = isHill ? hillW * 1.7 : mountainW * 1.55;
    // 格子はワールド固定（セルをまたいでも位置が揃う）。salt は種類で変えるだけ
    const salt = isHill ? 31337 : 8191;
    jitteredGrid([minX, minY, maxX, maxY], spacing, salt, (x, y, rnd) => {
      if (x < minX || x > maxX || y < minY || y > maxY) return;
      if (!pointInPolygon([x, y], poly)) return;
      if (isHill && rnd(5) < 0.25) return;
      const elev = elevationAt(heightfield, x, y, widthUnits, heightUnits);
      const e =
        elev == null
          ? 0.6
          : Math.max(0, Math.min(1, (elev - Math.max(0, heightfield!.minElevationMeters)) / elevRange));
      if (isHill) {
        const w = hillW * (0.75 + rnd(6) * 0.5);
        items.push({ y, svg: hillSprite(x, y, w, w * (0.4 + rnd(7) * 0.15), rnd, col) });
        return;
      }
      const big = 0.65 + e * 0.7 + rnd(6) * 0.35;
      if (big < 0.85 && rnd(9) < 0.35) return;
      const w = mountainW * big * 0.95;
      const h = mountainW * big * (0.75 + e * 0.35 + rnd(7) * 0.3);
      const snowy = kind === "snow" || (elev != null && elev > 2600) || (elev == null && rnd(8) < 0.25 && big > 1.1);
      items.push({ y, svg: mountainSprite(x, y, w, h, rnd, col, snowy, kind === "volcano") });
    });
  });
  items.sort((a, b) => a.y - b.y);
  return `<g class="oblique-relief">${items.map(i => i.svg).join("")}</g>`;
}

/** シンボル（手置きの山・丘・木）を斜め見下ろしの絵で描く。原点は底面中心 */
export function obliqueSymbolSvg(type: string, theme: ThemeColors): string | null {
  const col = reliefColors(theme);
  const rnd = (k: number) =>
    [0.5, 0.4, 0.6, 0.3, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.45, 0.5, 0.5, 0.4, 0.5, 0.5, 0.4][k % 17];
  if (type === "mountain_peak_major") return mountainSprite(0, 0, 20, 40, rnd, col, false, false);
  if (type === "mountain_peak_minor") return mountainSprite(0, 0, 14, 26, rnd, col, false, false);
  if (type === "mountain_snow") return mountainSprite(0, 0, 22, 46, rnd, col, true, false);
  if (type === "hill_single") return hillSprite(0, 0, 16, 9, rnd, col);
  if (type === "hill_cluster") return hillSprite(-9, -2, 14, 8, rnd, col) + hillSprite(8, 0, 16, 9, rnd, col);
  if (type === "tree_deciduous") return `<use href="#re-otree-deciduous-1" transform="scale(26)" />`;
  if (type === "tree_pine") return `<use href="#re-otree-coniferous-1" transform="scale(30)" />`;
  return null;
}
