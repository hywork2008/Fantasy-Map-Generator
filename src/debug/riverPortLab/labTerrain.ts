/**
 * River-Port Lab terrain shaping (docs/plan/river-port-lab.md §4.1), applied to the grid heights
 * right after the heightmap and before features are marked, only while the lab is active.
 *
 * - seaBorder: the two outermost rings of grid cells become sea, so no river drains off the map
 *   (an off-map drain has no water feature and can never make a river port).
 * - landShare: a 500-cell province map is often 15–40% land, a coastal strip whose rivers run a
 *   few cells straight to the sea and almost never join; measured, confluence supply tracks land
 *   area, while tilting or carving valleys into the strip did not raise it. Too little land is
 *   topped up by turning the highest shallows into a low coastal plain (heights 20–25, order
 *   kept), which leaves the existing land, its climate and habitability untouched.
 * - lakes: inland depressions far from the sea, each drained by a spillway valley so it stays
 *   open and gets an outlet river.
 */

export interface LabTerrainGrid {
  points: ArrayLike<readonly [number, number]>;
  cells: { c: ArrayLike<ArrayLike<number>>; b: ArrayLike<number> };
}

export interface LabTerrainOptions {
  seaBorder: boolean;
  /** Minimum land share of the non-border cells, 0 = keep the heightmap's. */
  landShare: number;
  /** Inland lake depressions to carve. */
  lakes: number;
}

export interface LabTerrainReport {
  borderCells: number;
  /** Sea cells turned into coastal plain. */
  raisedCells: number;
  lakeCells: number[];
}

const SEA_BORDER_HEIGHT = 5;
const LAKE_HEIGHT = 15;
/** Height range of the coastal plain raised from the shallows. */
const PLAIN_TOP = 25;
/** Spillway wall rise per cell away from the floor, and how far the walls reach. */
const VALLEY_WALL = 5;
const VALLEY_RADIUS = 4;
/**
 * Highest spillway cell next to a lake. Lakes.detectCloseLakes closes a lake that cannot reach the
 * sea below its height + lakeElevationLimit (default 20), and a closed lake gets no outlet river.
 */
const SPILLWAY_TOP = LAKE_HEIGHT + 19;
/** A lake depression keeps at least this many land cells between it and the sea. */
const LAKE_MIN_SEA_DISTANCE = 3;

const isLand = (h: number) => h >= 20;

/** Breadth-first cell distance from every `sources` cell, through `passable` cells. */
function distances(grid: LabTerrainGrid, sources: number[], passable: (cell: number) => boolean): Int32Array {
  const dist = new Int32Array(grid.points.length).fill(-1);
  let queue = sources;
  for (const cell of queue) dist[cell] = 0;
  while (queue.length) {
    const next: number[] = [];
    for (const cell of queue) {
      for (const n of Array.from(grid.cells.c[cell])) {
        if (dist[n] !== -1 || !passable(n)) continue;
        dist[n] = dist[cell] + 1;
        next.push(n);
      }
    }
    queue = next;
  }
  return dist;
}

