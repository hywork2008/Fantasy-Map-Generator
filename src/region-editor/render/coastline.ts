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

/** 鎖を一様 3 次 B スプラインで丸める。開いた鎖は端点を 3 重にして端点を必ず通す */
export function smoothCoastChain(points: Point[], closed: boolean): SmoothCoast {
  const v = closed ? points.slice(0, -1) : points;
  const n = v.length;
  if (n < 3) {
    const patches: Point[][] = [];
    return { vertices: points, closed, curve: points, patches };
  }
  // ctrl[j] の結び目（曲線上の点）が頂点 v_i に対応する: 閉じた鎖は j = i、開いた鎖は j = i + 2
  const ctrl: Point[] = closed ? v : [v[0], v[0], ...v, v[n - 1], v[n - 1]];
  const m = ctrl.length;
  const at = (j: number) => ctrl[((j % m) + m) % m];
  const spanCount = closed ? m : m - 3;
  const curve: Point[] = [];
  const knotSample: number[] = [];
  for (let s = 0; s < spanCount; s++) {
    // 区間 s は結び目 s+1 → s+2（開）/ s → s+1（閉）
    const j = closed ? s : s + 1;
    knotSample[j] = curve.length;
    for (let k = 0; k < SAMPLES_PER_SPAN; k++)
      curve.push(bsplinePoint(at(j - 1), at(j), at(j + 1), at(j + 2), k / SAMPLES_PER_SPAN));
  }
  const lastKnot = closed ? m : m - 2;
  knotSample[lastKnot] = curve.length;
  curve.push(closed ? curve[0] : bsplinePoint(at(lastKnot - 1), at(lastKnot), at(lastKnot + 1), at(lastKnot + 2), 0));

  const patches: Point[][] = [];
  const edgeCount = closed ? n : n - 1;
  for (let i = 0; i < edgeCount; i++) {
    const ja = closed ? i : i + 2;
    const jb = closed ? i + 1 : i + 3;
    const arc = curve.slice(knotSample[ja], knotSample[jb] + 1);
    patches.push([v[i], ...arc, v[(i + 1) % n]]);
  }
  // 開いた鎖の端（端点→最初の結び目）は辺上の直線なので面積はなく、パッチ不要
  return { vertices: points, closed, curve, patches };
}

export function smoothCoastlines(pieces: Point[][]): SmoothCoast[] {
  return chainCoastSegments(pieces).map(c => smoothCoastChain(c.points, c.closed));
}
