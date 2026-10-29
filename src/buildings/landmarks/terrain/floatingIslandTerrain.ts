import Alea from "alea";
import { HeightmapConstants } from "../../../data/constants";

export type IslandSurface = "terrain" | "flat";
export interface IslandTerrain {
  points: [number, number][];
  triangles: number[];
  boundary: number[];
  depths: number[];
  heights: number[];
  peakIndices: number[];
  seamHeight: number;
}

/**
 * FMG HeightmapModule.floodFillDecay adapted to a local triangle graph. It uses
 * the same power falloff, Uint8 quantization and 0.9–1.1 cell jitter. A local
 * seeded PRNG leaves FMG's world-generation random stream untouched. Rim cells
 * stop propagation so both surfaces can share a level joining boundary.
 */
function hill(
  neighbors: number[][],
  boundary: Set<number>,
  seed: number,
  value: number,
  power: number,
  random: () => number
): Uint8Array {
  const change = new Uint8Array(neighbors.length);
  change[seed] = value;
  const queue = [seed];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const q = queue[cursor];
    for (const c of neighbors[q]) {
      if (boundary.has(c) || change[c]) continue;
      change[c] = change[q] ** power * (random() * HeightmapConstants.JITTER_RANGE + HeightmapConstants.JITTER_MIN);
      if (change[c] > 1) queue.push(c);
    }
  }
  return change;
}

export function generateIslandTerrain(seed: string, surface: IslandSurface): IslandTerrain {
  const footprintRandom = Alea(`${seed}:footprint`);
  const lowerRandom = Alea(`${seed}:lower`);
  const upperRandom = Alea(`${seed}:upper`);
  const rings = 9;
  const sectors = 48;
  const radiusX = 95 + footprintRandom() * 15;
  const radiusZ = 78 + footprintRandom() * 25;
  const phases = Array.from({ length: 3 }, () => footprintRandom() * Math.PI * 2);
  const points: [number, number][] = [[0, 0]];
  const boundary: number[] = [];
  for (let ring = 1; ring <= rings; ring++) {
    for (let sector = 0; sector < sectors; sector++) {
      const angle = ((sector + (ring === rings ? 0 : (footprintRandom() - 0.5) * 0.45)) * Math.PI * 2) / sectors;
      const outline =
        1 +
        0.09 * Math.sin(angle * 3 + phases[0]) +
        0.05 * Math.sin(angle * 5 + phases[1]) +
        0.025 * Math.sin(angle * 7 + phases[2]);
      const radial = (ring / rings) * outline * (ring === rings ? 1 : 0.97 + footprintRandom() * 0.06);
      if (ring === rings) boundary.push(points.length);
      points.push([Math.cos(angle) * radiusX * radial, Math.sin(angle) * radiusZ * radial]);
    }
  }
  // Keep every concave shoreline edge: an unconstrained convex-hull
  // triangulation would bridge inlets and leave holes along the rock rim.
  const triangles: number[] = [];
  for (let sector = 0; sector < sectors; sector++) {
    const next = (sector + 1) % sectors;
    triangles.push(0, 1 + sector, 1 + next);
    for (let ring = 1; ring < rings; ring++) {
      const a = 1 + (ring - 1) * sectors + sector;
      const b = 1 + (ring - 1) * sectors + next;
      const c = 1 + ring * sectors + sector;
      const d = 1 + ring * sectors + next;
      triangles.push(a, c, d, a, d, b);
    }
  }
  const neighbors = points.map(() => new Set<number>());
  for (let i = 0; i < triangles.length; i += 3) {
    const face = triangles.slice(i, i + 3);
    for (const a of face) for (const b of face) if (a !== b) neighbors[a].add(b);
  }
  const graph = neighbors.map(cells => [...cells]);
  const rim = new Set(boundary);
  const peakCount = lowerRandom() < 0.5 ? 1 : 2;
  const angle = lowerRandom() * Math.PI * 2;
  const peakIndices: number[] = [];
  const lower = points.map(() => 0);
  for (let peak = 0; peak < peakCount; peak++) {
    const bearing = angle + peak * Math.PI;
    const radius = peakCount === 1 ? 0.12 : 0.36;
    const x = Math.cos(bearing) * radiusX * radius;
    const z = Math.sin(bearing) * radiusZ * radius;
    let nearest = 0;
    for (let i = 1; i < points.length; i++) {
      if (rim.has(i)) continue;
      if (Math.hypot(points[i][0] - x, points[i][1] - z) < Math.hypot(points[nearest][0] - x, points[nearest][1] - z))
        nearest = i;
    }
    peakIndices.push(nearest);
    const field = hill(graph, rim, nearest, 100, 0.95 + lowerRandom() * 0.01, lowerRandom);
    for (let i = 0; i < lower.length; i++) lower[i] = Math.max(lower[i], field[i]);
  }
  const depth = 110 + lowerRandom() * 60;
  const depths = lower.map(value => (value / 100) * depth);
  const upper = points.map(() => 0);
  if (surface === "terrain") {
    const hills = 2 + Math.floor(upperRandom() * 3);
    for (let n = 0; n < hills; n++) {
      const start = 1 + Math.floor(upperRandom() * sectors * 6);
      const field = hill(graph, rim, start, 65 + Math.floor(upperRandom() * 30), 0.85, upperRandom);
      for (let i = 0; i < upper.length; i++) upper[i] += field[i];
    }
    // FMG-like smoothing retains the rim datum while softening the upper hills.
    const smooth = upper.map((value, i) =>
      rim.has(i) ? 0 : (value + graph[i].reduce((sum, j) => sum + upper[j], 0)) / (graph[i].length + 1)
    );
    const maximum = Math.max(...smooth);
    const relief = 18 + upperRandom() * 25;
    for (let i = 0; i < upper.length; i++) upper[i] = (smooth[i] / maximum) * relief;
  }
  return { points, triangles, boundary, depths, heights: upper, peakIndices, seamHeight: depth + 8 };
}
