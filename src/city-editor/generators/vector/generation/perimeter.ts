import RBush from "rbush";
import { growthRandom, residentialStoreys } from "../../../../utils/urbanMorphology";
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
import { isSimplePolygon, nearestOnPolyline, polygonCentroid } from "../../geom";
import {
  buildOrganicStreetCell,
  COARSE_STREET_CELL_METERS,
  COARSE_STREET_WIDTH_METERS,
  planOrganicStreetCells,
  ROAD_FACADE_CLEARANCE_METERS
} from "../../organicBlocks";
import { dwellingCapacity } from "../../residentialCapacityFormula";
import { createGenerationJoiner } from "../editing/network";
import { curveSource } from "../editing/paths";
import { fabricCellHash, fabricDistrictHash } from "../fabric/hash";
import { packLines, packPoints, unpackPoints } from "../fabric/pack";
import { evaluateAnchor } from "../geometry/curves";
import { gateOpening } from "../geometry/network";
import { regionArea, regionBoolean } from "../geometry/regions";
import { samplePath, simplifyFreehand } from "../geometry/sampling";
import { pathSurface, simpleContour } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { vectorOccupiedSites } from "../occupancy";
import { vectorDistrictId } from "./districtId";
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

/** CE's coarse-district layout for every reachable skeleton block, kept as district and street-block plans.
 * Generated streets and lanes never become `VectorPath`s; their ends on main roads become explicit mouths. */
