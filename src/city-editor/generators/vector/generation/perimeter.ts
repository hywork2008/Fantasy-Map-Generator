import RBush from "rbush";
import { growthRandom } from "../../../../utils/urbanMorphology";
import type { InfillLane } from "../../../types/contracts/localInfill";
import type { Face, Point } from "../../../types/document";
import type { VectorCityDocument, VectorPlacement } from "../../../types/vector/document";
import type {
  VectorFabric,
  VectorFabricCell,
  VectorFabricDetachedLine,
  VectorFabricDistrict
} from "../../../types/vector/fabric";
import type { VectorBlock, VectorPolygon } from "../../../types/vector/generation";
import type { VectorUrbanSettings } from "../../../types/vector/urban";
import type { ResidentialHeightKind } from "../../buildingHeightPolicy";
import { isSimplePolygon, nearestOnPolyline, polygonArea, polygonCentroid } from "../../geom";
import {
  buildOrganicStreetCell,
  COARSE_STREET_CELL_METERS,
  COARSE_STREET_WIDTH_METERS,
  type OrganicStreetCell,
  planOrganicStreetCells,
  ROAD_FACADE_CLEARANCE_METERS
} from "../../organicBlocks";
import { buildPerimeterBlocks } from "../../perimeterBlocks";
import { createGenerationJoiner } from "../editing/network";
import { curveSource } from "../editing/paths";
import { fabricCellHash, fabricDistrictHash } from "../fabric/hash";
import { fabricLine, isDetachedFabricLine } from "../fabric/lines";
import { packLines, packPoints, unpackPoints } from "../fabric/pack";
import { evaluateAnchor } from "../geometry/curves";
import { gateOpening, junctionSurface } from "../geometry/network";
import { regionArea, regionBoolean } from "../geometry/regions";
import { samplePath, simplifyFreehand } from "../geometry/sampling";
import { pathSurface, simpleContour, surfacesOverlap } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { vectorOccupiedSites } from "../occupancy";
import { vectorDistrictId } from "./districtId";
import { vectorHouseHeightKey, vectorHousingHeights } from "./housingHeights";
import { perimeterHouseDwellings } from "./urbanCapacity";
import { nearestRoadAnchor } from "./urbanPacking";
import { VECTOR_URBAN_ALGORITHM } from "./urbanState";

export const PERIMETER_HOUSE_MODEL = "ce-perimeter-house";
type FabricLine = { points: Point[]; widthMeters: number };
interface CellPlan {
  id: string;
  districtId: string;
  ring: Point[];
  lanes: FabricLine[];
  attachments: VectorFabricCell["attachments"];
  mouths: VectorFabricCell["mouths"];
}
interface DistrictPlan {
  id: string;
  outline: Point[];
  boundaries: VectorFabricDistrict["boundaries"];
  streets: FabricLine[];
  mouths: VectorFabricDistrict["mouths"];
  cells: CellPlan[];
}
export interface VectorPerimeterPlan {
  districts: DistrictPlan[];
  houses: { cellId: string; districtId: string; polygon: Point[]; draw: number }[];
  /** Parcels of every street block, for district classification and residual land. */
  blocks: VectorBlock[];
  laneWidthMeters: number;
}
const lineLength = (points: Point[]) =>
  points.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
/** Fraction of the polyline's length at its closest point to `p`. */
function lineParameter(points: Point[], p: Point): number {
  const hit = nearestOnPolyline(p, points),
    total = lineLength(points);
  if (total <= 0) return 0;
  const before = lineLength(points.slice(0, hit.segIndex + 1)),
    a = points[hit.segIndex],
    b = points[Math.min(hit.segIndex + 1, points.length - 1)];
  return Math.min(1, Math.max(0, (before + Math.hypot(b[0] - a[0], b[1] - a[1]) * hit.t) / total));
}
const boxOf = (points: Point[], pad = 0) => ({
  minX: Math.min(...points.map(p => p[0])) - pad,
  minY: Math.min(...points.map(p => p[1])) - pad,
  maxX: Math.max(...points.map(p => p[0])) + pad,
  maxY: Math.max(...points.map(p => p[1])) + pad
});

/** Everything a district plan reads, in plain data: it crosses to a worker unchanged. */
export interface PerimeterPlanContext {
  roads: { points: Point[]; frontage: number }[];
  frontageReach: number;
  seed: string;
  laneWidthMeters: number;
  walls: [Point, Point][];
  hub: Point;
  extentMeters: number;
  /** The mesh editor's classic plan (P4d): each district filled by its classic block infill, no organic streets. */
  classic?: boolean;
}
/** One reachable skeleton block without holes, with its stable district id. */
export interface PerimeterDistrictJob {
  districtId: string;
  outline: Point[];
}
export interface PerimeterDistrictResult {
  district: DistrictPlan;
  blocks: VectorBlock[];
  houses: VectorPerimeterPlan["houses"];
}

/** The ring in whole centimetres without repeated points, or undefined when that is not a simple polygon. */
function centimetreRing(points: Point[]): Point[] | undefined {
  const ring: Point[] = [];
  for (const p of points) {
    const q: Point = [Math.round(p[0] * 100) / 100 || 0, Math.round(p[1] * 100) / 100 || 0],
      last = ring.at(-1);
    if (!last || last[0] !== q[0] || last[1] !== q[1]) ring.push(q);
  }
  while (ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1]) ring.pop();
  if (ring.length >= 3 && isSimplePolygon(ring, 1e-12)) return ring;
  // A notch narrower than the rounding (a road corner, say) can put a vertex onto another edge. Dropping such
  // vertices removes the notch; a ring that loses more than 1% of its area is not used.
  const area = Math.abs(polygonArea(ring));
  for (let guard = 0; guard < 16 && ring.length > 3; guard++) {
    const k = ring.findIndex((p, i) =>
      ring.some((a, j) => {
        const b = ring[(j + 1) % ring.length];
        return j !== i && (j + 1) % ring.length !== i && nearestOnPolyline(p, [a, b]).dist < 0.01;
      })
    );
    if (k < 0) break;
    ring.splice(k, 1);
    if (isSimplePolygon(ring, 1e-12))
      return Math.abs(Math.abs(polygonArea(ring)) - area) <= area * 0.01 ? ring : undefined;
  }
  return undefined;
}

