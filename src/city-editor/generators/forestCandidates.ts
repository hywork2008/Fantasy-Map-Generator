import { growthHash } from "../../utils/urbanMorphology";
import type { ForestRegion } from "../types/contracts/forest";
import type { Point } from "../types/primitives";
import { forestContains } from "./forestGeometry";
import { PlotIndex } from "./parcelGeometry";
export type ForestCandidateRegion = Pick<ForestRegion, "id" | "outer" | "holes" | "bounds">;

const MAX_EDGE_SAMPLES = 24000;
const MAX_GRID_SAMPLES = 64000;

export function forestTreeRandom(key: string): number {
  let n = Number.parseInt(growthHash(key), 16);
  n = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  n = Math.imul(n ^ (n >>> 15), 0x846ca68b);
  return ((n ^ (n >>> 16)) >>> 0) / 0x100000000;
}

export interface ForestTreeCandidate {
  point: Point;
  id: string;
  rank: number;
  edge: boolean;
}

/** Bounded, deterministic candidates in world metres. No viewport or quality enters their identity. */
export function forestTreeCandidates(
  plan: { regions: ForestCandidateRegion[] },
  seed: string,
  allTrees: boolean
): ForestTreeCandidate[] {
  const out: ForestTreeCandidate[] = [];
  const rings = plan.regions.flatMap(region =>
    [region.outer, ...region.holes].map(ring => {
      const lengths = ring.map((a, i) =>
        Math.hypot(ring[(i + 1) % ring.length][0] - a[0], ring[(i + 1) % ring.length][1] - a[1])
      );
      return { region, ring, lengths, length: lengths.reduce((sum, n) => sum + n, 0) };
    })
  );
  const total = rings.reduce((sum, r) => sum + r.length, 0);
  const spacing = Math.max(6, total / Math.max(1, MAX_EDGE_SAMPLES - rings.length));
  for (const { region, ring, lengths, length } of rings) {
    const count = Math.max(1, Math.floor(length / spacing));
    let segment = 0,
      before = 0;
    for (let i = 0; i < count && out.length < MAX_EDGE_SAMPLES; i++) {
      const distance = ((i + 0.5) * length) / count;
      while (segment + 1 < lengths.length && before + lengths[segment] < distance) before += lengths[segment++];
      const a = ring[segment],
        b = ring[(segment + 1) % ring.length],
        len = lengths[segment];
      if (len < 1e-6) continue;
      const t = (distance - before) / len;
      const x = a[0] + (b[0] - a[0]) * t,
        y = a[1] + (b[1] - a[1]) * t;
      const id = `${region.id}:edge:${x.toFixed(3)},${y.toFixed(3)}`;
      const inset = 1.4 + forestTreeRandom(`${seed}:${id}:inset`) * 1.4;
      const point: Point = [x - ((b[1] - a[1]) / len) * inset, y + ((b[0] - a[0]) / len) * inset];
      if (forestContains(region, point))
        out.push({ point, id, rank: forestTreeRandom(`${seed}:${id}:rank`), edge: true });
    }
  }
  if (allTrees && plan.regions.length) {
    const minX = Math.min(...plan.regions.map(r => r.bounds[0])),
      minY = Math.min(...plan.regions.map(r => r.bounds[1]));
    const maxX = Math.max(...plan.regions.map(r => r.bounds[2])),
      maxY = Math.max(...plan.regions.map(r => r.bounds[3]));
    let step = 8;
    while ((Math.ceil((maxX - minX) / step) + 2) * (Math.ceil((maxY - minY) / step) + 2) > MAX_GRID_SAMPLES) step *= 2;
    const index = new PlotIndex<ForestCandidateRegion>(128);
    for (const region of plan.regions) index.add(region, region.bounds);
    for (let gx = Math.floor(minX / step); gx <= Math.floor(maxX / step); gx++)
      for (let gy = Math.floor(minY / step); gy <= Math.floor(maxY / step); gy++) {
        const id = `grid:${gx},${gy}:${step}`;
        const point: Point = [
          (gx + 0.2 + forestTreeRandom(`${seed}:${id}:x`) * 0.6) * step,
          (gy + 0.2 + forestTreeRandom(`${seed}:${id}:y`) * 0.6) * step
        ];
        if (index.query([point[0], point[1], point[0], point[1]]).some(region => forestContains(region, point)))
          out.push({ point, id, rank: forestTreeRandom(`${seed}:${id}:rank`), edge: false });
      }
  }
  return out.sort((a, b) => Number(b.edge) - Number(a.edge) || a.rank - b.rank || a.id.localeCompare(b.id));
}
