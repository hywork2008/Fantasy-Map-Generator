import type { Point } from "../../../types/primitives";

/**
 * Tanners' row (docs/plan/ce-meshless-tanners-row.md, method A). A tannery is a rectangle whose back stands on the
 * water; a curved bank cannot take a straight back. The bank is cut into straight chords, each set landward so the
 * bank never crosses it and no farther from the bank than a timber or stone revetment fills (the apron). The yards
 * stand side by side on the chords; their intake and effluent channels run square to the chord across the apron, so
 * however the river bends, every channel is short and square to its yard. Ground between chords (the bends) stays
 * open: a water lane or a drying ground.
 */

export interface TannersRowOptions {
  /** Widest revetment allowed between a chord and the bank. */
  apronMaxMeters: number;
  /** Frontage of one yard along the chord. */
  frontageMeters: number;
  /** Depth of one yard, from its back on the chord to its front. */
  depthMeters: number;
  /** Ports on the yard's back, in the model's frame (x across the frontage, upstream port first). */
  intakeX: number;
  effluentX: number;
  /** Resampling step of the bank. */
  stepMeters: number;
}

export const TANNERS_ROW_DEFAULTS: TannersRowOptions = {
  apronMaxMeters: 2,
  frontageMeters: 18,
  depthMeters: 16,
  intakeX: -7.5,
  effluentX: 7.5,
  stepMeters: 1
};

export interface TannersRowYard {
  /** Model origin: the middle of the yard (the back lies on the chord, the front landward). */
  position: Point;
  /** The facing convention of the CE placements (local +Z front onto the land). */
  facingDegrees: number;
  /** Local x is mirrored so the intake stays upstream. */
  mirrored: boolean;
  /** Each port on the chord, the bank point its channel meets square to the chord, and the channel's length. */
  intake: { port: Point; bank: Point; lengthMeters: number };
  effluent: { port: Point; bank: Point; lengthMeters: number };
}

export interface TannersReach {
  /** The chord, upstream end first. */
  a: Point;
  b: Point;
  /** Unit downstream direction and unit normal onto the land. */
  tangent: Point;
  landNormal: Point;
  /** Widest revetment between the chord and the bank. */
  apronMeters: number;
  /** Arc length of the bank the chord covers. */
  fromMeters: number;
  toMeters: number;
  yards: TannersRowYard[];
}

export interface TannersRow {
  reaches: TannersReach[];
  /** Bank between chords, too bent for one yard: water lanes and drying grounds. */
  bendMeters: number;
  bankMeters: number;
}

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1];
const along = (p: Point, u: Point, k: number): Point => [p[0] + u[0] * k, p[1] + u[1] * k];

/** The bank every `step` metres along its length and at each vertex, with the arc length at each point. */
function resample(bank: Point[], step: number): { points: Point[]; s: number[] } {
  const points: Point[] = [bank[0]],
    s = [0];
  let walked = 0,
    next = step;
  for (let i = 1; i < bank.length; i++) {
    const a = bank[i - 1],
      b = bank[i],
      l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (next <= walked + l) {
      const t = (next - walked) / l;
      points.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      s.push(next);
      next += step;
    }
    walked += l;
    // The bank's own vertices too, so no corner of it falls between samples and pokes past a chord.
    if (i < bank.length - 1 && walked - s.at(-1)! > 1e-6) {
      points.push(b);
      s.push(walked);
    }
  }
  if (walked - s.at(-1)! > 1e-6) {
    points.push(bank.at(-1)!);
    s.push(walked);
  }
  return { points, s };
}

/** The chord over bank points i..j: its direction, land normal, landward shift and apron. */
function chord(points: Point[], i: number, j: number, landSide: 1 | -1) {
  const d = sub(points[j], points[i]),
    l = Math.hypot(d[0], d[1]);
  if (l < 1e-9) return undefined;
  const u: Point = [d[0] / l, d[1] / l],
    n: Point = [-u[1] * landSide, u[0] * landSide];
  let hi = -Infinity,
    lo = Infinity;
  for (let k = i; k <= j; k++) {
    const o = dot(sub(points[k], points[i]), n);
    hi = Math.max(hi, o);
    lo = Math.min(lo, o);
  }
  return { u, n, shift: hi, apron: hi - lo, length: l };
}