/** A CE district plan needs a simple outline. A reachable block with holes (a civic precinct or a dead-end road
 * standing free inside it) is cut by a 0.2 m slit through each hole into parts without holes; the parts become
 * districts of their own. Without this the whole block, the largest quarter of some cities, stayed empty. */
function withoutHoles(block: VectorBlock): VectorBlock[] {
  if (!block.reachable || !block.holes.length) return [block];
  let parts: VectorPolygon[] = [{ outer: block.outer, holes: block.holes }];
  for (let guard = 0; guard < 16 && parts.some(p => p.holes.length); guard++)
    parts = parts.flatMap(part => {
      if (!part.holes.length) return [part];
      const [x] = polygonCentroid(part.holes[0]),
        ys = part.outer.map(p => p[1]),
        low = Math.min(...ys) - 1,
        high = Math.max(...ys) + 1;
      return regionBoolean(
        [part],
        [
          {
            outer: [
              [x - 0.1, low],
              [x + 0.1, low],
              [x + 0.1, high],
              [x - 0.1, high]
            ],
            holes: []
          }
        ],
        "difference"
      );
    });
  return parts
    .filter(p => regionArea(p) > 100)
    .map((p, i) => ({
      ...block,
      id: `${block.id}:part:${i}`,
      outer: p.outer,
      holes: p.holes,
      areaMeters2: regionArea(p)
    }));
}

/** District jobs in block order and their shared context. District ids are assigned over every block, so the
 * ids never depend on how the jobs are split. */
export function perimeterJobs(
  doc: VectorCityDocument,
  blocks: VectorBlock[],
  settings: VectorUrbanSettings
): { context: PerimeterPlanContext; jobs: PerimeterDistrictJob[] } {
  const primary = Object.values(doc.paths).filter(p => p.role === "road");
  // CE orients districts along nearby wall segments; a 0.5 m simplification keeps that lookup small.
  const walls = Object.values(doc.paths)
    .filter(p => p.role === "wall")
    .flatMap(p => {
      const points = simplifyFreehand(
        samplePath(p).map(s => s.point),
        0.5
      );
      return points.slice(1).map((b, i): [Point, Point] => [points[i], b]);
    });
  const jobs: PerimeterDistrictJob[] = [],
    districtIds = new Set<string>();
  for (const sourceBlock of blocks.flatMap(withoutHoles)) {
    // Blocks never coincide, but a collision must not merge two districts' random streams.
    let districtId = vectorDistrictId(sourceBlock);
    for (let n = 2; districtIds.has(districtId); n++) districtId = `${vectorDistrictId(sourceBlock)}:${n}`;
    districtIds.add(districtId);
    if (!sourceBlock.reachable || sourceBlock.holes.length) continue;
    // The record keeps the outline in whole centimetres, so the plan works on that outline. Rounding can fold a
    // fine outline onto itself; a coarser simplification is tried before the block is left without a district.
    const outline = [0.05, 0.2, 0.5]
      .map(tolerance =>
        centimetreRing(simplifyFreehand([...sourceBlock.outer, sourceBlock.outer[0]], tolerance).slice(0, -1))
      )
      .find(ring => ring !== undefined);
    if (outline) jobs.push({ districtId, outline });
  }
  return {
    context: {
      roads: primary.map(path => ({
        points: samplePath(path).map(p => p.point),
        frontage: path.width.leftMeters + path.width.rightMeters
      })),
      frontageReach: Math.max(0, ...primary.map(p => p.width.leftMeters + p.width.rightMeters + 0.1)) + 1e-6,
      seed: doc.recipe.seed,
      laneWidthMeters: settings.laneWidthMeters,
      walls,
      hub: doc.site!.center,
      extentMeters: doc.frame.extentMeters,
      ...(doc.generation?.settings.layout === "classic" ? { classic: true } : {})
    },
    jobs
  };
}

const roadIndices = new WeakMap<
  object,
  RBush<{ minX: number; minY: number; maxX: number; maxY: number; index: number }>
>();
const ceParameters = (context: PerimeterPlanContext) => ({
  coverage: 0.9,
  occupancy: 1,
  lotArea: 80,
  laneWidth: context.laneWidthMeters,
  orientation: 0
});
const ceContext = (context: PerimeterPlanContext) => ({
  hub: context.hub,
  extentMeters: context.extentMeters,
  walls: context.walls,
  // Skeleton blocks are far coarser than a CE mesh cell, so CE's coarse-mesh street blocks apply.
  streetCellMeters: COARSE_STREET_CELL_METERS,
  streetWidthMeters: COARSE_STREET_WIDTH_METERS
});
const districtFace = (id: string): Face => ({
  id,
  boundary: [],
  properties: { elevation: 1, water: "land", ward: "craftsmen", buildable: true, locked: false }
});

/** Everything besides the district's own outline and boundaries that its plan reads. */
const planKeys = new WeakMap<object, string>();
function planKey(context: PerimeterPlanContext): string {
  let key = planKeys.get(context);
  if (key === undefined) {
    key = JSON.stringify([
      context.seed,
      context.laneWidthMeters,
      context.hub,
      context.extentMeters,
      context.walls,
      !!context.classic
    ]);
    planKeys.set(context, key);
  }
  return key;
}
/** Street plans of this and the previous generation, by content. Plans are pure in their key, so a dependency
 * update that leaves a district's outline and road frontage unchanged gets the same plan without recomputing.
 * Cached plans are shared and must not be mutated. */
