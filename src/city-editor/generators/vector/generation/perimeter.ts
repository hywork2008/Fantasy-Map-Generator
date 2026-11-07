import RBush from "rbush";
import { growthRandom, residentialStoreys } from "../../../../utils/urbanMorphology";
import type { Face, Point } from "../../../types/document";
import type { CurveAnchor, VectorCityDocument, VectorPlacement } from "../../../types/vector/document";
import type { VectorBlock } from "../../../types/vector/generation";
import type { VectorUrbanSettings } from "../../../types/vector/urban";
import { nearestOnPolyline, polygonCentroid } from "../../geom";
import { buildOrganicBlocks } from "../../organicBlocks";
import { dwellingCapacity } from "../../residentialCapacityFormula";
import { curveSource } from "../editing/paths";
import { evaluateAnchor } from "../geometry/curves";
import { gateOpening } from "../geometry/network";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { samplePath, simplifyFreehand } from "../geometry/sampling";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { joinVectorGenerationAnchors } from "./pipeline";
import { nearestRoadAnchor } from "./urbanPacking";

export const PERIMETER_HOUSE_MODEL = "ce-perimeter-house";
export function planVectorPerimeter(doc: VectorCityDocument, blocks: VectorBlock[], settings: VectorUrbanSettings) {
  const primary = Object.values(doc.paths).filter(p => p.role === "road");
  const primarySamples = primary.map(path => ({ path, points: samplePath(path).map(p => p.point) }));
  const paths: string[] = [],
    houses: { polygon: Point[]; district: string; draw?: number }[] = [],
    parcels: VectorBlock[] = [];
  const water = allVectorWater(doc);
  for (const sourceBlock of blocks) {
    const block = {
      ...sourceBlock,
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
      const road = primarySamples.find(
        p => nearestOnPolyline(mid, p.points).dist <= p.path.width.leftMeters + p.path.width.rightMeters + 0.1
      );
      return { a, b, feature: !!road, barrier: !road, setback: road ? 0.05 : 3 };
    });
    const fabric = buildOrganicBlocks(
      face,
      block.outer,
      boundaries,
      { coverage: 0.9, occupancy: 1, lotArea: 80, laneWidth: settings.laneWidthMeters, orientation: 0 },
      doc.recipe.seed,
      true,
      { hub: doc.site!.center, extentMeters: doc.frame.extentMeters, walls: [] }
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
  const junctions = new Map<string, CurveAnchor[]>();
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
      const road = primarySamples
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
      joinVectorGenerationAnchors(doc, [target, { pathId: connector, segmentId: "segment:0", t: 1 }]);
    }
  }
  for (const anchors of junctions.values()) if (anchors.length > 1) joinVectorGenerationAnchors(doc, anchors);
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
    ...Object.values(doc.placements).flatMap(p => p.building?.reserved ?? [p.site]),
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
  for (const p of Object.values(doc.placements))
    for (const polygon of p.building?.reserved ?? [p.site])
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
