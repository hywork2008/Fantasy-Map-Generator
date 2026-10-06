import type { Point } from "../core/types";

/**
 * 海岸線の曲線化（FMG の curveBasisClosed 相当）。
 * FMG から届く海岸線は陸セルと海セルの境界辺 1 本ずつの断片なので、端点で連結して鎖にし、
 * 一様 3 次 B スプラインで丸める。B スプラインは頂点を通らず角を内側へ切るため、
 * セル境界（直線）と曲線の間にできる細いレンズ状の隙間を辺ごとのパッチとして返す。
 */

export interface SmoothCoast {
  /** 連結した元の頂点列（閉じていれば先頭=末尾） */
  vertices: Point[];
  closed: boolean;
  /** 曲線の標本点列（閉じていれば先頭=末尾） */
  curve: Point[];
  /** 辺 i ごとの [v_i, 曲線の対応区間, v_{i+1}] 多角形。直線の辺と曲線の間を埋める */
  patches: Point[][];
}

const SAMPLES_PER_SPAN = 6;

const keyOf = (p: Point) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;

/** 端点を共有する断片をつないで鎖にする。分岐点では未使用の断片を 1 本ずつ辿る */
export function chainCoastSegments(pieces: Point[][]): { points: Point[]; closed: boolean }[] {
  const items = pieces.filter(p => p.length >= 2);
  const byEnd = new Map<string, number[]>();
  const add = (k: string, i: number) => {
    const list = byEnd.get(k);
    if (list) list.push(i);
    else byEnd.set(k, [i]);
  };
  items.forEach((p, i) => {
    add(keyOf(p[0]), i);
    add(keyOf(p[p.length - 1]), i);
  });
  const used = new Uint8Array(items.length);
  const take = (k: string): Point[] | null => {
    for (const i of byEnd.get(k) ?? []) {
      if (used[i]) continue;
      used[i] = 1;
      const p = items[i];
      return keyOf(p[0]) === k ? p : [...p].reverse();
    }
    return null;
  };
  const walk = (start: number): Point[] => {
    used[start] = 1;
    const chain = [...items[start]];
    // 前方へ伸ばす
    for (let next = take(keyOf(chain[chain.length - 1])); next; next = take(keyOf(chain[chain.length - 1])))
      chain.push(...next.slice(1));
    // 後方へ伸ばす
    for (let prev = take(keyOf(chain[0])); prev; prev = take(keyOf(chain[0])))
      chain.unshift(...prev.slice(1).reverse());
    return chain;
  };
  const chains: { points: Point[]; closed: boolean }[] = [];
  // 端（次数 1）から始めると開いた鎖が途中で切れない
  const order = items
    .map((_, i) => i)
    .sort((a, b) => {
      const deg = (i: number) =>
        Math.min(byEnd.get(keyOf(items[i][0]))!.length, byEnd.get(keyOf(items[i][items[i].length - 1]))!.length);
      return deg(a) - deg(b);
    });
  for (const i of order) {
    if (used[i]) continue;
    const points = walk(i);
    const closed = points.length > 3 && keyOf(points[0]) === keyOf(points[points.length - 1]);
    chains.push({ points, closed });
  }
  return chains;
}

function bsplinePoint(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const t2 = t * t;
  const t3 = t2 * t;
  const b0 = (1 - t) ** 3 / 6;
  const b1 = (3 * t3 - 6 * t2 + 4) / 6;
  const b2 = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6;
  const b3 = t3 / 6;
  return [b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0], b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1]];
}

/**
 * 鎖を一様 3 次 B スプラインで丸める。開いた鎖は端点を必ず通る。
 * pinned に含まれる頂点は制御点を 3 重にして、曲線がその頂点を正確に通るようにする（港の岸壁など、丸めると
 * 陸側へ引っ込んでしまう頂点用。頂点の前後は角になる）。
 */
export function smoothCoastChain(
  points: Point[],
  closed: boolean,
  pinned: ReadonlySet<number> = new Set()
): SmoothCoast {
  const v = closed ? points.slice(0, -1) : points;
  const n = v.length;
  if (n < 3) {
    const patches: Point[][] = [];
    return { vertices: points, closed, curve: points, patches };
  }
  // 頂点ごとの制御点列。knotCtrl[i] = 頂点 i の「結び目」（曲線がその頂点の近くを通る点）の制御点番号
  const ctrl: Point[] = [];
  const knotCtrl: number[] = [];
  for (let i = 0; i < n; i++) {
    const triple = pinned.has(i) || (!closed && (i === 0 || i === n - 1));
    if (triple) ctrl.push(v[i]);
    knotCtrl.push(ctrl.length);
    ctrl.push(v[i]);
    if (triple) ctrl.push(v[i]);
  }
  const m = ctrl.length;
  const at = (j: number) => ctrl[((j % m) + m) % m];
  const first = knotCtrl[0];
  // 区間 j は制御点 j → j+1 の結び目間。閉じた鎖は最初の結び目が区間 0 の先頭に来るよう 1 周ぶん余分に作る
  const lastSpan = closed ? m + first : knotCtrl[n - 1];
  const full: Point[] = [];
  for (let j = closed ? 0 : first; j < lastSpan; j++)
    for (let k = 0; k < SAMPLES_PER_SPAN; k++)
      full.push(bsplinePoint(at(j - 1), at(j), at(j + 1), at(j + 2), k / SAMPLES_PER_SPAN));
  full.push(closed ? bsplinePoint(at(lastSpan - 1), at(lastSpan), at(lastSpan + 1), at(lastSpan + 2), 0) : v[n - 1]);
  const base = closed ? 0 : first;
  const sampleOf = (i: number) => (knotCtrl[i] - base) * SAMPLES_PER_SPAN;

  // 閉じた鎖の外形線は最初の結び目から 1 周ぶん
  const curve = closed ? full.slice(sampleOf(0), sampleOf(0) + m * SAMPLES_PER_SPAN + 1) : full;
  const patches: Point[][] = [];
  const edgeCount = closed ? n : n - 1;
  for (let i = 0; i < edgeCount; i++) {
    const from = sampleOf(i);
    const to = i + 1 < n ? sampleOf(i + 1) : m * SAMPLES_PER_SPAN + sampleOf(0);
    patches.push([v[i], ...full.slice(from, to + 1), v[(i + 1) % n]]);
  }
  return { vertices: points, closed, curve, patches };
}

/** 鎖の中で pin に最も近い頂点（距離が radius 以内のものだけ） */
function nearestVertices(points: Point[], closed: boolean, pins: Point[], radius: number): Set<number> {
  const count = closed ? points.length - 1 : points.length;
  const out = new Set<number>();
  for (const pin of pins) {
    let best = -1;
    let bestD = radius;
    for (let i = 0; i < count; i++) {
      const d = Math.hypot(points[i][0] - pin[0], points[i][1] - pin[1]);
      if (d <= bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0) out.add(best);
  }
  return out;
}

/**
 * @param pins 曲線を通したい位置（港のある集落など）。その近くの海岸頂点は丸めずに残す
 * @param pinRadius pin から頂点までの許容距離
 */
export function smoothCoastlines(pieces: Point[][], pins: Point[] = [], pinRadius = 24): SmoothCoast[] {
  return chainCoastSegments(pieces).map(c =>
    smoothCoastChain(c.points, c.closed, nearestVertices(c.points, c.closed, pins, pinRadius))
  );
}