const streetPlans = {
  current: new Map<string, PerimeterStreetPlan>(),
  previous: new Map<string, PerimeterStreetPlan>()
};
/** Street-block results by the cached street block object they came from, for one context key. */
const cellResults = new WeakMap<object, { key: string; nearby: string; result: PerimeterCellResult }>();
const streetPlanKey = (
  context: PerimeterPlanContext,
  job: PerimeterDistrictJob,
  boundaries: PerimeterStreetPlan["boundaries"]
) => `${planKey(context)}|${job.districtId}|${JSON.stringify(job.outline)}|${JSON.stringify(boundaries)}`;
/** Keeps plans computed elsewhere (a worker pool) so later dependency updates here can reuse them. */
export function rememberPerimeterResults(
  request: PerimeterRequest,
  results: PerimeterStreetPlan[] | PerimeterCellResult[]
) {
  if (request.kind === "streets") {
    rotatePlanCache();
    request.jobs.forEach((job, i) => {
      const plan = results[i] as PerimeterStreetPlan;
      keepStreetPlan(request.context, streetPlanKey(request.context, job, plan.boundaries), plan);
    });
  } else {
    const key = planKey(request.context);
    request.jobs.forEach((job, i) => {
      cellResults.set(job.cell, {
        key,
        nearby: job.nearby.map(n => n.index).join(","),
        // Joining extends the arrays of the result it is given; the cache keeps its own.
        result: freshCell(results[i] as PerimeterCellResult)
      });
    });
  }
}
const outlineKeys = new WeakMap<PerimeterStreetPlan, string>();
/** Keeps a street plan, with its seed, lane width, district id and outline as the record stores them (whole
 * centimetres from the rounded origin). */
function keepStreetPlan(context: PerimeterPlanContext, key: string, plan: PerimeterStreetPlan) {
  streetPlans.current.set(key, plan);
  if (!outlineKeys.has(plan)) {
    const origin = roundedOrigin(plan.outline);
    outlineKeys.set(
      plan,
      `${context.seed}|${context.laneWidthMeters}|${plan.districtId}|${origin}|${packPoints(plan.outline, origin)}`
    );
  }
}
/** True when every district of the records has a kept street plan for the same seed, lane width and outline.
 * Road frontage, walls and the hub are not
 * compared, so a true answer can still miss; it only decides whether preparing the plans is worth starting. */
export function perimeterPlansKept(fabric: Readonly<VectorFabric> | undefined): boolean {
  const districts = Object.values(fabric?.districts ?? {});
  if (!districts.length) return true;
  const kept = new Set(
    [...streetPlans.current.values(), ...streetPlans.previous.values()].map(p => outlineKeys.get(p))
  );
  return districts.every(d => kept.has(`${d.seed}|${d.parameters.laneWidthMeters}|${d.id}|${d.origin}|${d.outline}`));
}
/** Starts a generation: plans kept from before the previous one are dropped. */
function rotatePlanCache() {
  streetPlans.previous = streetPlans.current;
  streetPlans.current = new Map();
}

/** A district's streets and street blocks, before any street block is laid out. */
export interface PerimeterStreetPlan {
  districtId: string;
  outline: Point[];
  boundaries: VectorFabricDistrict["boundaries"];
  streets: InfillLane[];
  cells: OrganicStreetCell[];
}
/** One street block with the district streets near it, by their index in the district. */
export interface PerimeterCellJob {
  districtId: string;
  cell: OrganicStreetCell;
  nearby: { index: number; street: InfillLane }[];
}
export interface PerimeterCellResult {
  cell: CellPlan;
  blocks: VectorBlock[];
  houses: VectorPerimeterPlan["houses"];
}

/** First step of a district: CE's perimeter streets and street blocks. Pure in its arguments. */
export function planPerimeterStreets(context: PerimeterPlanContext, job: PerimeterDistrictJob): PerimeterStreetPlan {
  let roadIndex = roadIndices.get(context);
  if (!roadIndex) {
    // Bounding boxes only narrow candidates; the original per-road tests and road order still decide.
    roadIndex = new RBush();
    roadIndex.load(context.roads.map((r, index) => ({ ...boxOf(r.points), index })));
    roadIndices.set(context, roadIndex);
  }
  const index = roadIndex,
    roadsNear = (p: Point, reach: number) =>
      index
        .search({ minX: p[0] - reach, minY: p[1] - reach, maxX: p[0] + reach, maxY: p[1] + reach })
        .sort((a, b) => a.index - b.index)
        .map(item => context.roads[item.index]);
  const { districtId, outline } = job;
  const fullBoundaries = outline.map((a, i) => {
    const b = outline[(i + 1) % outline.length],
      mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const road = roadsNear(mid, context.frontageReach).find(
      p => nearestOnPolyline(mid, p.points).dist <= p.frontage + 0.1
    );
    return { a, b, feature: !!road, barrier: !road, setback: road ? ROAD_FACADE_CLEARANCE_METERS : 3 };
  });
  const boundaries = fullBoundaries.map(b => ({ feature: b.feature, barrier: b.barrier, setback: b.setback })),
    key = streetPlanKey(context, job, boundaries),
    known = streetPlans.current.get(key) ?? streetPlans.previous.get(key);
  if (known) {
    keepStreetPlan(context, key, known);
    return known;
  }
  // Classic keeps the district whole: the mesh editor fills each block by its own rows and lanes, with no
  // organic streets between them.
  const plan = context.classic
    ? { streets: [], cells: [{ id: `${districtId}:classic`, ring: outline, boundaries: fullBoundaries }] }
    : planOrganicStreetCells(
        districtFace(districtId),
        outline,
        fullBoundaries,
        ceParameters(context),
        context.seed,
        ceContext(context)
      );
  const result: PerimeterStreetPlan = {
    districtId,
    outline,
    boundaries,
    // The CE street plan lists some streets twice (in the fixed inputs, 61 of 355 at 1,000 people). The mesh
    // editor never noticed; saved records would store, draw and measure them twice.
    streets: withoutRepeatedStreets(plan.streets),
    cells: plan.cells
  };
  keepStreetPlan(context, key, result);
  return result;
}

