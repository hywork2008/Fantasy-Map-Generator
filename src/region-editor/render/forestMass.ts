import { contours } from "d3";
import type { Point, RegionBiomeArea } from "../core/types";

/**
 * 森林塊（フォレストマス）。
 * 隣接する森林セルの樹冠ポリゴンをワールド座標のグリッドへ塗り、ぼかしてから等値線を取ることで、
 * セル頂点の角を持たない一体の滑らかな輪郭を作る。輪郭はセル境界から多少はみ出したり
 * 引っ込んだりするが、セル同士の継ぎ目と頂点の角は消える。
 */

export type ForestKind = "deciduous" | "coniferous" | "tropical";

export const FOREST_KINDS: ForestKind[] = ["deciduous", "coniferous", "tropical"];

export interface ForestMass {
  /** 森林全体の滑らかな外形（穴を含むリング群）。fill-rule="evenodd" で描く */
  outline: Point[][];
  /** 種類ごとの支配領域（外形で切り抜いて使う）。種類が 1 つだけならその種類が外形全体を受け持つ */
  regions: Partial<Record<ForestKind, Point[][]>>;
  /** 種類ごとの平均蓄積率（林床の濃さに使う） */
  stock: Partial<Record<ForestKind, number>>;
  kinds: ForestKind[];
  bbox: [number, number, number, number];
  /** 点が森林塊の内側ならその種類と蓄積率、外なら null */
  sample(p: Point): { kind: ForestKind; stock: number } | null;
}

/** グリッド標本の上限（描画ごとの計算量を抑える） */
const MAX_SAMPLES = 360_000;
/** 典型的な森林セルの径に対する、ぼかし半径の比率。大きいほど丸く大きな塊になる */
const SMOOTH_RATIO = 0.28;
const CHAIKIN_PASSES = 3;

export function forestKindOf(kind: string): ForestKind {
  return kind === "coniferous_forest" ? "coniferous" : kind === "tropical_forest" ? "tropical" : "deciduous";
}

function stockOf(b: RegionBiomeArea): number {
  return b.forestCover && b.forestStock !== undefined ? Math.max(0, Math.min(1, b.forestStock / b.forestCover)) : 1;
}

function ringArea(ring: Point[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return a / 2;
}

/** 閉じたリングの Chaikin 角切り。等値線の折れ目（格子由来）を消す */
function chaikin(ring: Point[], passes: number): Point[] {
  let pts =
    ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
  for (let k = 0; k < passes; k++) {
    const next: Point[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      next.push(
        [a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25],
        [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]
      );
    }
    pts = next;
  }
  return pts;
}

/** 走査線で多角形内部の標本点（セル中心）に value を書き込む */
function rasterize(
  poly: Point[],
  grid: Float32Array,
  nx: number,
  ny: number,
  x0: number,
  y0: number,
  step: number,
  value: number
): void {
  let minY = Infinity,
    maxY = -Infinity;
  for (const p of poly) {
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  const j0 = Math.max(0, Math.ceil((minY - y0) / step - 0.5));
  const j1 = Math.min(ny - 1, Math.floor((maxY - y0) / step - 0.5));
  const xs: number[] = [];
  for (let j = j0; j <= j1; j++) {
    const y = y0 + (j + 0.5) * step;
    xs.length = 0;
    for (let i = 0, k = poly.length - 1; i < poly.length; k = i++) {
      const a = poly[k];
      const b = poly[i];
      if (a[1] > y !== b[1] > y) xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
    }
    xs.sort((a, b) => a - b);
    for (let n = 0; n + 1 < xs.length; n += 2) {
      const i0 = Math.max(0, Math.ceil((xs[n] - x0) / step - 0.5));
      const i1 = Math.min(nx - 1, Math.floor((xs[n + 1] - x0) / step - 0.5));
      for (let i = i0; i <= i1; i++) grid[j * nx + i] = value;
    }
  }
}

/** 端を複製する分離型ボックスぼかし。3 回重ねてガウスぼかし相当にする */
function blur(src: Float32Array, nx: number, ny: number, r: number): Float32Array {
  if (r < 1) return src;
  const w = 2 * r + 1;
  let a = src;
  for (let pass = 0; pass < 3; pass++) {
    const h = new Float32Array(a.length);
    for (let j = 0; j < ny; j++) {
      const row = j * nx;
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += a[row + Math.min(nx - 1, Math.max(0, k))];
      for (let i = 0; i < nx; i++) {
        h[row + i] = sum / w;
        sum += a[row + Math.min(nx - 1, i + r + 1)] - a[row + Math.max(0, i - r)];
      }
    }
    const v = new Float32Array(a.length);
    for (let i = 0; i < nx; i++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += h[Math.min(ny - 1, Math.max(0, k)) * nx + i];
      for (let j = 0; j < ny; j++) {
        v[j * nx + i] = sum / w;
        sum += h[Math.min(ny - 1, j + r + 1) * nx + i] - h[Math.max(0, j - r) * nx + i];
      }
    }
    a = v;
  }
  return a;
}

function traceContours(
  values: Float32Array,
  nx: number,
  ny: number,
  threshold: number,
  x0: number,
  y0: number,
  step: number,
  minArea: number
): Point[][] {
  const rings: Point[][] = [];
  for (const shape of contours().size([nx, ny]).thresholds([threshold])(Array.from(values))) {
    for (const polygon of shape.coordinates) {
      for (const ring of polygon) {
        // d3-contour: 標本 i は座標 i + 0.5 にある
        const world = ring.map(([x, y]) => [x0 + x * step, y0 + y * step] as Point);
        if (world.length < 4 || Math.abs(ringArea(world)) < minArea) continue;
        rings.push(chaikin(world, CHAIKIN_PASSES));
      }
    }
  }
  return rings;
}

/** 樹冠の最大半径（中心からのはみ出し量）。この距離より水辺に近い所には樹冠の中心を置かない */
const CROWN_REACH = 6;

/** 格子上の真偽マスクを radius 標本ぶん膨らませる（分離型の最大値フィルタ） */
function dilate(src: Uint8Array, nx: number, ny: number, radius: number): Uint8Array {
  if (radius < 1) return src;
  const h = new Uint8Array(src.length);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      if (!src[j * nx + i]) continue;
      for (let k = Math.max(0, i - radius); k <= Math.min(nx - 1, i + radius); k++) h[j * nx + k] = 1;
    }
  const v = new Uint8Array(src.length);
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < ny; j++) {
      if (!h[j * nx + i]) continue;
      for (let k = Math.max(0, j - radius); k <= Math.min(ny - 1, j + radius); k++) v[k * nx + i] = 1;
    }
  return v;
}

