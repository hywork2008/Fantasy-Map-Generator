import { ISLET_MAX_LAND_CELLS } from "../utils/mapScope";

interface IsletGrid {
  points: readonly (readonly [number, number])[];
  cells: { c: readonly (readonly number[])[]; b: ArrayLike<number> };
}

/**
 * Islet-scope heightmap (docs/plan/map-scope-small-worlds.md §3): exactly one island of
 * `landCells` grid cells near the canvas center, surrounded by sea that deepens away from it.
 * `landCells` 0 draws 1–4. The canvas edge is always sea so the island never touches the border.
 */
export function buildIsletHeights(
  grid: IsletGrid,
  graphWidth: number,
  graphHeight: number,
  landCells: number,
  random: () => number
): Uint8Array {
  const count = grid.points.length;
  const heights = new Uint8Array(count);
  if (!count) return heights;

  const wanted = landCells > 0 ? Math.min(Math.round(landCells), ISLET_MAX_LAND_CELLS) : 1 + Math.floor(random() * 4);

  let center = 0;
  let best = Infinity;
  for (let i = 0; i < count; i++) {
    const [x, y] = grid.points[i];
    const d2 = (x - graphWidth / 2) ** 2 + (y - graphHeight / 2) ** 2;
    if (d2 < best) {
      best = d2;
      center = i;
    }
  }

  const land = [center];
  const isLand = new Set(land);
  while (land.length < wanted) {
    const frontier = [
      ...new Set(land.flatMap(i => grid.cells.c[i]).filter(n => !isLand.has(n) && !grid.cells.b[n]))
    ].sort((a, b) => a - b);
    if (!frontier.length) break;
    const next = frontier[Math.floor(random() * frontier.length)];
    land.push(next);
    isLand.add(next);
  }

  // Distance (in cell steps) from the island drives a coastal shelf falling into deeper sea.
  const distance = new Int32Array(count).fill(-1);
  const queue = [...land];
  for (const i of land) distance[i] = 0;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    for (const n of grid.cells.c[i]) {
      if (distance[n] !== -1) continue;
      distance[n] = distance[i] + 1;
      queue.push(n);
    }
  }

  for (let i = 0; i < count; i++) {
    const d = distance[i] < 0 ? 5 : distance[i];
    heights[i] = Math.max(3, 18 - 4 * (d - 1));
  }
  heights[center] = 30 + Math.floor(random() * 16);
  for (const i of land.slice(1)) heights[i] = 21 + Math.floor(random() * 8);
  return heights;
}
