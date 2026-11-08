import RBush from "rbush";
import { growthRandom, residentialStoreys } from "../../../../utils/urbanMorphology";
import type { InfillLane } from "../../../types/contracts/localInfill";
import type { DistrictParameters, Face, Point } from "../../../types/document";
import type { CurveAnchor, VectorCityDocument, VectorPlacement } from "../../../types/vector/document";
import type { VectorBlock } from "../../../types/vector/generation";
import type { VectorUrbanSettings } from "../../../types/vector/urban";
import { nearestOnPolyline, polygonCentroid } from "../../geom";
import {
  buildOrganicStreetCell,
  COARSE_STREET_CELL_METERS,
  COARSE_STREET_WIDTH_METERS,
  joinOrganicStreetVertices,
  type OrganicBlockContext,
  planOrganicStreetCells,
  ROAD_FACADE_CLEARANCE_METERS
} from "../../organicBlocks";
import { dwellingCapacity } from "../../residentialCapacityFormula";
import type { BlockBoundary, PerimeterFabric } from "../../streetBlockGeometry";
import { createGenerationJoiner } from "../editing/network";
import { curveSource } from "../editing/paths";
import { evaluateAnchor } from "../geometry/curves";
import { gateOpening } from "../geometry/network";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { samplePath, simplifyFreehand } from "../geometry/sampling";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { vectorOccupiedSites } from "../occupancy";
import { vectorDistrictId } from "./districtId";
import { nearestRoadAnchor } from "./urbanPacking";

