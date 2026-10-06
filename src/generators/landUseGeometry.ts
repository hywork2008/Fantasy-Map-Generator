type Point = [number, number];
/** Remove zero-length edges without merging distinct, potentially very thin vertices. */
function normalizePolygon(poly: Point[]): Point[] {
  const result: Point[] = [];
  for (const p of poly) {
    const last = result.at(-1);
    if (!last || p[0] !== last[0] || p[1] !== last[1]) result.push(p);
  }
  if (result.length > 1 && result[0][0] === result.at(-1)![0] && result[0][1] === result.at(-1)![1]) result.pop();
  return result;
}
export function signedArea(poly: Point[]): number {
  if (poly.length < 3) return 0;
  // Translate before multiplying: absolute map coordinates cancel the area of thin cuts.
  const origin = poly[0];
  let area = 0;
  for (let i = 1; i + 1 < poly.length; i++) {
    const p = poly[i],
      q = poly[i + 1];
    area += (p[0] - origin[0]) * (q[1] - origin[1]) - (q[0] - origin[0]) * (p[1] - origin[1]);
  }
  return area / 2;
}
export const polygonArea = (poly: Point[]) => Math.abs(signedArea(poly));
/** Sutherland-Hodgman for convex Voronoi cells and rectangular tiles. */
export function clipConvex(subject: Point[], clip: Point[]): Point[] {
  subject = normalizePolygon(subject);
  clip = normalizePolygon(clip);
  if (!polygonArea(subject) || !polygonArea(clip)) return [];
  const bounds = (poly: Point[]) => {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const p of poly) {
      x0 = Math.min(x0, p[0]);
      y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]);
      y1 = Math.max(y1, p[1]);
    }
    return [x0, y0, x1, y1];
  };
  const a = bounds(subject),
    b = bounds(clip);
  if (a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1]) return [];
  let output = subject;
  const orientation = signedArea(clip) >= 0 ? 1 : -1;
  for (let i = 0; i < clip.length && output.length; i++) {
    const a = clip[i],
      b = clip[(i + 1) % clip.length];
    const side = (p: Point) => orientation * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j],
        q = input[(j + 1) % input.length],
        sp = side(p),
        sq = side(q);
      if (sp >= 0) output.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        output.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
  }
  output = normalizePolygon(output);
  return polygonArea(output) > 0 ? output : [];
}
/** Includes containment and edge crossings, including narrow water crossing a whole parcel. */
export function polygonsOverlap(a: Point[], b: Point[]): boolean {
  return polygonArea(clipConvex(a, b)) > 1e-9;
}
/** Partition a convex polygon around another convex polygon; pieces have disjoint interiors. */
export function subtractConvex(subject: Point[], clip: Point[]): Point[][] {
  subject = normalizePolygon(subject);
  clip = normalizePolygon(clip);
  if (!polygonArea(subject)) return [];
  if (!polygonArea(clip)) return [subject];
  let inside = subject;
  const pieces: Point[][] = [];
  const orientation = signedArea(clip) >= 0 ? 1 : -1;
  for (let i = 0; i < clip.length && inside.length; i++) {
    const a = clip[i],
      b = clip[(i + 1) % clip.length];
    const side = (p: Point) => orientation * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    const half = (keepInside: boolean) => {
      const output: Point[] = [];
      for (let j = 0; j < inside.length; j++) {
        const p = inside[j],
          q = inside[(j + 1) % inside.length],
          sp = side(p),
          sq = side(q);
        if (keepInside ? sp >= 0 : sp <= 0) output.push(p);
        if ((sp > 0 && sq < 0) || (sp < 0 && sq > 0)) {
          const t = sp / (sp - sq);
          output.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
        }
      }
      return normalizePolygon(output);
    };
    const outside = half(false),
      next = half(true);
    if (polygonArea(outside) > 0) pieces.push(outside);
    inside = next;
  }
  return pieces;
}
export function rectangle(x: number, y: number, w: number, h: number): Point[] {
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h]
  ];
}
/** Cut a partial parcel to exactly the remaining physical area rather than just changing its label. */
export function trimToArea(poly: Point[], target: number): Point[] {
  poly = normalizePolygon(poly);
  if (!(target > 0) || !polygonArea(poly)) return [];
  if (polygonArea(poly) <= target) return poly;
  const xs = poly.map(p => p[0]),
    ys = poly.map(p => p[1]);
  const left = Math.min(...xs),
    bottom = Math.min(...ys) - 1,
    top = Math.max(...ys) + 1;
  let lo = left,
    hi = Math.max(...xs),
    result: Point[] = [];
  for (let i = 0; i < 64; i++) {
    const cut = (lo + hi) / 2;
    if (cut === lo || cut === hi) break;
    const candidate = clipConvex(poly, [
      [left - 1, bottom],
      [cut, bottom],
      [cut, top],
      [left - 1, top]
    ]);
    if (polygonArea(candidate) > target) hi = cut;
    else {
      lo = cut;
      result = candidate;
    }
  }
  return result;
}
export function lineBuffer(a: Point, b: Point, width: number): Point[] {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (!length) return rectangle(a[0] - width / 2, a[1] - width / 2, width, width);
  const nx = (-(b[1] - a[1]) * width) / 2 / length,
    ny = ((b[0] - a[0]) * width) / 2 / length;
  return [
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny]
  ];
}
/** Spatially correlated world noise. Adjacent cells and province windows share phases. */
/** Cover at or above this is closed canopy (rainforest etc.): no noise gaps, so no bare cell inside a dense forest biome. */
export const CLOSED_CANOPY_COVER = 0.9;