/** Street-block jobs of every district, in district then street-block order. */
export function perimeterCellJobs(context: PerimeterPlanContext, plans: PerimeterStreetPlan[]): PerimeterCellJob[] {
  const reach = Math.max(COARSE_STREET_WIDTH_METERS, context.laneWidthMeters) + 1;
  return plans.flatMap(plan => {
    const streetIndex = new RBush<{ minX: number; minY: number; maxX: number; maxY: number; index: number }>();
    streetIndex.load(plan.streets.map((l, index) => ({ ...boxOf(l.points), index })));
    return plan.cells.map(cell => ({
      districtId: plan.districtId,
      cell,
      nearby: streetIndex
        .search(boxOf(cell.ring, reach))
        .sort((a, b) => a.index - b.index)
        .map(item => ({ index: item.index, street: plan.streets[item.index] }))
    }));
  });
}

/** Second step: one street block's lanes, parcels and candidate lots on its own random stream. Pure. */
export function planPerimeterCell(context: PerimeterPlanContext, job: PerimeterCellJob): PerimeterCellResult {
  const key = planKey(context),
    nearbyKey = job.nearby.map(n => n.index).join(","),
    known = cellResults.get(job.cell);
  // The cell object itself comes from a cached street plan, so its ring and district streets are unchanged.
  if (known && known.key === key && known.nearby === nearbyKey) return freshCell(known.result);
  const result = computePerimeterCell(context, job);
  cellResults.set(job.cell, { key, nearby: nearbyKey, result });
  return freshCell(result);
}
/** A copy whose parts that joining and adoption extend are new arrays; everything else stays shared. */
const freshCell = (r: PerimeterCellResult): PerimeterCellResult => ({
  cell: { ...r.cell, lanes: [...r.cell.lanes], attachments: [...r.cell.attachments], mouths: [] },
  blocks: [...r.blocks],
  houses: [...r.houses]
});
function computePerimeterCell(context: PerimeterPlanContext, job: PerimeterCellJob): PerimeterCellResult {
  const { districtId, cell, nearby } = job,
    local = context.classic
      ? buildPerimeterBlocks(
          districtFace(districtId),
          cell.ring,
          cell.boundaries,
          ceParameters(context),
          context.seed,
          true,
          true
        )
      : buildOrganicStreetCell(
          districtFace(districtId),
          cell,
          ceParameters(context),
          context.seed,
          ceContext(context),
          nearby.map(n => n.street)
        );
  const lanes = local.lanes.map(l => ({ points: l.points, widthMeters: l.widthMeters }));
  const attachments: CellPlan["attachments"] = [];
  lanes.forEach((lane, laneIndex) => {
    for (const end of [0, 1] as const) {
      const p = end === 0 ? lane.points[0] : lane.points.at(-1)!;
      // Lane ends lie on the block, so every street within 0.1 mm is among the nearby streets.
      const street = nearby.find(n => nearestOnPolyline(p, n.street.points).dist <= 1e-4);
      if (street)
        attachments.push({ lane: laneIndex, end, street: street.index, t: lineParameter(street.street.points, p) });
    }
  });
  return {
    cell: { id: cell.id, districtId, ring: cell.ring, lanes, attachments, mouths: [] },
    blocks: local.blocks.map((outer, i) => ({
      id: `${cell.id}:parcel:${i}`,
      outer,
      holes: [],
      areaMeters2: regionArea({ outer, holes: [] }),
      frontage: [],
      reachable: true
    })),
    houses: local.buildings.map(b => ({
      cellId: cell.id,
      districtId,
      polygon: b.polygon,
      draw: b.occupancyDraw ?? growthRandom(JSON.stringify(b.polygon))
    }))
  };
}

/** A district's plan from its streets and its street blocks' results in street-block order. */
export function assemblePerimeterDistrict(
  plan: PerimeterStreetPlan,
  cells: PerimeterCellResult[]
): PerimeterDistrictResult {
  return {
    district: {
      id: plan.districtId,
      outline: plan.outline,
      boundaries: plan.boundaries,
      streets: plan.streets.map(l => ({ points: l.points, widthMeters: l.widthMeters })),
      mouths: [],
      cells: cells.map(c => c.cell)
    },
    blocks: cells.flatMap(c => c.blocks),
    houses: cells.flatMap(c => c.houses)
  };
}

/** Work a generation hands out: district streets first, then every street block. Both are pure in their
 * arguments and answered in job order, so where they run never changes the document. */
export type PerimeterRequest =
  | { kind: "streets"; context: PerimeterPlanContext; jobs: PerimeterDistrictJob[] }
  | { kind: "cells"; context: PerimeterPlanContext; jobs: PerimeterCellJob[] };
/** Answers a request here; workers call the same function. */
export function planPerimeterRequest(request: PerimeterRequest): PerimeterStreetPlan[] | PerimeterCellResult[] {
  if (request.kind === "streets") rotatePlanCache();
  return request.kind === "streets"
    ? request.jobs.map(job => planPerimeterStreets(request.context, job))
    : request.jobs.map(job => planPerimeterCell(request.context, job));
}

