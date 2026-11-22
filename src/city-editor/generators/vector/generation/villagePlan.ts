import { growthRandom } from "../../../../utils/urbanMorphology";
import type { BurgagePlot, RoadsideArm, RoadsideVillagePlan } from "../../../types/contracts/burgage";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorBlock, VectorPolygon } from "../../../types/vector/generation";
import { tidyRing } from "../../burgage/frame";
import { planRoadsideBlocks } from "../../burgage/roadsideBlocks";
import { convexHull, polygonCentroid } from "../../geom";
import { makeRng } from "../../prng";
import { featureReservations } from "../environmentState";
import { regionArea } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { pathSurface, simpleContour } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import type { PerimeterDistrictResult } from "./perimeter";
import { perimeterHouseDwellings } from "./urbanCapacity";

/**
 * The village of `burgage-village` (docs/plan/ce-meshless-roadside-burgage-village.md V2): no round site is cut into
 * street blocks; the tofts are laid along the roads out of the centre (`planRoadsideBlocks`) and handed to the CE
 * perimeter plan's later steps as districts, one per roadside block with its lanes and the second-row block behind.
 */

/** Main roads: the approaches and the roads the skeleton laid to the centre, not the civic centre's lanes. */
const MAIN_ROAD_MIN_WIDTH_METERS = 4;
/** Road ends this close are one junction. */
const JUNCTION_METERS = 0.5;

/**
 * The roads out of the centre: from the junction nearest the site's centre along the shortest run of main roads to
 * each road end that leads nowhere else (an approach at the map's edge).
 */
export function villageArms(doc: VectorCityDocument): RoadsideArm[] {
  const centre = doc.site?.center ?? [0, 0];
  const roads = Object.values(doc.paths)
    .filter(p => p.role === "road" && p.width.leftMeters + p.width.rightMeters >= MAIN_ROAD_MIN_WIDTH_METERS)
    .map(p => ({ id: p.id, points: samplePath(p).map(s => s.point) }))
    .filter(r => r.points.length >= 2);
  const key = (p: Point) => `${Math.round(p[0] / JUNCTION_METERS)},${Math.round(p[1] / JUNCTION_METERS)}`;
  const edges = new Map<string, { road: (typeof roads)[number]; reversed: boolean; to: string; length: number }[]>();
  for (const road of roads) {
    const a = key(road.points[0]),
      b = key(road.points.at(-1)!),
      length = road.points
        .slice(1)
        .reduce((n, p, i) => n + Math.hypot(p[0] - road.points[i][0], p[1] - road.points[i][1]), 0);
    if (a === b) continue;
    edges.set(a, [...(edges.get(a) ?? []), { road, reversed: false, to: b, length }]);
    edges.set(b, [...(edges.get(b) ?? []), { road, reversed: true, to: a, length }]);
  }
  const nodes = [...edges.keys()];
  if (!nodes.length) return [];
  const position = (k: string): Point => {
    const [x, y] = k.split(",").map(Number);
    return [x * JUNCTION_METERS, y * JUNCTION_METERS];
  };
  const start = nodes.reduce((best, k) =>
    Math.hypot(...(position(k).map((v, i) => v - centre[i]) as [number, number])) <
    Math.hypot(...(position(best).map((v, i) => v - centre[i]) as [number, number]))
      ? k
      : best
  );
  // Dijkstra over the junctions; the graph is a few dozen roads.
  const distance = new Map([[start, 0]]),
    via = new Map<string, { from: string; road: (typeof roads)[number]; reversed: boolean }>(),
    done = new Set<string>();
  for (;;) {
    let current: string | undefined;
    for (const [k, d] of distance)
      if (!done.has(k) && (current === undefined || d < distance.get(current)!)) current = k;
    if (current === undefined) break;
    done.add(current);
    for (const e of edges.get(current) ?? []) {
      const d = distance.get(current)! + e.length;
      if (d < (distance.get(e.to) ?? Infinity)) {
        distance.set(e.to, d);
        via.set(e.to, { from: current, road: e.road, reversed: e.reversed });
      }
    }
  }
  const arms: RoadsideArm[] = [];
  for (const leaf of nodes.filter(k => k !== start && edges.get(k)!.length === 1 && distance.has(k)).sort()) {
    const runs: Point[][] = [];
    for (let at = leaf; at !== start; ) {
      const step = via.get(at)!;
      // Each road as it runs from the centre's side to the leaf's; the runs are collected leaf first.
      runs.push(step.reversed ? [...step.road.points].reverse() : step.road.points);
      at = step.from;
    }
    const points: Point[] = [];
    for (const run of runs.reverse())
      for (const p of run) {
        const last = points.at(-1);
        if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 1e-6) points.push(p);
      }
    if (points.length >= 2) arms.push({ id: `arm:${via.get(leaf)!.road.id}`, points });
  }
  return arms;
}

