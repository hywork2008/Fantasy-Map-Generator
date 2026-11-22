import { growthRandom } from "../../../../utils/urbanMorphology";
import type { BurgagePlot, RoadsideArm, RoadsideVillagePlan } from "../../../types/contracts/burgage";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import type { VectorBlock, VectorPolygon } from "../../../types/vector/generation";
import type { VectorPark } from "../../../types/vector/urban";
import { tidyRing } from "../../burgage/frame";
import { planRoadsideBlocks } from "../../burgage/roadsideBlocks";
import { convexHull, nearestOnPolyline, polygonCentroid } from "../../geom";
import { makeRng } from "../../prng";
import { featureReservations } from "../environmentState";
import { regionArea } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { pathSurface, simpleContour } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import type { PerimeterDistrictResult } from "./perimeter";

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

/**
 * The buildings of a toft (plan §14.2): single storey, long side to the road (V-R15), a little back from it. A toft
 * of full width takes a longhouse, home and byre under one roof (Hangleton 12 × 6 m, Hound Tor up to 19 m), or a
 * cottage with a barn standing apart at right angles to it (Herefordshire). A split or second-row plot takes a
 * cottage of one or two rooms (Herefordshire 5 × 3.5 m, Hangleton under 9 m).
 */
const TOFT_MIN_FRONTAGE_METERS = 15;
const LONGHOUSE_SHARE = 0.65;
const LONGHOUSE_LENGTH_METERS: readonly [number, number] = [12, 19];
const LONGHOUSE_WIDTH_METERS: readonly [number, number] = [5, 6];
const COTTAGE_LENGTH_METERS: readonly [number, number] = [5, 9];
const COTTAGE_WIDTH_METERS: readonly [number, number] = [3.5, 5];
/** No source gives a barn's size: a game adjustment between the cottage and the longhouse. */
const BARN_LENGTH_METERS: readonly [number, number] = [6, 10];
const BARN_WIDTH_METERS: readonly [number, number] = [4, 5];
/** Back from the road, and the gap the buildings keep to the toft's sides (the passage to the yard is wider). */
const SETBACK_METERS: readonly [number, number] = [0.5, 2.5];
const SIDE_GAP_METERS = 0.8;
const PASSAGE_METERS = 3;

export interface VillageBuilding {
  polygon: Point[];
  outbuilding?: true;
}

export function villageFarmstead(plot: BurgagePlot, seed: string): VillageBuilding[] {
  const rng = makeRng(`${seed}:village-farmstead:${plot.id}`),
    [a, b] = plot.front,
    f = plot.frontageMeters,
    u: Point = [(b[0] - a[0]) / f, (b[1] - a[1]) / f],
    c = polygonCentroid(plot.ring);
  let v: Point = [-u[1], u[0]];
  if ((c[0] - a[0]) * v[0] + (c[1] - a[1]) * v[1] < 0) v = [-v[0], -v[1]];
  const at = (s: number, t: number): Point => [a[0] + u[0] * s + v[0] * t, a[1] + u[1] * s + v[1] * t],
    box = (s0: number, s1: number, t0: number, t1: number) => [at(s0, t0), at(s1, t0), at(s1, t1), at(s0, t1)],
    setback = rng.range(...SETBACK_METERS),
    left = rng() < 0.5;
  if (f < TOFT_MIN_FRONTAGE_METERS) {
    const length = Math.max(3, Math.min(f - 2 * SIDE_GAP_METERS, rng.range(...COTTAGE_LENGTH_METERS))),
      width = Math.min(rng.range(...COTTAGE_WIDTH_METERS), plot.depthMeters / 3),
      s0 = SIDE_GAP_METERS + rng() * Math.max(0, f - 2 * SIDE_GAP_METERS - length);
    return [{ polygon: box(s0, s0 + length, setback, setback + width) }];
  }
  if (rng() < LONGHOUSE_SHARE) {
    const length = Math.min(f - PASSAGE_METERS - SIDE_GAP_METERS, rng.range(...LONGHOUSE_LENGTH_METERS)),
      width = rng.range(...LONGHOUSE_WIDTH_METERS),
      // The passage to the yard on one side.
      s0 = left ? SIDE_GAP_METERS : f - SIDE_GAP_METERS - length;
    return [{ polygon: box(s0, s0 + length, setback, setback + width) }];
  }
  const length = rng.range(...COTTAGE_LENGTH_METERS),
    width = rng.range(...COTTAGE_WIDTH_METERS),
    barnLength = Math.min(rng.range(...BARN_LENGTH_METERS), plot.depthMeters / 2),
    barnWidth = rng.range(...BARN_WIDTH_METERS),
    s0 = left ? SIDE_GAP_METERS : f - SIDE_GAP_METERS - length,
    // The barn on the other side, end on to the road, its front behind the cottage's.
    b0 = left ? f - SIDE_GAP_METERS - barnWidth : SIDE_GAP_METERS,
    t0 = setback + rng.range(1, 4);
  return [
    { polygon: box(s0, s0 + length, setback, setback + width) },
    { polygon: box(b0, b0 + barnWidth, t0, t0 + barnLength), outbuilding: true }
  ];
}