export const PERIMETER_HOUSE_MODEL = "ce-perimeter-house";
export function planVectorPerimeter(doc: VectorCityDocument, blocks: VectorBlock[], settings: VectorUrbanSettings) {
  const primary = Object.values(doc.paths).filter(p => p.role === "road");
  const primarySamples = primary.map(path => ({ path, points: samplePath(path).map(p => p.point) }));
  // Bounding boxes only narrow candidates; the original per-road tests and road order still decide.
  const primaryIndex = new RBush<{ minX: number; minY: number; maxX: number; maxY: number; index: number }>();
  primaryIndex.load(
    primarySamples.map((r, index) => ({
      minX: Math.min(...r.points.map(p => p[0])),
      minY: Math.min(...r.points.map(p => p[1])),
      maxX: Math.max(...r.points.map(p => p[0])),
      maxY: Math.max(...r.points.map(p => p[1])),
      index
    }))
  );
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
  const paths: string[] = [],
    houses: { polygon: Point[]; district: string; draw?: number }[] = [],
    parcels: VectorBlock[] = [];
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
  const districtIds = new Set<string>();
  for (const sourceBlock of blocks) {
    // Blocks never coincide, but a collision must not merge two districts' random streams.
    let districtId = vectorDistrictId(sourceBlock);
    for (let n = 2; districtIds.has(districtId); n++) districtId = `${vectorDistrictId(sourceBlock)}:${n}`;
    districtIds.add(districtId);
    const block = {
      ...sourceBlock,
      id: districtId,
      outer: simplifyFreehand([...sourceBlock.outer, sourceBlock.outer[0]], 0.05).slice(0, -1)
    };
    if (!block.reachable || block.holes.length) continue;
    const face: Face = {
      id: block.id,
      boundary: [],
      properties: { elevation: 1, water: "land", ward: "craftsmen", buildable: true, locked: false }
    };
    const boundaries = block.outer.map((a, i) => {
      const b = block.outer[(i + 1) % block.outer.length],
        mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const road = roadsNear(mid, frontageReach).find(
        p => nearestOnPolyline(mid, p.points).dist <= p.path.width.leftMeters + p.path.width.rightMeters + 0.1
      );
      return { a, b, feature: !!road, barrier: !road, setback: road ? ROAD_FACADE_CLEARANCE_METERS : 3 };
    });
    const fabric = buildDistrictFabric(
      face,
      block.outer,
      boundaries,
      { coverage: 0.9, occupancy: 1, lotArea: 80, laneWidth: settings.laneWidthMeters, orientation: 0 },
      doc.recipe.seed,
      {
        hub: doc.site!.center,
        extentMeters: doc.frame.extentMeters,
        walls: wallSegments,
        // Skeleton blocks are far coarser than a CE mesh cell, so CE's coarse-mesh street blocks apply.
        streetCellMeters: COARSE_STREET_CELL_METERS,
        streetWidthMeters: COARSE_STREET_WIDTH_METERS
      }
    );
    const addLane = (points: Point[], width: number) => {
      const id = `urban-lane:${paths.length}`;
      const lane = {
        id,
        revision: 0,
        role: "road" as const,
        origin: "automatic" as const,
        editPolicy: "editable" as const,
        source: curveSource(points, "polyline", false),
        width: { leftMeters: width / 2, rightMeters: width / 2, stations: [] }
      };
      try {
        pathSurface(lane);
      } catch (error) {
        if (points.length <= 2) throw error;
        for (let i = 1; i < points.length; i++)
          if (Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]) > 0.01)
            addLane([points[i - 1], points[i]], width);
        return;
      }
      doc.paths[id] = lane;
      paths.push(id);
    };
    for (const lane of mergeLaneChains(fabric.lanes)) addLane(lane.points, lane.widthMeters);
    parcels.push(
      ...fabric.blocks.map((outer, i) => ({
        id: `${block.id}:parcel:${i}`,
        outer,
        holes: [],
        areaMeters2: regionArea({ outer, holes: [] }),
        frontage: [],
        reachable: true
      }))
    );
    houses.push(
      ...fabric.buildings.map(b => ({
        polygon: b.polygon,
        district: block.id,
        draw: b.occupancyDraw ?? growthRandom(JSON.stringify(b.polygon))
      }))
    );
  }
  // CE already inserts shared T junction vertices. Keep those exact points as native road nodes.
  const junctions = new Map<string, CurveAnchor[]>(),
    joiner = createGenerationJoiner(doc);
  const key = (p: Point) => `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)}`;
  for (const id of [...paths]) {
    const path = doc.paths[id];
    if (path.source.kind !== "curve") continue;
    const ends = [
      { pathId: id, segmentId: path.source.segments[0].id, t: 0 },
      { pathId: id, segmentId: path.source.segments.at(-1)!.id, t: 1 }
    ];
    for (const anchor of ends) {
      const p = evaluateAnchor(path, anchor),
        list = junctions.get(key(p)) ?? [];
      list.push(anchor);
      junctions.set(key(p), list);
      const road = roadsNear(p, endpointReach)
        .map(r => ({ ...r, near: nearestOnPolyline(p, r.points) }))
        .sort((a, b) => a.near.dist - b.near.dist)[0];
      if (
        !road ||
        road.near.dist >
          Math.max(road.path.width.leftMeters, road.path.width.rightMeters) + settings.laneWidthMeters / 2 + 0.7
      )
        continue;
      const target = nearestRoadAnchor(road.path, p),
        end = evaluateAnchor(road.path, target);
      if (
        Object.values(doc.connections.gates).some(g => {
          const center = evaluateAnchor(doc.paths[g.wallPathId], g.anchor);
          return Math.hypot(end[0] - center[0], end[1] - center[1]) < g.widthMeters * 2;
        })
      )
        continue;
      if (Math.hypot(end[0] - p[0], end[1] - p[1]) < 1e-6) {
        list.push(target);
        continue;
      }
      const connector = `urban-lane:${paths.length}`;
      const route = {
        id: connector,
        revision: 0,
        role: "road" as const,
        origin: "automatic" as const,
        editPolicy: "editable" as const,
        source: curveSource([p, end], "polyline", false),
        width: { leftMeters: settings.laneWidthMeters / 2, rightMeters: settings.laneWidthMeters / 2, stations: [] }
      };
      if (regionBoolean([pathSurface(route)], water, "intersection").some(r => regionArea(r) > 1e-5)) continue;
      doc.paths[connector] = route;
      paths.push(connector);
      list.push({ pathId: connector, segmentId: "segment:0", t: 0 });
      joiner.join([target, { pathId: connector, segmentId: "segment:0", t: 1 }]);
    }
  }
  for (const anchors of junctions.values()) if (anchors.length > 1) joiner.join(anchors);
  return { paths, houses, blocks: parcels };
}

