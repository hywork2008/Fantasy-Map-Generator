import { nearestOnPolyline, pointInPolygon, polygonCentroid } from "../../generators/geom";
import type { Point } from "../../types/primitives";
import type { VectorPolygon } from "../../types/vector/generation";

/**
 * Level ground of the natural relief (docs/plan/ce-meshless-natural-relief.md §5.1, §5.7): a prism from below the
 * ground up to a level top, with stone sides. The ground is not graded; where it stands above the top, it is not
 * drawn there and the side becomes the retaining wall.
 */
export interface ReliefPrism {
  id: string;
  ring: Point[];
  /** Per ring vertex. */
  bottom: number[];
  top: number[];
  sideColor: string;
  /** The level surface on top, if drawn; a building's own floor covers its plinth. */
  capColor?: string;
}

/** Where the level surface lies below the ground: the ground is not drawn above `level` inside `ring`. */
export interface ReliefCut {
  ring: Point[];
  level: number;
}

export const STONE_COLOR = "#a39a8a";
/** A yard falls by more than this from front to back: it is split into terraces (§5.7). */
export const YARD_TERRACE_STEP_METERS = 1.2;
const MAX_TERRACES = 3;
const FOOTING_METERS = 0.3;

/** Keep the part of `ring` where `(p − origin)·normal` lies in [from, to] (convex clipping by two half-planes). */
function band(ring: Point[], origin: Point, normal: Point, from: number, to: number): Point[] {
  const along = (p: Point) => (p[0] - origin[0]) * normal[0] + (p[1] - origin[1]) * normal[1];
  const clip = (points: Point[], keep: (d: number) => number) => {
    const out: Point[] = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i],
        b = points[(i + 1) % points.length],
        da = keep(along(a)),
        db = keep(along(b));
      if (da >= 0) out.push(a);
      if (da >= 0 !== db >= 0) {
        const t = da / (da - db);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return out;
  };
  return clip(
    clip(ring, d => d - from),
    d => to - d
  );
}

const area = (ring: Point[]) => {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
};

/**
 * The level terraces of a street block's built yards (§5.7): the part beside and behind the house at its floor, and
 * the rest towards the back split into up to three terraces at their own ground, when the yard falls by more than a
 * step. Each terrace's ground is cut where it stands above it; its sides are the retaining walls.
 */
export function reliefYardTerraces(
  id: string,
  rings: Point[][],
  fronts: [Point, Point][],
  houses: { ring: Point[]; floor: number }[],
  heightAt: (p: Point) => number,
  yardColor: string
): { prisms: ReliefPrism[]; cuts: ReliefCut[]; levels: { ring: Point[]; level: number }[] } {
  const prisms: ReliefPrism[] = [],
    cuts: ReliefCut[] = [],
    levels: { ring: Point[]; level: number }[] = [];
  rings.forEach((ring, i) => {
    const [fa, fb] = fronts[i],
      mid: Point = [(fa[0] + fb[0]) / 2, (fa[1] + fb[1]) / 2],
      centre = polygonCentroid(ring);
    let nx = -(fb[1] - fa[1]),
      ny = fb[0] - fa[0];
    const length = Math.hypot(nx, ny);
    if (length < 1e-6) return;
    nx /= length;
    ny /= length;
    if ((centre[0] - mid[0]) * nx + (centre[1] - mid[1]) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const normal: Point = [nx, ny],
      along = (p: Point) => (p[0] - mid[0]) * nx + (p[1] - mid[1]) * ny,
      depth = Math.max(...ring.map(along));
    const own = houses.filter(h => pointInPolygon(polygonCentroid(h.ring), ring));
    if (!own.length || depth <= 0.5) return;
    // The front house sets the yard's first level: its floor, reached by its back door.
    const front = own.reduce((a, b) => (Math.min(...a.ring.map(along)) <= Math.min(...b.ring.map(along)) ? a : b)),
      houseBack = Math.min(depth, Math.max(0, ...front.ring.map(along))),
      backGround = heightAt([mid[0] + nx * depth, mid[1] + ny * depth]),
      rest = depth - houseBack,
      count =
        rest < 2 ? 0 : Math.min(MAX_TERRACES, Math.ceil(Math.abs(backGround - front.floor) / YARD_TERRACE_STEP_METERS)),
      pieces: { ring: Point[]; level: number }[] = [];
    const firstTo = count ? houseBack : depth;
    pieces.push({ ring: band(ring, mid, normal, -1, firstTo), level: front.floor });
    for (let k = 0; k < count; k++) {
      const from = houseBack + (rest * k) / count,
        to = k === count - 1 ? depth + 1 : houseBack + (rest * (k + 1)) / count,
        centreDepth = (from + Math.min(to, depth)) / 2,
        across = (t: number): Point => [
          fa[0] + (fb[0] - fa[0]) * t + nx * centreDepth,
          fa[1] + (fb[1] - fa[1]) * t + ny * centreDepth
        ],
        ground = (heightAt(across(0.25)) + heightAt(across(0.5)) + heightAt(across(0.75))) / 3,
        // A terrace within a hand of the floor stays at the floor.
        level = Math.abs(ground - front.floor) < 0.3 ? front.floor : ground;
      pieces.push({ ring: band(ring, mid, normal, from, to), level });
    }
    pieces.forEach((piece, k) => {
      if (piece.ring.length < 3 || area(piece.ring) < 0.5) return;
      const grounds = piece.ring.map(heightAt);
      prisms.push({
        id: `${id}:${i}:${k}`,
        ring: piece.ring,
        bottom: grounds.map(g => Math.min(g, piece.level) - FOOTING_METERS),
        top: grounds.map(g => Math.max(g, piece.level)),
        sideColor: STONE_COLOR,
        capColor: yardColor
      });
      cuts.push({ ring: piece.ring, level: piece.level });
      levels.push(piece);
    });
  });
  return { prisms, cuts, levels };
}

/**
 * Plot walls on terraced yards (§5.7): each wall stands on its lower side's ground and rises the wall's height over
 * its higher side's yard, so between two terraces it is the retaining wall with a parapet.
 */
export function reliefPlotWalls(
  id: string,
  walls: VectorPolygon[],
  levels: { ring: Point[]; level: number }[],
  heightAt: (p: Point) => number,
  heightMeters: number,
  color: string
): ReliefPrism[] {
  const levelAt = (p: Point) => {
    let best = -Infinity;
    for (const piece of levels)
      if (
        pointInPolygon(p, piece.ring) ||
        piece.ring.some((q, i) => nearestOnPolyline(p, [q, piece.ring[(i + 1) % piece.ring.length]]).dist < 0.5)
      )
        best = Math.max(best, piece.level);
    return best;
  };
  return walls.flatMap((wall, i) => {
    if (wall.outer.length < 3) return [];
    const grounds = wall.outer.map(p => {
      const g = heightAt(p),
        level = levelAt(p);
      return { low: Math.min(g, Number.isFinite(level) ? level : g), high: Math.max(g, level) };
    });
    return [
      {
        id: `${id}:${i}`,
        ring: wall.outer,
        bottom: grounds.map(g => g.low - FOOTING_METERS),
        top: grounds.map(g => g.high + heightMeters),
        sideColor: color,
        capColor: color
      }
    ];
  });
}