export interface VillagePerimeter {
  districts: PerimeterDistrictResult[];
  plan: RoadsideVillagePlan;
  /** The village's ground (its blocks and lanes' strips), the town land round which the fields lie. */
  land: VectorPolygon[];
  /** How far the tofts reach from the centre: the farthest corner of a laid block. */
  reach: number;
  /** The street green's lawns, drawn as a park's (plan V5); absent when the village has none. */
  green?: VectorPark;
}

/** The roadside village for `required` dwellings as CE perimeter districts. */
export function planVillagePerimeter(
  doc: VectorCityDocument,
  required: number,
  options: {
    lotOccupancy: number;
    /** Tofts the village's workshops will take besides its houses (plan V5). */
    facilityPlots?: number;
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
    need = Math.ceil((required * VILLAGE_NEED_MARGIN) / occupancy) + (options.facilityPlots ?? 0);
  const green = villageGreen(doc.recipe.seed, arms);
  const plan = planRoadsideBlocks({
    ...(green ? { green } : {}),
    seed: doc.recipe.seed,
    arms,
    need,
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
      lanes = plan.lanes.filter(l => [":cross", ":back", ":front"].some(k => l.id === `${block.id}${k}`)),
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
      // A toft's buildings share their house's draw, so an outbuilding stands where its house does.
      houses: b.plots.flatMap(p => {
        const buildings = villageFarmstead(p, doc.recipe.seed),
          draw = growthRandom(JSON.stringify(buildings[0].polygon));
        return buildings.map(x => ({
          cellId: b.id,
          districtId: id,
          polygon: x.polygon,
          draw,
          farmstead: p.id,
          ...(x.outbuilding ? { outbuilding: true as const } : {})
        }));
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
  const centre = doc.site?.center ?? [0, 0];
  const lawns = plan.greens
    .map(ring => ring.map((p): [number, number] => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]))
    .filter(ring => simpleContour(ring, true));
  return {
    ...(lawns.length ? { green: { id: "village-green", lawns, paths: [], tufts: [], trees: [] } } : {}),
    districts,
    plan,
    land: [
      ...districts.map(d => ({ outer: d.district.outline, holes: [] })),
      // The blocks themselves as laid, widened a hair: the outlines are rounded to the centimetre and may shave a
      // plot's edge, and a plot rounded to the centimetre must stay within the town's land.
      ...plan.blocks.map(b => ({
        outer: grown(b.ring, LAND_MARGIN_METERS),
        holes: []
      })),
      // The street before each roadside block, out to the road's centre line: a workshop's door and its approach
      // stand there.
      ...plan.blocks
        .filter(b => b.tier === 1)
        .flatMap(b => {
          const road = arms.find(a => a.id === b.armId)?.points as Point[] | undefined;
          if (!road) return [];
          const [f0, f1] = b.front,
            r0 = nearestOnPolyline(f0, road).point,
            r1 = nearestOnPolyline(f1, road).point,
            outer = tidyRing([f0, f1, r1, r0]);
          return outer.length >= 3 && simpleContour(outer, true) ? [{ outer, holes: [] }] : [];
        })
    ],
    reach: Math.max(0, ...plan.blocks.flatMap(b => b.ring.map(p => Math.hypot(p[0] - centre[0], p[1] - centre[1]))))
  };
}

/** Share of villages laid round a street green, on their longest road out of the centre: the plan has no rule for
 * which villages had one (§5.2), so the seed decides. */
const GREEN_SHARE = 0.5;
/** Street green (§2.4, Thorpe 1949): 20–45 m between the plot fronts, four to eight times as long. */
const GREEN_WIDTH_METERS: readonly [number, number] = [20, 45];
const GREEN_LENGTH_RATIO: readonly [number, number] = [4, 8];
/** A green ends this far short of its road's end, and no longer than the plan's first reach of a road (175 m). */
const GREEN_MAX_METERS = 175;

function villageGreen(seed: string, arms: readonly RoadsideArm[]) {
  const rng = makeRng(`${seed}:village-green`);
  if (!arms.length || rng() >= GREEN_SHARE) return undefined;
  const length = (a: RoadsideArm) =>
      a.points.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - a.points[i][0], p[1] - a.points[i][1]), 0),
    arm = arms.reduce((best, a) => (length(a) > length(best) ? a : best)),
    widthMeters = rng.range(...GREEN_WIDTH_METERS);
  return {
    armId: arm.id,
    widthMeters,
    lengthMeters: Math.min(GREEN_MAX_METERS, length(arm) - 20, widthMeters * rng.range(...GREEN_LENGTH_RATIO))
  };
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

/** Every toft houses one household (plan §14.2); a few more are laid for the lots a fit refuses. */
const VILLAGE_NEED_MARGIN = 1.05;
/** A settlement larger than this is a town, not a village (plan §14.3). */
export const VILLAGE_MAX_POPULATION = 1000;
/** A convex ring moved out by `d` on every side (mitred corners). */
function grown(ring: Point[], d: number): Point[] {
  const c = polygonCentroid(ring),
    n = ring.length,
    normal = (a: Point, b: Point): Point => {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1,
        v: Point = [(b[1] - a[1]) / l, -(b[0] - a[0]) / l];
      // Away from the centre, whichever way the ring winds.
      return v[0] * ((a[0] + b[0]) / 2 - c[0]) + v[1] * ((a[1] + b[1]) / 2 - c[1]) < 0 ? [-v[0], -v[1]] : v;
    };
  return ring.map((p, i) => {
    const n0 = normal(ring[(i + n - 1) % n], p),
      n1 = normal(p, ring[(i + 1) % n]),
      k = d / Math.max(0.2, 1 + n0[0] * n1[0] + n0[1] * n1[1]);
    return [p[0] + (n0[0] + n1[0]) * k, p[1] + (n0[1] + n1[1]) * k];
  });
}

/** The town's land reaches this far beyond the blocks laid. */
const LAND_MARGIN_METERS = 0.05;
/** Blocks keep this far inside the map's edge. */
const FRAME_MARGIN_METERS = 10;

/** Half the map a village of `dwellings` needs (plan §5.1): its roads' reach, the deepest blocks behind it, and the
 * fields' margin. An estimate on three approaches; the plan reports what the map cannot take. */
export function villageHalfExtentMeters(dwellings: number): number {
  return villageReachMeters(dwellings) + 150 + 60;
}

/** How far a village of `dwellings` is expected to reach along its roads, before its plan is laid. */
export function villageReachMeters(dwellings: number): number {
  return Math.min(750, 120 + dwellings * 1.6);
}

/** The village's core (its market trades, the tanners' "below the town") reaches this share of its tofts' reach; the
 * smiths and the other trades kept out of a town take the tofts beyond it, at the village's ends (plan V5). */
export const VILLAGE_CORE_SHARE = 0.6;
/** Tofts laid per toft a workshop takes: a row keeps half its tofts for houses (`placeFacilitiesOnPlots`). */
export const VILLAGE_FACILITY_ROOM = 1.5;