/** House on a toft (plan §4.2, V-R9): a wide toft takes a longhouse along its front, eaves to the road, beside a
 * passage to the yard; a split plot takes a house across its frontage, as a town burgage does. */
const LONGHOUSE_MIN_FRONTAGE_METERS = 12;
const LONGHOUSE_LENGTH_METERS: readonly [number, number] = [10, 16];
const LONGHOUSE_DEPTH_METERS: readonly [number, number] = [5.5, 7];
const PASSAGE_METERS = 3;
const SIDE_GAP_METERS = 1.5;
const NARROW_HOUSE_DEPTH_METERS: readonly [number, number] = [8, 12];

const mean = ([a, b]: readonly [number, number]) => (a + b) / 2;

/** Expected footprint of a plot's house by its frontage, for the plan's dwelling count. */
export function villageHouseArea(frontage: number): number {
  return frontage >= LONGHOUSE_MIN_FRONTAGE_METERS
    ? Math.min(frontage - PASSAGE_METERS, mean(LONGHOUSE_LENGTH_METERS)) * mean(LONGHOUSE_DEPTH_METERS)
    : frontage * mean(NARROW_HOUSE_DEPTH_METERS);
}

function villageHouse(plot: BurgagePlot, seed: string): Point[] {
  const rng = makeRng(`${seed}:village-house:${plot.id}`),
    [a, b] = plot.front,
    f = plot.frontageMeters,
    u: Point = [(b[0] - a[0]) / f, (b[1] - a[1]) / f],
    c = polygonCentroid(plot.ring);
  let v: Point = [-u[1], u[0]];
  if ((c[0] - a[0]) * v[0] + (c[1] - a[1]) * v[1] < 0) v = [-v[0], -v[1]];
  const at = (s: number, t: number): Point => [a[0] + u[0] * s + v[0] * t, a[1] + u[1] * s + v[1] * t];
  let s0 = 0,
    s1 = f,
    depth: number;
  if (f >= LONGHOUSE_MIN_FRONTAGE_METERS) {
    const length = Math.min(f - PASSAGE_METERS, rng.range(...LONGHOUSE_LENGTH_METERS));
    depth = rng.range(...LONGHOUSE_DEPTH_METERS);
    // The passage to the yard on one side, a narrow gap on the other.
    s0 = rng() < 0.5 ? SIDE_GAP_METERS : f - SIDE_GAP_METERS - length;
    s0 = Math.max(0, Math.min(f - length, s0));
    s1 = s0 + length;
  } else depth = Math.min(rng.range(...NARROW_HOUSE_DEPTH_METERS), plot.depthMeters / 2);
  return [at(s0, 0), at(s1, 0), at(s1, depth), at(s0, depth)];
}

export interface VillagePerimeter {
  districts: PerimeterDistrictResult[];
  plan: RoadsideVillagePlan;
  /** The village's ground (its blocks and lanes' strips), the town land round which the fields lie. */
  land: VectorPolygon[];
}