export function placeVectorPerimeterHouses(
  doc: VectorCityDocument,
  houses: { polygon: Point[]; district: string; draw?: number }[],
  required: number
) {
  const roads = Object.values(doc.paths)
    .filter(p => p.role === "road")
    .map(path => ({ path, samples: samplePath(path) }));
  const roadIndex = new RBush<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    road: (typeof roads)[number];
  }>();
  roadIndex.load(
    roads.map(road => ({
      minX: Math.min(...road.samples.map(s => s.point[0])),
      minY: Math.min(...road.samples.map(s => s.point[1])),
      maxX: Math.max(...road.samples.map(s => s.point[0])),
      maxY: Math.max(...road.samples.map(s => s.point[1])),
      road
    }))
  );
  const ids: string[] = [];

  const storeys = residentialStoreys(doc.context.historicalPeriod).standard;
  const occupied = [
    ...vectorOccupiedSites(doc, "reserved"),
    ...Object.values(doc.connections.gates).map(g => ({ outer: gateOpening(doc, g), holes: [] }))
  ];
  let capacity = 0;
  // CE occupancy draws spread vacant lots through every district. A population
  // target must never fill one half of the city before the other half.
  for (const house of houses.slice().sort((a, b) => (a.draw ?? 0) - (b.draw ?? 0))) {
    if (capacity >= required) break;
    const site = { outer: house.polygon, holes: [] };
    if (regionBoolean([site], occupied, "intersection").some(r => regionArea(r) > 1e-5)) continue;
    const center = polygonCentroid(house.polygon),
      floor = regionArea(site),
      dwellings = dwellingCapacity(floor, storeys);
    if (dwellings < 1) continue;
    const near = roadIndex
      .search({
        minX: Math.min(...house.polygon.map(p => p[0])) - 20,
        minY: Math.min(...house.polygon.map(p => p[1])) - 20,
        maxX: Math.max(...house.polygon.map(p => p[0])) + 20,
        maxY: Math.max(...house.polygon.map(p => p[1])) + 20
      })
      .map(item => item.road);
    const candidates = house.polygon
      .map((a, i) => {
        const b = house.polygon[(i + 1) % house.polygon.length];
        const point: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        const road = near
          .map(r => {
            const anchor = nearestRoadAnchor(r.path, point, r.samples),
              end = evaluateAnchor(r.path, anchor);
            return { anchor, end, distance: Math.hypot(end[0] - point[0], end[1] - point[1]) };
          })
          .sort((a, b) => a.distance - b.distance)[0];
        return { point, road };
      })
      .sort((a, b) => (a.road?.distance ?? Infinity) - (b.road?.distance ?? Infinity));
    const entry = candidates[0];
    if (!entry?.road) continue;
    const point: Point = [
      entry.point[0] + (center[0] - entry.point[0]) * 0.001,
      entry.point[1] + (center[1] - entry.point[1]) * 0.001
    ];
    if (!containsRegion([site], point)) continue;
    const d = Math.hypot(entry.road.end[0] - point[0], entry.road.end[1] - point[1]);
    if (d < 0.001) continue;
    const outward: Point = [(entry.road.end[0] - point[0]) / d, (entry.road.end[1] - point[1]) / d];
    const id = `urban:perimeter:${ids.length}`;
    const placement: VectorPlacement = {
      id,
      modelId: PERIMETER_HOUSE_MODEL,
      position: center,
      facingDegrees: 0,
      origin: "automatic",
      editPolicy: "editable",
      site,
      accesses: [entry.road.anchor],
      building: {
        kind: "housing",
        label: "CE perimeter house",
        districtId: house.district,
        provenance: "provisional",
        dimensionSource: "CE organicBlocks / perimeterHousing",
        footprint: [site],
        reserved: [site],
        entrances: [
          { id: "main", point, outward, widthMeters: 1.1, connector: [point, entry.road.end], accessIndex: 0 }
        ],
        dwellings,
        floorFootprintMeters2: floor,
        storeys,
        residentialShare: 0.85,
        heightMeters: storeys * 3.2
      }
    };
    doc.placements[id] = placement;
    ids.push(id);
    capacity += dwellings;
  }
  return ids;
}