/** Area used to balance work across workers: the district outline or the street-block ring. */
export function perimeterJobArea(request: PerimeterRequest, index: number): number {
  const ring = request.kind === "streets" ? request.jobs[index].outline : request.jobs[index].cell.ring;
  return (
    Math.abs(
      ring.reduce((sum, p, i) => sum + p[0] * ring[(i + 1) % ring.length][1] - ring[(i + 1) % ring.length][0] * p[1], 0)
    ) / 2
  );
}

/** Both steps of one district in place. */
export function planPerimeterDistrict(
  context: PerimeterPlanContext,
  job: PerimeterDistrictJob
): PerimeterDistrictResult {
  const streets = planPerimeterStreets(context, job);
  return assemblePerimeterDistrict(
    streets,
    perimeterCellJobs(context, [streets]).map(cell => planPerimeterCell(context, cell))
  );
}

/** District results from street plans and the flat list of street-block results, both in order. */
export function assemblePerimeterDistricts(
  plans: PerimeterStreetPlan[],
  cells: PerimeterCellResult[]
): PerimeterDistrictResult[] {
  let at = 0;
  return plans.map(plan => {
    const own = cells.slice(at, at + plan.cells.length);
    at += plan.cells.length;
    return assemblePerimeterDistrict(plan, own);
  });
}

/** CE's coarse-district layout for every reachable skeleton block, kept as district and street-block plans.
 * Generated streets and lanes never become `VectorPath`s; their ends on main roads become explicit mouths. */
export function planVectorPerimeter(
  doc: VectorCityDocument,
  blocks: VectorBlock[],
  settings: VectorUrbanSettings
): VectorPerimeterPlan {
  const { context, jobs } = perimeterJobs(doc, blocks, settings);
  return joinPerimeterPlan(
    doc,
    jobs.map(job => planPerimeterDistrict(context, job)),
    settings
  );
}

/** Joins district plans, in job order, to the road graph: street and lane ends on a main road get mouths. */
export function joinPerimeterPlan(
  doc: VectorCityDocument,
  districts: PerimeterDistrictResult[],
  settings: VectorUrbanSettings
): VectorPerimeterPlan {
  const primary = Object.values(doc.paths).filter(p => p.role === "road");
  const primarySamples = primary.map(path => ({ path, points: samplePath(path).map(p => p.point) }));
  const primaryIndex = new RBush<{ minX: number; minY: number; maxX: number; maxY: number; index: number }>();
  primaryIndex.load(primarySamples.map((r, index) => ({ ...boxOf(r.points), index })));
  const roadsNear = (p: Point, reach: number) =>
    primaryIndex
      .search({ minX: p[0] - reach, minY: p[1] - reach, maxX: p[0] + reach, maxY: p[1] + reach })
      .sort((a, b) => a.index - b.index)
      .map(item => primarySamples[item.index]);
  const endpointReach =
    Math.max(0, ...primary.map(p => Math.max(p.width.leftMeters, p.width.rightMeters))) +
    settings.laneWidthMeters / 2 +
    0.7 +
    1e-6;
  const water = allVectorWater(doc);
  const result: VectorPerimeterPlan = {
    districts: districts.map(d => d.district),
    houses: districts.flatMap(d => d.houses),
    blocks: districts.flatMap(d => d.blocks),
    laneWidthMeters: settings.laneWidthMeters
  };
  // Street and lane ends on a main road join it through an explicit node. A short connector closes any gap.
  const joiner = createGenerationJoiner(doc);
  const mouth = (p: Point): { target: Point; nodeId: string } | undefined => {
    const road = roadsNear(p, endpointReach)
      .map(r => ({ ...r, near: nearestOnPolyline(p, r.points) }))
      .sort((a, b) => a.near.dist - b.near.dist)[0];
    if (
      !road ||
      road.near.dist >
        Math.max(road.path.width.leftMeters, road.path.width.rightMeters) + settings.laneWidthMeters / 2 + 0.7
    )
      return;
    const anchor = nearestRoadAnchor(road.path, p),
      target = evaluateAnchor(road.path, anchor);
    if (
      Object.values(doc.connections.gates).some(g => {
        const center = evaluateAnchor(doc.paths[g.wallPathId], g.anchor);
        return Math.hypot(target[0] - center[0], target[1] - center[1]) < g.widthMeters * 2;
      })
    )
      return;
    if (Math.hypot(target[0] - p[0], target[1] - p[1]) >= 1e-6) {
      const connector = {
        id: "connector",
        revision: 0,
        role: "road" as const,
        origin: "automatic" as const,
        editPolicy: "editable" as const,
        source: curveSource([p, target], "polyline", false),
        width: { leftMeters: settings.laneWidthMeters / 2, rightMeters: settings.laneWidthMeters / 2, stations: [] }
      };
      if (regionBoolean([pathSurface(connector)], water, "intersection").some(r => regionArea(r) > 1e-5)) return;
    }
    return { target, nodeId: joiner.ensure(anchor) };
  };
  const join = (lines: FabricLine[], add: (index: number, end: 0 | 1, nodeId: string) => void) => {
    const count = lines.length;
    for (let i = 0; i < count; i++)
      for (const end of [0, 1] as const) {
        const p = end === 0 ? lines[i].points[0] : lines[i].points.at(-1)!,
          joined = mouth(p);
        if (!joined) continue;
        if (Math.hypot(joined.target[0] - p[0], joined.target[1] - p[1]) < 1e-6) add(i, end, joined.nodeId);
        else {
          lines.push({ points: [p, joined.target], widthMeters: settings.laneWidthMeters });
          add(lines.length - 1, 1, joined.nodeId);
        }
      }
  };
  for (const district of result.districts) {
    join(district.streets, (street, end, nodeId) => district.mouths.push({ street, end, nodeId }));
    for (const cell of district.cells) join(cell.lanes, (lane, end, nodeId) => cell.mouths.push({ lane, end, nodeId }));
  }
  return result;
}