/** The roadside village for `required` dwellings as CE perimeter districts. */
export function planVillagePerimeter(
  doc: VectorCityDocument,
  required: number,
  options: {
    storeys: number;
    lotOccupancy: number;
    /** Ground the plan keeps off besides the document's own (the tanners' row). */
    protectedRegions?: VectorPolygon[];
  }
): VillagePerimeter {
  const arms = villageArms(doc),
    obstacles: Point[][] = [
      ...featureReservations(doc).map(r => r.outer),
      ...Object.values(doc.regions)
        .filter(r => r.kind !== "district")
        .map(r => r.outer),
      ...Object.values(doc.placements).map(p => p.site.outer),
      ...allVectorWater(doc).map(w => w.outer),
      // The civic centre's lanes and any road the arms do not follow.
      ...Object.values(doc.paths)
        .filter(p => p.role === "road" && p.width.leftMeters + p.width.rightMeters < MAIN_ROAD_MIN_WIDTH_METERS)
        .map(p => pathSurface(p).outer),
      ...(options.protectedRegions ?? []).map(r => r.outer)
    ];
  // Houses drawn at or above the occupancy stay unbuilt (CE lot occupancy), so the plan lays that many more.
  const occupancy = Math.min(1, Math.max(0.1, options.lotOccupancy)),
    need = Math.ceil((required * VILLAGE_NEED_MARGIN) / occupancy);
  const plan = planRoadsideBlocks({
    seed: doc.recipe.seed,
    arms,
    need,
    dwellingsOf: frontage => perimeterHouseDwellings(villageHouseArea(frontage), options.storeys),
    obstacles,
    halfExtentMeters: doc.frame.extentMeters / 2 - FRAME_MARGIN_METERS
  });
  const parcel = (ring: Point[], id: string): VectorBlock => {
    const outer = ring.map((p): Point => [Math.round(p[0] * 100) / 100 || 0, Math.round(p[1] * 100) / 100 || 0]);
    return { id, outer, holes: [], areaMeters2: regionArea({ outer, holes: [] }), frontage: [], reachable: true };
  };
  const districts: PerimeterDistrictResult[] = [];
  for (const block of plan.blocks.filter(b => b.tier === 1)) {
    const behind = plan.blocks.find(b => b.tier === 2 && b.id === block.id.replace(":t1:", ":t2:")),
      lanes = plan.lanes.filter(l => l.id === `${block.id}:cross` || l.id === `${block.id}:back`),
      id = `village:${block.id}`;
    // The district takes the block, its lanes' strips and the block behind: a hull of their corners.
    const outline = villageOutline([
      ...block.ring,
      ...(behind?.ring ?? []),
      ...lanes.flatMap(l => {
        const [p, q] = [l.points[0], l.points.at(-1)!],
          len = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1,
          n: Point = [((q[1] - p[1]) / len) * (l.widthMeters / 2), ((p[0] - q[0]) / len) * (l.widthMeters / 2)];
        return [p, q].flatMap((x): Point[] => [
          [x[0] + n[0], x[1] + n[1]],
          [x[0] - n[0], x[1] - n[1]]
        ]);
      })
    ]);
    const cells = [block, ...(behind ? [behind] : [])].map(b => ({
      cell: {
        id: b.id,
        districtId: id,
        ring: b.ring,
        lanes: [],
        attachments: [],
        mouths: [],
        plots: b.plots.map(p => ({ ring: p.ring, front: p.front, kind: p.kind }))
      },
      blocks: b.plots
        .map((p, i) => parcel(p.ring, `${b.id}:parcel:${i}`))
        .filter(x => simpleContour(x.outer, true) && x.areaMeters2 > 1e-6),
      houses: b.plots.map(p => {
        const polygon = villageHouse(p, doc.recipe.seed);
        return { cellId: b.id, districtId: id, polygon, draw: growthRandom(JSON.stringify(polygon)) };
      })
    }));
    districts.push({
      district: {
        id,
        outline,
        boundaries: outline.map(() => ({ feature: false, barrier: false, setback: 0 })),
        streets: lanes.map(l => ({ points: l.points, widthMeters: l.widthMeters })),
        mouths: [],
        cells: cells.map(c => c.cell)
      },
      blocks: cells.flatMap(c => c.blocks),
      houses: cells.flatMap(c => c.houses)
    });
  }
  return { districts, plan, land: districts.map(d => ({ outer: d.district.outline, holes: [] })) };
}

/** A convex outline round `points` that keeps its shape at the fabric's centimetre: points on a line or a few
 * millimetres apart would round onto each other. */
function villageOutline(points: Point[]): Point[] {
  const hull = convexHull(points.map((p): Point => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]));
  return tidyRing(
    hull.filter((p, i) => {
      const q = hull[(i + hull.length - 1) % hull.length];
      return Math.hypot(p[0] - q[0], p[1] - q[1]) >= 0.05;
    })
  );
}

/** Houses vary from the plan's mean footprint and storeys: a little more is laid than the estimate needs. */
const VILLAGE_NEED_MARGIN = 1.08;
/** Blocks keep this far inside the map's edge. */
const FRAME_MARGIN_METERS = 10;

/** Half the map a village of `dwellings` needs (plan §5.1): its roads' reach, the deepest blocks behind it, and the
 * fields' margin. An estimate on three approaches; the plan reports what the map cannot take. */
export function villageHalfExtentMeters(dwellings: number): number {
  return Math.min(750, 120 + dwellings * 1.6) + 150 + 60;
}