/**
 * water: 海・湖・開放水面のポリゴン。ぼかした森林がここへ広がらないよう、水域（＋格子 1 目の余白）で密度を 0 に切る。
 * 水辺の輪郭は丸めずに水際に沿わせ、内陸側の輪郭だけが滑らかに膨らむ。
 */
export function buildForestMass(forestBiomes: RegionBiomeArea[], water: Point[][] = []): ForestMass | null {
  const sources = forestBiomes
    .map(b => ({
      kind: forestKindOf(b.kind),
      stock: stockOf(b),
      polys: (b.forestPolygons ?? [b.polygon]).filter(p => p.length >= 3),
      cell: b.polygon
    }))
    .filter(s => s.polys.length > 0);
  if (!sources.length) return null;

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const cellSizes: number[] = [];
  for (const s of sources) {
    for (const poly of s.polys)
      for (const [x, y] of poly) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    if (s.cell.length >= 3) cellSizes.push(Math.sqrt(Math.abs(ringArea(s.cell))));
  }
  cellSizes.sort((a, b) => a - b);
  const cellSize = cellSizes.length ? cellSizes[Math.floor(cellSizes.length / 2)] : Math.max(maxX - minX, maxY - minY);
  const sigma = Math.max(1e-6, cellSize * SMOOTH_RATIO);
  const margin = sigma * 3;
  minX -= margin;
  minY -= margin;
  maxX += margin;
  maxY += margin;
  const area = (maxX - minX) * (maxY - minY);
  const step = Math.max(sigma / 2.5, Math.sqrt(area / MAX_SAMPLES));
  const nx = Math.max(2, Math.ceil((maxX - minX) / step));
  const ny = Math.max(2, Math.ceil((maxY - minY) / step));
  const x0 = minX;
  const y0 = minY;
  // 3 回のボックスぼかし ≒ 標準偏差 sqrt(r(r+1)) のガウス
  const r = Math.max(1, Math.round(sigma / step));

  const kinds = FOREST_KINDS.filter(k => sources.some(s => s.kind === k));
  const fields = new Map<ForestKind, Float32Array>();
  const stockRaw = new Float32Array(nx * ny);
  const stockSum: Partial<Record<ForestKind, [number, number]>> = {};
  for (const k of kinds) fields.set(k, new Float32Array(nx * ny));
  for (const s of sources) {
    const grid = fields.get(s.kind)!;
    for (const poly of s.polys) {
      rasterize(poly, grid, nx, ny, x0, y0, step, 1);
      rasterize(poly, stockRaw, nx, ny, x0, y0, step, s.stock);
    }
    const [sum, count] = stockSum[s.kind] ?? [0, 0];
    stockSum[s.kind] = [sum + s.stock, count + 1];
  }

  const waterRaw = new Float32Array(nx * ny);
  for (const poly of water) if (poly.length >= 3) rasterize(poly, waterRaw, nx, ny, x0, y0, step, 1);
  const waterBits = Uint8Array.from(waterRaw, v => (v > 0 ? 1 : 0));
  // 等値線は隣の標本との間を補間するので、1 目膨らませてから切ると輪郭が水面へ食い込まない
  const waterEdge = dilate(waterBits, nx, ny, 1);
  const waterNear = dilate(waterBits, nx, ny, Math.ceil(CROWN_REACH / step));
  const blurred = new Map<ForestKind, Float32Array>();
  for (const k of kinds) {
    const f = blur(fields.get(k)!, nx, ny, r);
    for (let i = 0; i < f.length; i++) if (waterEdge[i]) f[i] = 0;
    blurred.set(k, f);
  }
  const total = new Float32Array(nx * ny);
  for (const k of kinds) {
    const f = blurred.get(k)!;
    for (let i = 0; i < total.length; i++) total[i] += f[i];
  }
  const stockField = blur(stockRaw, nx, ny, r);

  const minArea = step * step * 2;
  const outline = traceContours(total, nx, ny, 0.5, x0, y0, step, minArea);
  const regions: ForestMass["regions"] = {};
  if (kinds.length === 1) regions[kinds[0]] = outline;
  else {
    // 種類 k の支配度 = 自分の密度 − 他種の最大密度。0 の等値線が隣り合う種類で一致するので継ぎ目が出ない
    for (const k of kinds) {
      const own = blurred.get(k)!;
      const dom = new Float32Array(nx * ny);
      for (let i = 0; i < dom.length; i++) {
        if (total[i] < 1e-4) {
          dom[i] = -1;
          continue;
        }
        let other = 0;
        for (const j of kinds) if (j !== k) other = Math.max(other, blurred.get(j)![i]);
        dom[i] = own[i] - other;
      }
      regions[k] = traceContours(dom, nx, ny, 0, x0, y0, step, minArea);
    }
  }
  const stock: ForestMass["stock"] = {};
  for (const k of kinds) {
    const acc = stockSum[k]!;
    stock[k] = acc[0] / acc[1];
  }

  const at = (f: Float32Array, gx: number, gy: number): number => {
    const i = Math.max(0, Math.min(nx - 2, Math.floor(gx)));
    const j = Math.max(0, Math.min(ny - 2, Math.floor(gy)));
    const tx = Math.max(0, Math.min(1, gx - i));
    const ty = Math.max(0, Math.min(1, gy - j));
    const a = f[j * nx + i] * (1 - tx) + f[j * nx + i + 1] * tx;
    const b = f[(j + 1) * nx + i] * (1 - tx) + f[(j + 1) * nx + i + 1] * tx;
    return a * (1 - ty) + b * ty;
  };

  return {
    outline,
    regions,
    stock,
    kinds,
    bbox: [x0, y0, x0 + nx * step, y0 + ny * step],
    sample(p) {
      const gx = (p[0] - x0) / step - 0.5;
      const gy = (p[1] - y0) / step - 0.5;
      if (gx < 0 || gy < 0 || gx > nx - 1 || gy > ny - 1) return null;
      const t = at(total, gx, gy);
      if (t < 0.5) return null;
      const ni = Math.min(nx - 1, Math.round(gx));
      const nj = Math.min(ny - 1, Math.round(gy));
      if (waterNear[nj * nx + ni]) return null;
      let kind = kinds[0];
      let best = -1;
      for (const k of kinds) {
        const v = at(blurred.get(k)!, gx, gy);
        if (v > best) {
          best = v;
          kind = k;
        }
      }
      return { kind, stock: Math.max(0, Math.min(1, at(stockField, gx, gy) / t)) };
    }
  };
}

const massCache = new WeakMap<
  RegionBiomeArea[],
  { refs: RegionBiomeArea[]; polys: unknown[]; mass: ForestMass | null }
>();

/** 同じ森林セル群なら前回の結果を再利用する（ズームごとの再描画で再計算しない） */
export function forestMassFor(
  biomes: RegionBiomeArea[],
  forestBiomes: RegionBiomeArea[],
  water: Point[][] = []
): ForestMass | null {
  const polys = [...forestBiomes.map(b => b.forestPolygons ?? b.polygon), ...water];
  const hit = massCache.get(biomes);
  if (
    hit &&
    hit.refs.length === forestBiomes.length &&
    hit.polys.length === polys.length &&
    hit.refs.every(b => forestBiomes.includes(b)) &&
    hit.polys.every((p, i) => p === polys[i])
  )
    return hit.mass;
  const mass = buildForestMass(forestBiomes, water);
  massCache.set(biomes, { refs: forestBiomes, polys, mass });
  return mass;
}

export function ringsToSvgPath(rings: Point[][]): string {
  return rings.map(r => `M${r.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("L")}Z`).join("");
}
