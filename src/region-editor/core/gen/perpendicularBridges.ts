import { distance, dot, normal, normalize, pointAdd, pointScale, pointSub, segmentIntersection } from "../geometry";
import type { Point, RegionBridge, RegionDocument, RegionRiver, RegionRoute } from "../types";
import { DEFAULT_RIVER_WIDTH_SCALE } from "../types";

export interface BridgeGenerationResult {
  bridges: RegionBridge[];
  /**
   * 描画用ルート: 橋の前後に河川法線と一直線に並ぶ4点（進入点・橋端・橋端・退出点）を差し込んだもの。
   * Catmull-Rom で丸めても橋の区間は直線のまま残る。保存せず描画時にだけ使う（保存すると再計算のたびに点が増殖する）。
   */
  adjustedRoutes: RegionRoute[];
}

/** 描画時の Catmull-Rom 張力（render/svg.ts の createCurvedRoutePath / createCurvedRiverPolygon と一致させる） */
const CURVE_ALPHA = 0.1;
const SAMPLES_PER_SEGMENT = 24;

/** createCurvedRiverPolygon と同じ式で、描画される川幅（map units）を求める */
export function riverVisualWidthUnits(widthMeters: number, metersPerUnit: number, riverWidthScale: number): number {
  const baseUnits = (widthMeters * riverWidthScale) / metersPerUnit;
  return Math.max(1.6, Math.min(24, 1.2 + baseUnits * 0.95));
}

interface CurveSample {
  p: Point;
  /** 元ポリラインの頂点インデックス + 区間内パラメータ */
  s: number;
}

/** d3.curveCatmullRom.alpha(alpha) と同一の曲線をサンプリングする */
export function sampleCatmullRom(
  points: Point[],
  alpha = CURVE_ALPHA,
  perSegment = SAMPLES_PER_SEGMENT
): CurveSample[] {
  const n = points.length;
  if (n === 0) return [];
  if (n === 1) return [{ p: points[0], s: 0 }];
  if (n === 2) {
    // d3 も2点は直線で描く。垂線の足を探せるよう細分しておく
    const [a, b] = points;
    return Array.from({ length: perSegment + 1 }, (_, k) => {
      const t = k / perSegment;
      return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as Point, s: t };
    });
  }
  const out: CurveSample[] = [{ p: points[0], s: 0 }];
  const eps = 1e-12;
  for (let i = 0; i + 1 < n; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(n - 1, i + 2)];
    const l01 = distance(p0, p1);
    const l12 = distance(p1, p2);
    const l23 = distance(p2, p3);
    const l01a = l01 ** alpha;
    const l12a = l12 ** alpha;
    const l23a = l23 ** alpha;
    const l01_2a = l01a * l01a;
    const l12_2a = l12a * l12a;
    const l23_2a = l23a * l23a;
    let c1: Point = p1;
    let c2: Point = p2;
    if (l01a > eps) {
      const a = 2 * l01_2a + 3 * l01a * l12a + l12_2a;
      const m = 3 * l01a * (l01a + l12a);
      c1 = [(p1[0] * a - p0[0] * l12_2a + p2[0] * l01_2a) / m, (p1[1] * a - p0[1] * l12_2a + p2[1] * l01_2a) / m];
    }
    if (l23a > eps) {
      const b = 2 * l23_2a + 3 * l23a * l12a + l12_2a;
      const m = 3 * l23a * (l23a + l12a);
      c2 = [(p2[0] * b + p1[0] * l23_2a - p3[0] * l12_2a) / m, (p2[1] * b + p1[1] * l23_2a - p3[1] * l12_2a) / m];
    }
    for (let k = 1; k <= perSegment; k++) {
      const t = k / perSegment;
      const u = 1 - t;
      const w0 = u * u * u;
      const w1 = 3 * u * u * t;
      const w2 = 3 * u * t * t;
      const w3 = t * t * t;
      out.push({
        p: [w0 * p1[0] + w1 * c1[0] + w2 * c2[0] + w3 * p2[0], w0 * p1[1] + w1 * c1[1] + w2 * c2[1] + w3 * p2[1]],
        s: i + t
      });
    }
  }
  return out;
}

function dedupePoints(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) if (!out.length || distance(out[out.length - 1], p) > 1e-6) out.push(p);
  return out;
}