export function planVectorPerimeter(
  doc: VectorCityDocument,
  blocks: VectorBlock[],
  settings: VectorUrbanSettings
): VectorPerimeterPlan {
  const primary = Object.values(doc.paths).filter(p => p.role === "road");
  const primarySamples = primary.map(path => ({ path, points: samplePath(path).map(p => p.point) }));
  // Bounding boxes only narrow candidates; the original per-road tests and road order still decide.
  const primaryIndex = new RBush<{ minX: number; minY: number; maxX: number; maxY: number; index: number }>();
  primaryIndex.load(primarySamples.map((r, index) => ({ ...boxOf(r.points), index })));
  const roadsNear = (p: Point, reach: number) =>
    primaryIndex
      .search({ minX: p[0] - reach, minY: p[1] - reach, maxX: p[0] + reach, maxY: p[1] + reach })
      .sort((a, b) => a.index - b.index)
      .map(item => primarySamples[item.index]);
  const frontageReach = Math.max(0, ...primary.map(p => p.width.leftMeters + p.width.rightMeters + 0.1)) + 1e-6,
    endpointReach =
      Math.max(0, ...primary.map(p => Math.max(p.width.leftMeters, p.width.rightMeters))) +
      settings.laneWidthMeters / 2 +
      0.7 +
      1e-6;
  const water = allVectorWater(doc);
  // CE orients districts along nearby wall segments; a 0.5 m simplification keeps that lookup small.
  const wallSegments = Object.values(doc.paths)
    .filter(p => p.role === "wall")
    .flatMap(p => {
      const points = simplifyFreehand(
        samplePath(p).map(s => s.point),
        0.5
      );
      return points.slice(1).map((b, i): [Point, Point] => [points[i], b]);
    });
  const parameters = {
    coverage: 0.9,
    occupancy: 1,
    lotArea: 80,
    laneWidth: settings.laneWidthMeters,
    orientation: 0
  };
  const context = {
    hub: doc.site!.center,
    extentMeters: doc.frame.extentMeters,
    walls: wallSegments,
    // Skeleton blocks are far coarser than a CE mesh cell, so CE's coarse-mesh street blocks apply.
    streetCellMeters: COARSE_STREET_CELL_METERS,
    streetWidthMeters: COARSE_STREET_WIDTH_METERS
  };
  const result: VectorPerimeterPlan = {
    districts: [],
    houses: [],
    blocks: [],
    laneWidthMeters: settings.laneWidthMeters
  };
  const districtIds = new Set<string>();
  for (const sourceBlock of blocks) {
    // Blocks never coincide, but a collision must not merge two districts' random streams.
    let districtId = vectorDistrictId(sourceBlock);
    for (let n = 2; districtIds.has(districtId); n++) districtId = `${vectorDistrictId(sourceBlock)}:${n}`;
    districtIds.add(districtId);
    const outline = simplifyFreehand([...sourceBlock.outer, sourceBlock.outer[0]], 0.05).slice(0, -1);
    if (!sourceBlock.reachable || sourceBlock.holes.length) continue;
    const face: Face = {
      id: districtId,
      boundary: [],
      properties: { elevation: 1, water: "land", ward: "craftsmen", buildable: true, locked: false }
    };
    const boundaries = outline.map((a, i) => {
      const b = outline[(i + 1) % outline.length],
        mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const road = roadsNear(mid, frontageReach).find(
        p => nearestOnPolyline(mid, p.points).dist <= p.path.width.leftMeters + p.path.width.rightMeters + 0.1
      );
      return { a, b, feature: !!road, barrier: !road, setback: road ? ROAD_FACADE_CLEARANCE_METERS : 3 };
    });
    const plan = planOrganicStreetCells(face, outline, boundaries, parameters, doc.recipe.seed, context);
    // The CE street plan lists some streets twice (in the fixed inputs, 61 of 355 at 1,000 people). The mesh
    // editor never noticed; saved records would store, draw and measure them twice.
    plan.streets = withoutRepeatedStreets(plan.streets);
    const district: DistrictPlan = {
      id: districtId,
      outline,
      boundaries: boundaries.map(b => ({ feature: b.feature, barrier: b.barrier, setback: b.setback })),
      streets: plan.streets.map(l => ({ points: l.points, widthMeters: l.widthMeters })),
      mouths: [],
      cells: []
    };
    const streetIndex = new RBush<{ minX: number; minY: number; maxX: number; maxY: number; index: number }>();
    streetIndex.load(district.streets.map((l, index) => ({ ...boxOf(l.points), index })));
    const reach = Math.max(context.streetWidthMeters, settings.laneWidthMeters) + 1;
    for (const cell of plan.cells) {
      const nearby = streetIndex
        .search(boxOf(cell.ring, reach))
        .sort((a, b) => a.index - b.index)
        .map(item => plan.streets[item.index]);
      const local = buildOrganicStreetCell(face, cell, parameters, doc.recipe.seed, context, nearby);
      const lanes = local.lanes.map(l => ({ points: l.points, widthMeters: l.widthMeters }));
      const attachments: CellPlan["attachments"] = [];
      lanes.forEach((lane, laneIndex) => {
        for (const end of [0, 1] as const) {
          const p = end === 0 ? lane.points[0] : lane.points.at(-1)!;
          const street = streetIndex
            .search(boxOf([p], 1e-3))
            .sort((a, b) => a.index - b.index)
            .find(item => nearestOnPolyline(p, district.streets[item.index].points).dist <= 1e-4);
          if (street)
            attachments.push({
              lane: laneIndex,
              end,
              street: street.index,
              t: lineParameter(district.streets[street.index].points, p)
            });
        }
      });
      district.cells.push({ id: cell.id, districtId, ring: cell.ring, lanes, attachments, mouths: [] });
      result.blocks.push(
        ...local.blocks.map((outer, i) => ({
          id: `${cell.id}:parcel:${i}`,
          outer,
          holes: [],
          areaMeters2: regionArea({ outer, holes: [] }),
          frontage: [],
          reachable: true
        }))
      );
      result.houses.push(
        ...local.buildings.map(b => ({
          cellId: cell.id,
          districtId,
          polygon: b.polygon,
          draw: b.occupancyDraw ?? growthRandom(JSON.stringify(b.polygon))
        }))
      );
    }
    result.districts.push(district);
  }
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
  detachedLines: Record<string, VectorFabricDetachedLine[]> = {}
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
  const storeys = residentialStoreys(doc.context.historicalPeriod).standard;
  const occupied = new RBush<{ minX: number; minY: number; maxX: number; maxY: number; polygon: VectorPolygon }>();
  occupied.load(
    [
      ...vectorOccupiedSites(doc, "reserved"),
      ...Object.values(doc.connections.gates).map(g => ({ outer: gateOpening(doc, g), holes: [] }))
    ].map(polygon => ({ ...boxOf(polygon.outer), polygon }))
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
  const adopted = new Map<string, { ring: number[]; dwellings: number; entrance: number[]; draw: number }[]>();
  let capacity = 0,
    count = 0;
  // CE occupancy draws spread vacant lots through every district. A population
  // target must never fill one half of the city before the other half.
  for (const house of plan.houses.slice().sort((a, b) => a.draw - b.draw)) {
    if (capacity >= required && house.draw > keepDraw) break;
    const origin = origins.get(house.cellId);
    if (!origin || cleared[house.cellId]?.includes(house.draw)) continue;
    const ring = packedRing(house.polygon, origin);
    if (!ring) continue;
    const polygon = unpackPoints(ring, origin),
      site = { outer: polygon, holes: [] };
    if (
      occupied
        .search(boxOf(polygon))
        .some(o => regionBoolean([site], [o.polygon], "intersection").some(r => regionArea(r) > 1e-5))
    )
      continue;
    const dwellings = dwellingCapacity(regionArea(site), storeys);
    if (dwellings < 1) continue;
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
    list.push({ ring, dwellings, entrance: packPoints([best.from, best.to], origin), draw: house.draw });
    // CE lots may overlap their neighbours by a few square centimetres; an adopted house is occupancy too, so
    // a later lot never shares land with it and any house can become a placement (S2.1e2).
    occupied.insert({ ...boxOf(polygon), polygon: site });
    adopted.set(house.cellId, list);
    capacity += dwellings;
    count++;
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
          storeys: houses.map(() => storeys),
          dwellings: houses.map(h => h.dwellings),
          entrances: houses.flatMap(h => h.entrance),
          draws: houses.map(h => h.draw)
        },
        detached: [],
        ...(cleared[cell.id]?.length ? { cleared: [...cleared[cell.id]] } : {}),
        ...(detachedLines[cell.id]?.length ? { detachedLines: carried(cell.id, cell.lanes) } : {}),
        inside: inside(polygonCentroid(cell.ring))
      };
      fabricCells[cell.id] = { ...value, hash: fabricCellHash(value) };
    }
  }
  for (const [owner, list] of Object.entries(detachedLines))
    if (list.length && !districts[owner] && !fabricCells[owner])
      throw new Error(`dependency-protected-path:${list[0].pathId}`);
  doc.fabric = { algorithm, districts, cells: fabricCells };
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
  return blocks.flatMap(block =>
    regionBoolean(
      [block],
      index
        .search({
          minX: Math.min(...block.outer.map(p => p[0])),
          minY: Math.min(...block.outer.map(p => p[1])),
          maxX: Math.max(...block.outer.map(p => p[0])),
          maxY: Math.max(...block.outer.map(p => p[1]))
        })
        .map(item => item.polygon),
      "difference"
    ).filter(p => valid(p.outer) && p.holes.every(valid))
  );
}