/** Distance from the chord to the bank, square to the chord, at `x` metres along it from `a` (bank points i..j). */
function apronAt(points: Point[], i: number, j: number, a: Point, u: Point, n: Point, x: number) {
  for (let k = i; k < j; k++) {
    const p = dot(sub(points[k], a), u),
      q = dot(sub(points[k + 1], a), u);
    if ((p - x) * (q - x) <= 0 && p !== q) {
      const t = (x - p) / (q - p),
        bank: Point = [
          points[k][0] + (points[k + 1][0] - points[k][0]) * t,
          points[k][1] + (points[k + 1][1] - points[k][1]) * t
        ];
      return { bank, lengthMeters: Math.max(0, -dot(sub(bank, a), n)) };
    }
  }
  return undefined;
}

/**
 * Yards along a bank. `bank` is the water's edge on the side the yards stand, ordered downstream; `landSide` is 1
 * when the land lies left of the downstream direction, -1 when right.
 */
export function tannersRow(bank: Point[], landSide: 1 | -1, options: Partial<TannersRowOptions> = {}): TannersRow {
  const o = { ...TANNERS_ROW_DEFAULTS, ...options };
  const { points, s } = resample(bank, o.stepMeters);
  const row: TannersRow = { reaches: [], bendMeters: 0, bankMeters: s.at(-1) ?? 0 };
  let i = 0;
  while (i < points.length - 1) {
    // The longest chord from i whose apron stays within bounds.
    let best = -1;
    for (let j = i + 1; j < points.length; j++) {
      const c = chord(points, i, j, landSide);
      if (!c) continue;
      if (c.apron > o.apronMaxMeters) break;
      best = j;
    }
    const c = best > i ? chord(points, i, best, landSide) : undefined;
    const yards = c ? Math.floor((c.length + 1e-9) / o.frontageMeters) : 0;
    if (!c || yards < 1) {
      row.bendMeters += s[i + 1] - s[i];
      i++;
      continue;
    }
    const { u, n } = c,
      a = along(points[i], n, c.shift),
      b = along(a, u, c.length),
      reach: TannersReach = {
        a,
        b,
        tangent: u,
        landNormal: n,
        apronMeters: c.apron,
        fromMeters: s[i],
        toMeters: s[best],
        yards: []
      };
    // The CE facing: a BV model's plan frame is (x, -z) (bvFacilityAsset), so its front (+z) is local -y. Turned by
    // theta, local -y lies on n (the land) and local +x at (-n.y, n.x).
    const theta = Math.atan2(n[0], -n[1]),
      mirrored = dot([-n[1], n[0]], u) < 0,
      start = (c.length - yards * o.frontageMeters) / 2;
    for (let k = 0; k < yards; k++) {
      const mid = start + (k + 0.5) * o.frontageMeters,
        position = along(along(a, u, mid), n, o.depthMeters / 2);
      // Mirroring keeps the intake upstream: in world terms each port lies at its x along the downstream tangent.
      const port = (x: number) => {
        const at = mid + x,
          hit = apronAt(points, i, best, a, u, n, at);
        const p = along(a, u, at);
        return hit ? { port: p, ...hit } : { port: p, bank: p, lengthMeters: 0 };
      };
      reach.yards.push({
        position,
        facingDegrees: ((((theta * 180) / Math.PI) % 360) + 360) % 360,
        mirrored,
        intake: port(Math.min(o.intakeX, o.effluentX)),
        effluent: port(Math.max(o.intakeX, o.effluentX))
      });
    }
    row.reaches.push(reach);
    i = best;
  }
  return row;
}