export function landscapeNoise(x: number, y: number, seed: string): number {
  // Rotated, domain-warped value-noise fBm. Sums of axis-aligned sines gave level sets shaped like
  // rounded rectangles (e.g. forest clearings and wetlands); this keeps the same feature size
  // (~20 units) and spread around 0.5, so cover thresholds tuned against the old noise still hold.
  const salt = hashSeed(seed);
  const u = (x * 0.8 - y * 0.6) / LANDSCAPE_WAVELENGTH,
    v = (x * 0.6 + y * 0.8) / LANDSCAPE_WAVELENGTH;
  const wu = u + 0.6 * (smoothValueNoise(u * 0.5 + 17.3, v * 0.5, salt ^ 0x51ed270b) - 0.5),
    wv = v + 0.6 * (smoothValueNoise(u * 0.5, v * 0.5 + 31.7, salt ^ 0x2545f491) - 0.5);
  const n =
    smoothValueNoise(wu, wv, salt) * 0.6 +
    smoothValueNoise(wu * 2.1, wv * 2.1, salt ^ 0x9e3779b9) * 0.28 +
    smoothValueNoise(wu * 4.3, wv * 4.3, salt ^ 0x7f4a7c15) * 0.12;
  return Math.max(0, Math.min(1, 0.5 + (n - 0.5) * LANDSCAPE_CONTRAST));
}
const LANDSCAPE_WAVELENGTH = 20;
const LANDSCAPE_CONTRAST = 1.43;

/** Coarse heightfield gradient, used as an explicitly approximate slope constraint. */
export function approximateSlope(
  poly: Point[],
  terrain: { cols: number; rows: number; elevationsMeters: number[] } | undefined,
  widthUnits: number,
  heightUnits: number,
  metersPerUnit: number
): number | undefined {
  if (!terrain || terrain.cols < 2 || terrain.rows < 2) return undefined;
  const samples = poly.map(p => {
    if (p[0] < -1e-7 || p[1] < -1e-7 || p[0] > widthUnits + 1e-7 || p[1] > heightUnits + 1e-7) return undefined;
    const x = (Math.max(0, Math.min(widthUnits, p[0])) / widthUnits) * (terrain.cols - 1),
      y = (Math.max(0, Math.min(heightUnits, p[1])) / heightUnits) * (terrain.rows - 1);
    const ix = Math.min(terrain.cols - 2, Math.floor(x)),
      iy = Math.min(terrain.rows - 2, Math.floor(y)),
      tx = x - ix,
      ty = y - iy;
    const a = terrain.elevationsMeters[iy * terrain.cols + ix],
      b = terrain.elevationsMeters[iy * terrain.cols + ix + 1],
      c = terrain.elevationsMeters[(iy + 1) * terrain.cols + ix],
      d = terrain.elevationsMeters[(iy + 1) * terrain.cols + ix + 1];
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
  });
  let result = 0,
    found = false;
  for (let i = 0; i < poly.length; i++)
    for (let j = i + 1; j < poly.length; j++) {
      if (samples[i] === undefined || samples[j] === undefined) continue;
      const distance = Math.hypot(poly[i][0] - poly[j][0], poly[i][1] - poly[j][1]) * metersPerUnit;
      if (distance > 0) {
        result = Math.max(result, Math.abs(samples[i]! - samples[j]!) / distance);
        found = true;
      }
    }
  return found ? result : undefined;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
function latticeValue(ix: number, iy: number, salt: number): number {
  let n = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ salt;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function smoothValueNoise(x: number, y: number, salt: number): number {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const fx = x - ix,
    fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  const top = latticeValue(ix, iy, salt) * (1 - sx) + latticeValue(ix + 1, iy, salt) * sx;
  const bottom = latticeValue(ix, iy + 1, salt) * (1 - sx) + latticeValue(ix + 1, iy + 1, salt) * sx;
  return top * (1 - sy) + bottom * sy;
}
/**
 * Spatially coherent two-octave noise in [0, 1] for land-use layout, in world metres.
 * `wavelength` is the size of the largest features, so unlike landscapeNoise it varies inside one cell.
 */
export function createFieldNoise(seed: string, wavelength: number): (xMeters: number, yMeters: number) => number {
  const salt = hashSeed(seed);
  const fine = wavelength / 2.7;
  return (x, y) =>
    smoothValueNoise(x / wavelength, y / wavelength, salt) * 0.65 +
    smoothValueNoise(x / fine, y / fine, salt ^ 0x9e3779b9) * 0.35;
}