export function shapeLabTerrain(
  grid: LabTerrainGrid,
  heights: Uint8Array,
  options: LabTerrainOptions
): LabTerrainReport {
  const count = heights.length;
  const report: LabTerrainReport = { borderCells: 0, raisedCells: 0, lakeCells: [] };

  const ring = new Set<number>();
  if (options.seaBorder) {
    // Grid border cells and their neighbours: the packed graph flags land somewhat inside the grid
    // edge as border too, and Rivers pours a river on such a cell off the map.
    for (let i = 0; i < count; i++) {
      if (!grid.cells.b[i]) continue;
      ring.add(i);
      for (const n of Array.from(grid.cells.c[i])) ring.add(n);
    }
    for (const i of ring) heights[i] = Math.min(heights[i], SEA_BORDER_HEIGHT);
    report.borderCells = ring.size;
  }

  if (options.landShare > 0) {
    // Raise the highest shallows (above `floor`) into a 20..PLAIN_TOP plain, keeping their order.
    const interior = [];
    for (let i = 0; i < count; i++) if (!ring.has(i)) interior.push(i);
    const sorted = interior.map(i => heights[i]).sort((x, y) => y - x);
    const floor = sorted[Math.min(sorted.length - 1, Math.ceil(options.landShare * sorted.length) - 1)] ?? 20;
    if (floor < 20) {
      for (const i of interior) {
        if (isLand(heights[i]) || heights[i] < floor) continue;
        heights[i] = 20 + Math.round(((heights[i] - floor) * (PLAIN_TOP - 20)) / Math.max(1, 19 - floor));
        report.raisedCells++;
      }
    }
  }

  const land = [];
  for (let i = 0; i < count; i++) if (isLand(heights[i])) land.push(i);
  if (!land.length) return report;

  const sea = [];
  for (let i = 0; i < count; i++) if (!isLand(heights[i])) sea.push(i);
  const fromSea = distances(grid, sea, () => true);

  if (options.lakes > 0) {
    // Upstream first: the farthest-from-sea cells feed the longest outlet rivers.
    const inland = land
      .filter(cell => fromSea[cell] >= LAKE_MIN_SEA_DISTANCE)
      .sort((a, b) => fromSea[b] - fromSea[a] || heights[b] - heights[a]);
    const blocked = new Set<number>();
    for (const cell of inland) {
      if (report.lakeCells.length >= options.lakes) break;
      if (blocked.has(cell)) continue;
      heights[cell] = LAKE_HEIGHT;
      report.lakeCells.push(cell);
      const spillway = descend(grid, cell, fromSea).slice(1);
      carveValley(grid, heights, spillway, SPILLWAY_TOP);
      // Keep lakes apart: a ring of two cells around each is off limits.
      for (const n of Array.from(grid.cells.c[cell])) {
        blocked.add(n);
        for (const m of Array.from(grid.cells.c[n])) blocked.add(m);
      }
    }
  }

  return report;
}

/** Steepest descent of `field` from `start` to its zero cell, over land. */
function descend(grid: LabTerrainGrid, start: number, field: Int32Array): number[] {
  const path = [start];
  for (let cell = start; field[cell] > 0; ) {
    const next = Array.from(grid.cells.c[cell]).reduce((best, n) =>
      field[n] >= 0 && (field[best] < 0 || field[n] < field[best]) ? n : best
    );
    if (field[next] < 0 || field[next] >= field[cell]) break;
    path.push(next);
    cell = next;
  }
  return path;
}

/**
 * Caps the floor along `path` (upstream → coast) to fall from `top` to just above sea level, and
 * the land within VALLEY_RADIUS cells to rise from the nearest floor cell by VALLEY_WALL per cell,
 * so the lake drains down a continuous valley.
 */
function carveValley(grid: LabTerrainGrid, heights: Uint8Array, path: number[], top: number) {
  if (!path.length) return;
  const floor = new Map<number, number>();
  path.forEach((cell, index) => {
    const remaining = path.length - index; // 1 at the shore
    floor.set(cell, 20 + Math.round(((top - 20) * remaining) / path.length));
  });
  // Multi-source BFS over land: each wall cell takes the floor height of its nearest floor cell.
  const base = new Map(floor);
  let queue = [...path];
  for (let d = 0; queue.length && d <= VALLEY_RADIUS; d++) {
    const next: number[] = [];
    for (const cell of queue) {
      const cap = base.get(cell)! + VALLEY_WALL * d;
      heights[cell] = Math.max(20, Math.min(heights[cell], cap));
      for (const n of Array.from(grid.cells.c[cell])) {
        if (base.has(n) || !isLand(heights[n])) continue;
        base.set(n, base.get(cell)!);
        next.push(n);
      }
    }
    queue = next;
  }
}