interface Crossing {
  river: RegionRiver;
  curve: CurveSample[];
  center: Point;
  tangent: Point;
  widthMeters: number;
  /** ルート描画曲線上の位置（元頂点インデックス + 区間内パラメータ） */
  routeS: number;
}

function findCrossings(
  routeCurve: CurveSample[],
  riverCurves: { river: RegionRiver; curve: CurveSample[] }[]
): Crossing[] {
  const found: Crossing[] = [];
  for (const { river, curve } of riverCurves) {
    for (let i = 0; i + 1 < routeCurve.length; i++) {
      const a = routeCurve[i];
      const b = routeCurve[i + 1];
      for (let j = 0; j + 1 < curve.length; j++) {
        const hit = segmentIntersection(a.p, b.p, curve[j].p, curve[j + 1].p);
        if (!hit.intersects || !hit.point) continue;
        // サンプル境界上の交点は隣接区間で重複検出されるので1つにまとめる
        if (found.some(f => f.river === river && distance(f.center, hit.point!) < 1e-6)) continue;
        // 折れ目に依存しないよう、前後サンプルの中心差分接線を交点位置で補間する
        const chord = distance(curve[j].p, curve[j + 1].p) || 1;
        const u = distance(curve[j].p, hit.point) / chord;
        const ta = curveTangentAt(curve, j);
        const tb = curveTangentAt(curve, j + 1);
        const tangent = normalize([ta[0] + (tb[0] - ta[0]) * u, ta[1] + (tb[1] - ta[1]) * u]);
        const rs = curve[j].s + (curve[j + 1].s - curve[j].s) * 0.5;
        const k = Math.min(river.widths.length - 1, Math.floor(rs));
        const f = rs - Math.floor(rs);
        const w0 = river.widths[Math.max(0, k)] ?? 200;
        const w1 = river.widths[Math.min(river.widths.length - 1, k + 1)] ?? w0;
        const segLen = distance(a.p, b.p) || 1;
        found.push({
          river,
          curve,
          center: hit.point,
          tangent,
          widthMeters: w0 + (w1 - w0) * f,
          routeS: a.s + (b.s - a.s) * (distance(a.p, hit.point) / segLen)
        });
      }
    }
  }
  return found.sort((x, y) => x.routeS - y.routeS);
}

/**
 * 街道と河川の交差点に、描画される河川曲線の接線に対して厳格に直角（90度）な橋梁を生成する。
 *
 * 規約要件（AGENTS.md）:
 * 「河川を通過する橋は河川の進行方向と直角に交差させ、最短距離で通過させる。
 * 直角に交差しない橋は絶対に描いてはならない。」
 *
 * 交差判定は描画と同じ Catmull-Rom 曲線上で行い、橋長は描画される川幅から求める。
 * 橋の近傍にある元のルート頂点は取り除き、河川法線上の4点で置き換えるため、
 * 橋の上で道が曲がったり橋からはみ出したりしない。
 */