/** Streets in order, without any street lying wholly on an earlier one (5 cm). Partial overlaps stay. */
function withoutRepeatedStreets<T extends { points: Point[] }>(streets: T[]): T[] {
  const kept: T[] = [],
    index = new RBush<{ minX: number; minY: number; maxX: number; maxY: number; points: Point[] }>();
  for (const street of streets) {
    const near = index.search(boxOf(street.points, 0.05)).map(item => item.points),
      covered = (p: Point) => near.some(points => nearestOnPolyline(p, points).dist <= 0.05);
    let repeated = near.length > 0;
    for (let i = 1; repeated && i < street.points.length; i++) {
      const a = street.points[i - 1],
        b = street.points[i],
        n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
      for (let k = 0; repeated && k <= n; k++)
        repeated = covered([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
    if (repeated) continue;
    kept.push(street);
    index.insert({ ...boxOf(street.points), points: street.points });
  }
  return kept;
}

/** Largest share of a lot that may be trimmed away where it overlaps an adopted neighbour. */
const MAX_SLIVER_SHARE = 0.02;

const roundedOrigin = (points: Point[]): Point => {
  const c = polygonCentroid(points);
  return [Math.round(c[0]) || 0, Math.round(c[1]) || 0];
};
/** Packed ring without repeated points, or undefined when rounding to centimetres breaks it. */
function packedRing(points: Point[], origin: Point): number[] | undefined {
  const packed = packPoints(points, origin),
    kept: number[] = [];
  for (let i = 0; i < packed.length; i += 2) {
    const n = kept.length;
    if (n >= 2 && kept[n - 2] === packed[i] && kept[n - 1] === packed[i + 1]) continue;
    kept.push(packed[i], packed[i + 1]);
  }
  while (kept.length >= 4 && kept[0] === kept.at(-2) && kept[1] === kept.at(-1)) kept.splice(-2, 2);
  if (kept.length < 6 || !isSimplePolygon(unpackPoints(kept, origin), 1e-12)) return;
  return kept;
}

/** Adopt houses in CE occupancy-draw order until the dwellings are met, and save every planned district and
 * street block as fabric records. Houses are site, footprint and reservation at once. */
type OccupiedIndex = RBush<{ minX: number; minY: number; maxX: number; maxY: number; polygon: VectorPolygon }>;
/** Lot fits of cached plan houses, by the occupied sites near the lot when it was fitted. */
const lotFits = new WeakMap<object, { key: string; fit?: { ring: number[]; polygon: Point[] } }>();
/** The lot as adopted: whole, trimmed of slivers shared with occupied land, or undefined when it does not fit.
 * Pure in the lot and the sites near it, so a lot whose surroundings are unchanged reuses its last fit. */
function fittedLot(
  house: VectorPerimeterPlan["houses"][number],
  origin: Point,
  occupied: OccupiedIndex
): { ring: number[]; polygon: Point[] } | undefined {
  const first = packedRing(house.polygon, origin);
  if (!first) return undefined;
  const whole = unpackPoints(first, origin),
    near = occupied.search(boxOf(whole)).map(o => o.polygon),
    key = `${origin}|${JSON.stringify(near)}`,
    known = lotFits.get(house);
  if (known?.key === key) return known.fit;
  const fit = fitLot(first, whole, origin, near);
  lotFits.set(house, { key, fit });
  return fit;
}
function fitLot(
  first: number[],
  whole: Point[],
  origin: Point,
  near: VectorPolygon[]
): { ring: number[]; polygon: Point[] } | undefined {
  const site = { outer: whole, holes: [] },
    overlapping = near.filter(o => regionBoolean([site], [o], "intersection").some(r => regionArea(r) > 1e-5));
  if (!overlapping.length) return { ring: first, polygon: whole };
  // CE lots overlap their neighbours by slivers. Trimming the sliver keeps the row closed; a lot that loses
  // more than a sliver stays unbuilt, so no house ever shares land with another.
  const before = regionArea(site),
    trimmed = regionBoolean([site], overlapping, "difference");
  const kept = trimmed.length === 1 && !trimmed[0].holes.length ? packedRing(trimmed[0].outer, origin) : undefined;
  if (!kept) return undefined;
  const next = unpackPoints(kept, origin),
    trimmedSite = { outer: next, holes: [] };
  if (regionArea(trimmedSite) < before * (1 - MAX_SLIVER_SHARE)) return undefined;
  // The trimmed lot lies inside the whole one, so every site that can touch it is among `near`.
  const box = boxOf(next);
  if (
    near.some(
      o =>
        boxesMeet(boxOf(o.outer), box) &&
        regionBoolean([trimmedSite], [o], "intersection").some(r => regionArea(r) > 1e-5)
    )
  )
    return undefined;
  return { ring: kept, polygon: next };
}
const boxesMeet = (a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>) =>
  a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

export function placeVectorPerimeterHouses(
  doc: VectorCityDocument,
  plan: VectorPerimeterPlan,
  required: number,
  inside: (p: Point) => boolean,
  /** Lots drawn at or below this value are adopted even past `required` (an edit keeps the old vacancy). */
  keepDraw = -Infinity,
  /** Per street block id: draws of lots the user cleared. They stay empty and stay recorded. */
  cleared: Record<string, number[]> = {},
  /** Per district or street block id: lines the user moved to paths. */
  detachedLines: Record<string, VectorFabricDetachedLine[]> = {},
  /** CE lot occupancy: lots drawn at or above it stay unbuilt, as in CE's mesh editor. */
  lotOccupancy = 1,
  /** The height kind of a street block's ward (P6g); ordinary when absent. */
  heightKind: (cellId: string) => ResidentialHeightKind = () => "ordinary",
  /** Street blocks built up whatever the demand: the mesh editor's shanty cells always hold houses (P6h). */
  alwaysBuilt: (cellId: string) => boolean = () => false,
  /** Whether a lot beyond the town keeps its house (P7a): as roadside ribbon first, then, while the ribbon leaves
   * people unhoused, as a residential suburb (the mesh editor's residential outskirts). */
  keepsLot: (cellId: string, polygon: Point[], residential: boolean) => boolean = () => true
): { dwellings: number; houses: number } {
  // A detached line stays detached only where the plan drew the same line again; anything else is refused,
  // because the plan's new line would run beside or across the user's road.
  const carried = (owner: string, planned: FabricLine[]) =>
    (detachedLines[owner] ?? []).map(l => {
      const path = doc.paths[l.pathId],
        line = planned[l.index],
        points =
          path?.source.kind === "curve" ? [path.source.segments[0].from, ...path.source.segments.map(s => s.to)] : [];
      if (
        !line ||
        line.points.length !== points.length ||
        line.points.some((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]) > 0.02)
      )
        throw new Error(`dependency-protected-path:${l.pathId}`);
      return structuredClone(l);
    });
  const heights = vectorHousingHeights(doc),
    insideCells = new Map<string, boolean>(),
    cellInside = (id: string) => {
      let value = insideCells.get(id);
      if (value === undefined) {
        value = inside(polygonCentroid(cells.get(id)!.ring));
        insideCells.set(id, value);
      }
      return value;
    };
  // Gate openings and junction discs are checked exactly as validation does: a lot may share a sliver with a
  // neighbour, never with them (P4a: wall shapes bring lots up to water gates and road ends).
  const protectedLand: VectorPolygon[] = [
      ...Object.values(doc.connections.gates).map(g => ({ outer: gateOpening(doc, g), holes: [] })),
      ...Object.keys(doc.connections.nodes).flatMap(id => {
        const junction = junctionSurface(doc, id);
        return junction ? [junction] : [];
      })
    ],
    protectedIndex = new RBush<{ minX: number; minY: number; maxX: number; maxY: number; polygon: VectorPolygon }>();
  protectedIndex.load(protectedLand.map(polygon => ({ ...boxOf(polygon.outer), polygon })));
  const occupied = new RBush<{ minX: number; minY: number; maxX: number; maxY: number; polygon: VectorPolygon }>();
  occupied.load(
    [...vectorOccupiedSites(doc, "reserved"), ...protectedLand].map(polygon => ({ ...boxOf(polygon.outer), polygon }))
  );
  const cells = new Map<string, CellPlan>(),
    origins = new Map<string, Point>(),
    rings = new Map<string, number[]>(),
    districtOf = new Map<string, DistrictPlan>();
  for (const district of plan.districts)
    for (const cell of district.cells) {
      const origin = roundedOrigin(cell.ring),
        ring = packedRing(cell.ring, origin);
      // A street block that cannot keep its outline at centimetre precision holds no houses.
      if (!ring) continue;
      cells.set(cell.id, cell);
      origins.set(cell.id, origin);
      rings.set(cell.id, ring);
      districtOf.set(cell.id, district);
    }
  const lineIndex = new RBush<{ minX: number; minY: number; maxX: number; maxY: number; points: Point[] }>();
  lineIndex.load([
    ...plan.districts
      .flatMap(d => [...d.streets, ...d.cells.flatMap(c => c.lanes)])
      .map(l => ({ ...boxOf(l.points), points: l.points })),
    ...Object.values(doc.paths)
      .filter(p => p.role === "road")
      .map(p => {
        const points = samplePath(p).map(s => s.point);
        return { ...boxOf(points), points };
      })
  ]);
  const adopted = new Map<
    string,
    { ring: number[]; storeys: number; dwellings: number; entrance: number[]; draw: number }[]
  >();
  let capacity = 0,
    count = 0;
  // CE occupancy draws spread vacant lots through every district. A population
  // target must never fill one half of the city before the other half.
  const shanty = plan.houses.some(h => alwaysBuilt(h.cellId));
  const held: typeof plan.houses = [],
    order = plan.houses.slice().sort((a, b) => a.draw - b.draw);
  for (let pass = 0; pass < 2; pass++) {
    if (pass && capacity >= required) break;
    for (const house of pass ? held.splice(0) : order) {
      if (capacity >= required && house.draw > keepDraw && !alwaysBuilt(house.cellId)) {
        if (!shanty) break;
        continue;
      }
      const origin = origins.get(house.cellId);
      if (!origin || house.draw >= lotOccupancy || cleared[house.cellId]?.includes(house.draw)) continue;
      const fit = fittedLot(house, origin, occupied);
      if (!fit) continue;
      const lot = { outer: fit.polygon, holes: [] };
      if (protectedIndex.search(boxOf(fit.polygon)).some(o => surfacesOverlap(lot, o.polygon))) continue;
      const { ring, polygon } = fit,
        site = { outer: polygon, holes: [] };
      if (!keepsLot(house.cellId, polygon, pass === 1)) {
        if (!pass) held.push(house);
        continue;
      }
      const storeys = heights.storeys(
          vectorHouseHeightKey(house.cellId, house.draw),
          house.cellId,
          cellInside(house.cellId),
          heightKind(house.cellId)
        ),
        dwellings = perimeterHouseDwellings(regionArea(site), storeys);
      // The entrance faces the nearest lane, street or road. Never an access drawn across another plot.
      let best: { from: Point; to: Point; distance: number } | undefined;
      const lines = lineIndex.search(boxOf(polygon, 12)).map(item => item.points);
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i],
          b = polygon[(i + 1) % polygon.length],
          mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        for (const points of lines) {
          const hit = nearestOnPolyline(mid, points);
          if (!best || hit.dist < best.distance) best = { from: mid, to: hit.point, distance: hit.dist };
        }
      }
      if (!best) continue;
      const list = adopted.get(house.cellId) ?? [];
      list.push({ ring, storeys, dwellings, entrance: packPoints([best.from, best.to], origin), draw: house.draw });
      // CE lots may overlap their neighbours by a few square centimetres; an adopted house is occupancy too, so
      // a later lot never shares land with it and any house can become a placement (S2.1e2).
      occupied.insert({ ...boxOf(polygon), polygon: site });
      adopted.set(house.cellId, list);
      capacity += dwellings;
      count++;
    }
  }
  const algorithm = VECTOR_URBAN_ALGORITHM,
    districts: VectorFabric["districts"] = {},
    fabricCells: VectorFabric["cells"] = {};
  for (const district of plan.districts) {
    const origin = roundedOrigin(district.outline),
      outline = packPoints(district.outline, origin);
    const kept = district.cells.filter(c => cells.has(c.id));
    const record: Omit<VectorFabricDistrict, "hash"> = {
      id: district.id,
      seed: doc.recipe.seed,
      parameters: {
        lotArea: 80,
        laneWidthMeters: plan.laneWidthMeters,
        coverage: 0.9,
        streetCellMeters: COARSE_STREET_CELL_METERS,
        streetWidthMeters: COARSE_STREET_WIDTH_METERS
      },
      origin,
      outline,
      boundaries: district.boundaries,
      streets: packLines(district.streets, origin),
      mouths: district.mouths,
      cellIds: kept.map(c => c.id),
      ...(detachedLines[district.id]?.length ? { detachedLines: carried(district.id, district.streets) } : {})
    };
    districts[district.id] = { ...record, hash: fabricDistrictHash(record) };
    for (const cell of kept) {
      const cellOrigin = origins.get(cell.id)!,
        houses = adopted.get(cell.id) ?? [];
      const offsets: number[] = [],
        coords: number[] = [];
      for (const h of houses) {
        offsets.push(coords.length / 2);
        coords.push(...h.ring);
      }
      const value: Omit<VectorFabricCell, "hash"> = {
        id: cell.id,
        districtId: district.id,
        origin: cellOrigin,
        ring: rings.get(cell.id)!,
        lanes: packLines(cell.lanes, cellOrigin),
        attachments: cell.attachments,
        mouths: cell.mouths,
        houses: {
          offsets,
          coords,
          storeys: houses.map(h => h.storeys),
          dwellings: houses.map(h => h.dwellings),
          entrances: houses.flatMap(h => h.entrance),
          draws: houses.map(h => h.draw)
        },
        detached: [],
        ...(cleared[cell.id]?.length ? { cleared: [...cleared[cell.id]] } : {}),
        ...(detachedLines[cell.id]?.length ? { detachedLines: carried(cell.id, cell.lanes) } : {}),
        inside: cellInside(cell.id)
      };
      fabricCells[cell.id] = { ...value, hash: fabricCellHash(value) };
    }
  }
  for (const [owner, list] of Object.entries(detachedLines))
    if (list.length && !districts[owner] && !fabricCells[owner])
      throw new Error(`dependency-protected-path:${list[0].pathId}`);
  doc.fabric = { algorithm, districts, cells: fabricCells };
  // A join kept from the edited plan ends on a line the new plan may no longer draw; that join goes,
  // as when the line it ended on is detached. The user's road itself stays.
  for (const r of [...Object.values(districts), ...Object.values(fabricCells)]) {
    if (!r.detachedLines?.length) continue;
    let changed = false;
    for (const l of r.detachedLines) {
      const joins = l.joins.filter(j => fabricLine(doc.fabric, j.line) && !isDetachedFabricLine(doc.fabric, j.line));
      if (joins.length !== l.joins.length) {
        l.joins = joins;
        changed = true;
      }
    }
    if (!changed) continue;
    const { hash: _hash, ...record } = r;
    r.hash =
      "cellIds" in record ? fabricDistrictHash(record) : fabricCellHash(record as Omit<VectorFabricCell, "hash">);
  }
  return { dwellings: capacity, houses: count };
}