/** CE's coarse-district layout split in two: the street blocks of the district first, then each street block
 * on its own random stream. One street block bounds the cost of a layout step and is the future unit of
 * records and parallel generation. */
function buildDistrictFabric(
  face: Face,
  outline: Point[],
  boundaries: BlockBoundary[],
  parameters: DistrictParameters,
  seed: string,
  context: OrganicBlockContext & { streetCellMeters: number }
) {
  const plan = planOrganicStreetCells(face, outline, boundaries, parameters, seed, context);
  const streetIndex = new RBush<{ minX: number; minY: number; maxX: number; maxY: number; lane: InfillLane }>();
  streetIndex.load(
    plan.streets.map(lane => ({
      minX: Math.min(...lane.points.map(p => p[0])),
      minY: Math.min(...lane.points.map(p => p[1])),
      maxX: Math.max(...lane.points.map(p => p[0])),
      maxY: Math.max(...lane.points.map(p => p[1])),
      lane
    }))
  );
  const reach = Math.max(context.streetWidthMeters ?? 0, parameters.laneWidth ?? 0) + 1;
  const lanes: InfillLane[] = [],
    buildings: PerimeterFabric["buildings"] = [],
    blocks: Point[][] = [];
  for (const cell of plan.cells) {
    const xs = cell.ring.map(p => p[0]),
      ys = cell.ring.map(p => p[1]);
    const nearby = streetIndex
      .search({
        minX: Math.min(...xs) - reach,
        minY: Math.min(...ys) - reach,
        maxX: Math.max(...xs) + reach,
        maxY: Math.max(...ys) + reach
      })
      .map(item => item.lane);
    const local = buildOrganicStreetCell(face, cell, parameters, seed, context, nearby);
    lanes.push(...local.lanes);
    buildings.push(...local.buildings);
    blocks.push(...local.blocks);
  }
  return { lanes: joinOrganicStreetVertices([...plan.streets, ...lanes]), buildings, blocks };
}

/** Keep bends as editable vertices, while junctions remain separate street ends. */
function mergeLaneChains(lanes: { points: Point[]; widthMeters: number }[]) {
  const key = (p: Point) => `${Math.round(p[0] * 1e5)},${Math.round(p[1] * 1e5)}`;
  const edges = lanes.map(l => ({ ...l, a: key(l.points[0]), b: key(l.points.at(-1)!) }));
  const nodes = new Map<string, number[]>();
  edges.forEach((e, i) => {
    for (const p of [e.a, e.b]) {
      const ids = nodes.get(p) ?? [];
      ids.push(i);
      nodes.set(p, ids);
    }
  });
  const used = new Set<number>(),
    result: { points: Point[]; widthMeters: number }[] = [];
  const walk = (first: number, from: string) => {
    const points: Point[] = [];
    let index = first,
      node = from;
    while (!used.has(index)) {
      const edge = edges[index];
      used.add(index);
      const ordered = edge.a === node ? edge.points : edge.points.slice().reverse();
      points.push(...(points.length ? ordered.slice(1) : ordered));
      node = edge.a === node ? edge.b : edge.a;
      const adjacent = nodes.get(node)!;
      if (adjacent.length !== 2) break;
      const next = adjacent.find(i => !used.has(i));
      if (next === undefined || edges[next].widthMeters !== edge.widthMeters) break;
      index = next;
    }
    if (key(points[0]) === key(points.at(-1)!)) {
      const middle = Math.floor(points.length / 2);
      result.push(
        { points: points.slice(0, middle + 1), widthMeters: edges[first].widthMeters },
        { points: points.slice(middle), widthMeters: edges[first].widthMeters }
      );
    } else result.push({ points, widthMeters: edges[first].widthMeters });
  };
  edges.forEach((e, i) => {
    if (!used.has(i) && (nodes.get(e.a)!.length !== 2 || nodes.get(e.b)!.length !== 2))
      walk(i, nodes.get(e.a)!.length !== 2 ? e.a : e.b);
  });
  edges.forEach((e, i) => {
    if (!used.has(i)) walk(i, e.a);
  });
  return result;
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
    )
  );
}