export function generatePerpendicularBridges(
  rivers: RegionRiver[],
  routes: RegionRoute[],
  metersPerUnit = 100,
  riverWidthScale = DEFAULT_RIVER_WIDTH_SCALE,
  /** 集落位置。ルート上のこれらの頂点は橋のために取り除かない */
  anchors: Point[] = []
): BridgeGenerationResult {
  const bridges: RegionBridge[] = [];
  const adjustedRoutes: RegionRoute[] = [];
  const riverCurves = rivers
    .filter(r => r.points.length >= 2)
    .map(river => ({ river, curve: sampleCatmullRom(dedupePoints(river.points)) }));

  for (const route of routes) {
    const base = dedupePoints(route.points);
    if (route.kind === "sea_lane" || base.length < 2) {
      adjustedRoutes.push(route);
      continue;
    }

    let points = base;
    let modified = false;
    // 処理済みの窓（交差中心と半径）。窓内の交差は同じ地点として扱う（頂点上の二重検出・蛇行の多重交差を統合）
    const windows: { center: Point; radius: number }[] = [];
    // 頂点の差し替えで描画曲線が別の場所で川を跨ぐことがあるため、未処理の交差が無くなるまで繰り返す
    for (let pass = 0; pass < 64; pass++) {
      const crossings = findCrossings(sampleCatmullRom(points), riverCurves).filter(
        c => !windows.some(w => distance(w.center, c.center) < w.radius)
      );
      if (!crossings.length) break;
      const c = crossings[0];

      const visual = riverVisualWidthUnits(c.widthMeters, metersPerUnit, riverWidthScale);
      const halfLen = visual / 2 + Math.max(1, visual * 0.2);
      const radius = halfLen + Math.max(2, halfLen * 0.6);
      const isTown = (p: Point) => anchors.some(a => distance(a, p) < 1e-3);
      // 水源の脇をかすめるだけの交差（水源に建つ町から出る道など）は川を渡っていないので橋を架けない
      if (distance(c.center, c.river.points[0]) < halfLen + 2) {
        windows.push({ center: c.center, radius: halfLen + 2 });
        continue;
      }
      windows.push({ center: c.center, radius });
      // 同じ川を窓内で何度跨いだか。偶数なら渡って戻るだけ（橋は不要で、川へのはみ出しを除くのみ）
      const recrossings = crossings.filter(o => o.river === c.river && distance(o.center, c.center) < radius).length;

      // 窓内の頂点範囲 points[lo..hi] を求める。ルート端点は窓の境界として残す
      const near = (p: Point) => distance(p, c.center) < radius;
      let idx = 0;
      let best = Infinity;
      for (let i = 0; i + 1 < points.length; i++) {
        const d = distToSegment(c.center, points[i], points[i + 1]);
        if (d < best) {
          best = d;
          idx = i;
        }
      }
      let lo = idx + 1;
      while (lo - 1 > 0 && near(points[lo - 1])) lo--;
      let hi = idx;
      while (hi + 1 < points.length - 1 && near(points[hi + 1])) hi++;
      const before = points[lo - 1];
      const after = points[hi + 1];
      // 窓内の集落頂点は消さずに残す
      const towns = points.slice(lo, hi + 1).filter(isTown);

      if (recrossings % 2 === 0) {
        points = [...points.slice(0, lo), ...towns, ...points.slice(hi + 1)];
        modified = true;
        continue;
      }

      // 窓内に集落（川岸の町）や窓に掛かる端点があれば、その頂点から川へ下ろした垂線上に橋を移す。
      // 頂点が橋軸上に乗るので、町から橋へ向かう道が橋の外で川を横切らない
      let center = c.center;
      let tangent = c.tangent;
      const pins = [...towns, ...[before, after].filter(near)];
      const pinned = pins.sort((p, q) => distance(p, c.center) - distance(q, c.center))[0];
      if (pinned) {
        const foot = perpendicularFoot(c.curve, pinned, c.center, radius);
        if (foot) {
          tangent = foot.tangent;
          // 頂点を厳密に橋軸（川の法線）上に乗せる: 中心は川上の足元から接線方向に誤差分だけずらす
          const nn = normal(tangent);
          center = pointSub(pinned, pointScale(nn, dot(pointSub(pinned, foot.point), nn)));
        }
      }

      if (center !== c.center) windows.push({ center, radius });
      let n = normal(tangent);
      if (dot(pointSub(after, before), n) < 0) n = pointScale(n, -1);
      const along = (d: number): Point => pointAdd(center, pointScale(n, d));
      const offsetOf = (p: Point) => dot(pointSub(p, center), n);
      // 窓に掛かる端点は橋軸上の位置で判定し、橋の手前・橋上・橋の先のどこから道が始まるかを決める
      const startOffset = near(before) ? offsetOf(before) : -Infinity;
      const endOffset = near(after) ? offsetOf(after) : Infinity;
      const margin = halfLen * 0.25;
      const spans = startOffset < -margin && endOffset > margin && (startOffset <= -halfLen || endOffset >= halfLen);
      if (!spans) {
        // 道の端が川の上にある（川に面した集落で終わる）: 対岸へ渡らないので橋は架けない
        points = [...points.slice(0, lo), ...towns, ...points.slice(hi + 1)];
        modified = true;
        continue;
      }

      // 橋軸上の点列: 進入点・橋端・（軸上の町）・橋端・退出点。軸上の頂点の両脇に軸上の点を添え、
      // 隣の頂点が軸から外れていても Catmull-Rom の膨らみを橋の外に追い出す
      const eps = Math.min(0.5, halfLen * 0.1);
      const pinOffset = pinned && pinned !== before && pinned !== after ? offsetOf(pinned) : null;
      const offsets = [-radius, -halfLen, halfLen, radius];
      if (Number.isFinite(startOffset)) offsets.push(startOffset + eps);
      if (Number.isFinite(endOffset)) offsets.push(endOffset - eps);
      if (pinOffset !== null) offsets.push(pinOffset - eps, pinOffset + eps);
      const axis = offsets
        .filter(d => d > startOffset && d < endOffset)
        .sort((x, y) => x - y)
        .map(d => ({ d, p: along(d) }));
      // 町は軸上の正しい位置に元の座標のまま差し込む（軸から外れた他の町は射影位置の順に並べる）
      for (const t of towns) axis.push({ d: offsetOf(t), p: t });
      axis.sort((x, y) => x.d - y.d);
      points = [...points.slice(0, lo), ...axis.map(e => e.p), ...points.slice(hi + 1)];
      modified = true;

      const angleDeg = (Math.atan2(n[1], n[0]) * 180) / Math.PI;
      bridges.push({
        id: `bridge-${route.id}-${c.river.id}-${bridges.length + 1}`,
        riverId: c.river.id,
        routeId: route.id,
        center,
        lengthMeters: halfLen * 2 * metersPerUnit,
        widthMeters: route.kind === "highway" ? 12 : 8,
        angleDeg,
        style: route.kind === "highway" ? "stone_arch" : "wooden"
      });
    }

    adjustedRoutes.push({ ...route, points: modified ? points : route.points });
  }

  return { bridges, adjustedRoutes };
}