export function vectorPerimeterResidual(doc: VectorCityDocument, blocks: VectorBlock[]) {
  const index = new RBush<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    polygon: VectorPlacement["site"];
  }>();
  for (const polygon of vectorOccupiedSites(doc, "reserved"))
    index.insert({
      minX: Math.min(...polygon.outer.map(p => p[0])),
      minY: Math.min(...polygon.outer.map(p => p[1])),
      maxX: Math.max(...polygon.outer.map(p => p[0])),
      maxY: Math.max(...polygon.outer.map(p => p[1])),
      polygon
    });
  // Set operations can leave slivers that are not simple polygons; residual land is display-only, so they go.
  const valid = (ring: Point[]) =>
    ring.length >= 3 && simpleContour(ring, true) && regionArea({ outer: ring, holes: [] }) > 1e-9;
  return blocks.flatMap(block => {
    const sites = index
        .search({
          minX: Math.min(...block.outer.map(p => p[0])),
          minY: Math.min(...block.outer.map(p => p[1])),
          maxX: Math.max(...block.outer.map(p => p[0])),
          maxY: Math.max(...block.outer.map(p => p[1]))
        })
        .map(item => item.polygon),
      // The block object is shared with the plan cache, so its outline is unchanged; the sites over it decide.
      key = JSON.stringify(sites),
      known = residuals.get(block);
    if (known?.key === key) return structuredClone(known.land);
    const land = regionBoolean([block], sites, "difference").filter(p => valid(p.outer) && p.holes.every(valid));
    residuals.set(block, { key, land });
    return structuredClone(land);
  });
}
/** Residual land of a cached plan block, by the occupied sites it was cut with. */
const residuals = new WeakMap<object, { key: string; land: VectorPolygon[] }>();