function curveTangentAt(curve: CurveSample[], j: number): Point {
  return normalize(pointSub(curve[Math.min(curve.length - 1, j + 1)].p, curve[Math.max(0, j - 1)].p));
}

/**
 * p から川曲線へ下ろした垂線の足（(p - P)·T = 0 となる点）を、連続な接線で補間して求める。
 * サンプル頂点の折れ目で最寄り点を取ると法線が p を通らないため。
 */
function perpendicularFoot(
  curve: CurveSample[],
  p: Point,
  near: Point,
  radius: number
): { point: Point; tangent: Point } | null {
  const tangentAt = (j: number) => curveTangentAt(curve, j);
  let best = -1;
  let bestD = Infinity;
  for (let j = 0; j < curve.length; j++) {
    const d = distance(p, curve[j].p);
    if (d < bestD && distance(curve[j].p, near) < radius) {
      bestD = d;
      best = j;
    }
  }
  if (best < 0) return null;
  const f = (j: number) => dot(pointSub(p, curve[j].p), tangentAt(j));
  for (const k of [best - 1, best]) {
    if (k < 0 || k + 1 >= curve.length) continue;
    const f0 = f(k);
    const f1 = f(k + 1);
    if (f0 === 0 || f0 * f1 < 0) {
      const t = f0 === 0 ? 0 : f0 / (f0 - f1);
      const a = curve[k].p;
      const b = curve[k + 1].p;
      const ta = tangentAt(k);
      const tb = tangentAt(k + 1);
      return {
        point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        tangent: normalize([ta[0] + (tb[0] - ta[0]) * t, ta[1] + (tb[1] - ta[1]) * t])
      };
    }
  }
  return { point: curve[best].p, tangent: tangentAt(best) };
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const ab = pointSub(b, a);
  const len2 = dot(ab, ab);
  const t = len2 > 0 ? Math.max(0, Math.min(1, dot(pointSub(p, a), ab) / len2)) : 0;
  return distance(p, pointAdd(a, pointScale(ab, t)));
}

/**
 * 旧版の橋生成はルートに橋端点を書き込んで保存していた（再計算のたびに点が増え、道が蛇行・はみ出す原因）。
 * 保存済み橋の幾何から当時の挿入点を復元して取り除き、元のルートに戻す。
 */
export function stripLegacyBridgePoints(doc: Pick<RegionDocument, "routes" | "bridges" | "bounds">): void {
  const mpu = doc.bounds.metersPerUnit || 100;
  for (const route of doc.routes) {
    const own = doc.bridges.filter(b => b.routeId === route.id);
    if (!own.length) continue;
    const inserted: Point[] = [];
    for (const b of own) {
      const rad = (b.angleDeg * Math.PI) / 180;
      const n: Point = [Math.cos(rad), Math.sin(rad)];
      const halfLen = b.lengthMeters / mpu / 2;
      inserted.push(pointAdd(b.center, pointScale(n, -halfLen)), pointAdd(b.center, pointScale(n, halfLen)));
    }
    route.points = route.points.filter(
      (p, i) => i === 0 || i === route.points.length - 1 || !inserted.some(q => distance(p, q) < 1e-3)
    );
  }
}
