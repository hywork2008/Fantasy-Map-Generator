import type { WorldContext } from "../context/worldContext";
import { footprintBounds } from "../services/physicalWaterIndex";
import type { RiverPoint } from "../services/riverGeometry";
import { pointInWater, validWaterPolygon } from "../services/riverPhysicalGeometry";
import { SpatialBoundsIndex } from "../services/spatialBoundsIndex";
import { worldCellRing } from "../services/worldCellGeometry";
import { mapUnitMeters } from "../utils/mapUnitMeters";
import {
  buildLandRouteGraph,
  type LandGuidePatch,
  type LandGuideReference,
  type LandRouteGraphEnvironment,
  type LandRouteGraphResult,
  type LandSharedPortal,
  landGuideNodeId
} from "./dryLandRouteGraph";

export interface WorldDryGuideSettings {
  spacingMeters: number;
  roadWidthMeters: number;
  firstNodeId: number;
  maxCells: number;
  maxVertices: number;
  maxSamples: number;
  maxSourceNodes: number;
  maxSourceEdges: number;
  maxNeighbourChecks: number;
}
export type WorldDryGuideResult =
  | {
      graph: Extract<LandRouteGraphResult, { graph: unknown }>["graph"];
      cityNodeIds: ReadonlyMap<number, number>;
      blockedCityIds: readonly number[];
      samples: number;
      neighbourChecks: number;
    }
  | { reason: string };
/** Build finite per-cell dry navigation patches and explicit shared-edge ports.
 * A wet strip within ONE cell separates guide components. Cell ownership and
 * matching coordinates alone never join them. This is a resolution-bounded guide,
 * not a proof of continuous-plane unreachability or a registered road network.
 * Complete current physical water and full-width support remain required inputs.
 */
export function buildWorldDryLandRouteGraph(
  world: Readonly<WorldContext>,
  unit: string,
  settings: WorldDryGuideSettings,
  cityIds: readonly number[],
  environment: LandRouteGraphEnvironment
): WorldDryGuideResult {
  const s = settings,
    scale = mapUnitMeters(world.distanceScale, unit);
  if (
    ![s.spacingMeters, s.roadWidthMeters, scale].every(v => Number.isFinite(v) && v > 0) ||
    ![s.maxCells, s.maxVertices, s.maxSamples, s.maxSourceNodes, s.maxSourceEdges, s.maxNeighbourChecks].every(
      v => Number.isSafeInteger(v) && v > 0
    ) ||
    !Number.isSafeInteger(s.firstNodeId) ||
    s.firstNodeId < 0 ||
    !Number.isSafeInteger(s.firstNodeId + s.maxSourceNodes) ||
    cityIds.length > s.maxSourceNodes
  )
    return { reason: "invalid-input" };
  const cells = world.pack?.cells,
    positions = world.pack?.vertices?.p;
  if (
    !cells?.i ||
    !cells.h ||
    !cells.v ||
    !positions ||
    cells.i.length !== cells.h.length ||
    cells.i.length !== cells.v.length
  )
    return { reason: "invalid-cell" };
  if (cells.i.length > s.maxCells) return { reason: "cell-budget" };
  const ids = Array.from(cells.i).sort((a, b) => a - b);
  const polygons = new Map<number, RiverPoint[]>();
  const edges = new Map<string, { a: number; b: number; cells: number[] }>();
  let vertices = 0,
    samples = 0,
    nodesCount = 0,
    neighbourChecks = 0,
    sourceEdges = 0;
  for (let slot = 0; slot < ids.length; slot++) {
    const id = ids[slot],
      refs = cells.v[id];
    if (id !== slot || !Number.isFinite(cells.h[id]) || !refs || refs.length < 3) return { reason: "invalid-cell" };
    vertices += refs.length;
    if (vertices > s.maxVertices) return { reason: "vertex-budget" };
    const polygon = worldCellRing(world, id, scale);
    if (!polygon || !validWaterPolygon({ id, rings: [polygon] })) return { reason: "invalid-cell" };
    if (cells.h[id] < 20) continue;
    polygons.set(id, polygon);
    for (let i = 0; i < refs.length; i++) {
      const a = Math.min(refs[i], refs[(i + 1) % refs.length]),
        b = Math.max(refs[i], refs[(i + 1) % refs.length]);
      if (positions[a][0] === positions[b][0] && positions[a][1] === positions[b][1]) continue;
      const key = `${a}:${b}`,
        edge = edges.get(key) ?? { a, b, cells: [] };
      if (edge.cells.includes(id) || edge.cells.length === 2) return { reason: "invalid-topology" };
      edge.cells.push(id);
      edges.set(key, edge);
    }
  }
  const width = world.graphWidth * scale,
    height = world.graphHeight * scale;
  if (![width, height].every(v => Number.isFinite(v) && v > 0)) return { reason: "invalid-input" };
  const currentEnvironment = {
    ...environment,
    supportsDryFootprint: (footprint: readonly RiverPoint[]) =>
      footprint.every(p => p.every(Number.isFinite) && p[0] >= 0 && p[1] >= 0 && p[0] <= width && p[1] <= height) &&
      environment.supportsDryFootprint(footprint)
  };
  const dry = (point: RiverPoint) => {
    const h = s.roadWidthMeters / 2;
    const footprint: RiverPoint[] = [
      [point[0] - h, point[1] - h],
      [point[0] + h, point[1] - h],
      [point[0] + h, point[1] + h],
      [point[0] - h, point[1] + h]
    ];
    return (
      footprint.every(p => p[0] >= 0 && p[1] >= 0 && p[0] <= width && p[1] <= height) &&
      !environment.water.touchesWater(footprint) &&
      environment.supportsDryFootprint(footprint)
    );
  };
  type Node = { id: number; point: RiverPoint; neighbors: number[] };
  const patches = new Map<number, { id: number; cellId: number; nodes: Node[] }>();
  for (const id of polygons.keys()) patches.set(id, { id, cellId: id, nodes: [] });
  const add = (id: number, point: RiverPoint): LandGuideReference | null => {
    if (++samples > s.maxSamples) throw new RangeError("sample-budget");
    if (!dry(point)) return null;
    if (++nodesCount > s.maxSourceNodes) throw new RangeError("graph-budget");
    const patch = patches.get(id)!;
    const node = { id: patch.nodes.length, point, neighbors: [] };
    patch.nodes.push(node);
    return { patchId: id, nodeId: node.id };
  };
  const portals: LandSharedPortal[] = [],
    cityRefs = new Map<number, LandGuideReference>(),
    blockedCityIds: number[] = [];
  const polygonIndex = new SpatialBoundsIndex([...polygons], ([, polygon]) => footprintBounds(polygon)!);
  try {
    // Stable global lattice. Retain only nodes whose centres lie inside this cell;
    // full road width may occupy adjacent permitted cells and is checked by dry().
    for (const [id, polygon] of polygons) {
      const b = footprintBounds(polygon)!;
      const loX = Math.ceil(Math.max(0, b.minX) / s.spacingMeters),
        hiX = Math.floor(Math.min(width, b.maxX) / s.spacingMeters);
      const loY = Math.ceil(Math.max(0, b.minY) / s.spacingMeters),
        hiY = Math.floor(Math.min(height, b.maxY) / s.spacingMeters);
      const count = Math.max(0, hiX - loX + 1) * Math.max(0, hiY - loY + 1);
      if (!Number.isSafeInteger(count) || count > s.maxSamples - samples) return { reason: "sample-budget" };
      for (let x = loX; x <= hiX; x++)
        for (let y = loY; y <= hiY; y++) {
          const point: RiverPoint = [x * s.spacingMeters, y * s.spacingMeters];
          if (pointInWater(point, { id, rings: [polygon] })) add(id, point);
          else if (++samples > s.maxSamples) return { reason: "sample-budget" };
        }
    }
    for (const edge of [...edges.values()].sort((a, b) => a.a - b.a || a.b - b.b)) {
      if (edge.cells.length !== 2) continue;
      const a = positions[edge.a],
        b = positions[edge.b];
      const count = Math.max(1, Math.ceil((Math.hypot(b[0] - a[0], b[1] - a[1]) * scale) / s.spacingMeters));
      if (!Number.isSafeInteger(count) || count * 2 > s.maxSamples - samples) return { reason: "sample-budget" };
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const point: RiverPoint = [(a[0] + (b[0] - a[0]) * t) * scale, (a[1] + (b[1] - a[1]) * t) * scale];
        const members = edge.cells.map(id => add(id, [...point])).filter((ref): ref is LandGuideReference => !!ref);
        if (members.length === 2) portals.push({ id: portals.length, members });
        else if (members.length) return { reason: "changed-environment" };
      }
    }
    if (new Set(cityIds).size !== cityIds.length) return { reason: "invalid-city" };
    for (const cityId of [...cityIds].sort((a, b) => a - b)) {
      const city = world.pack.burgs?.[cityId];
      if (
        !Number.isSafeInteger(cityId) ||
        cityId <= 0 ||
        !city ||
        city.i !== cityId ||
        city.removed ||
        ![city.x, city.y].every(Number.isFinite)
      )
        return { reason: "invalid-city" };
      const point: RiverPoint = [city.x * scale, city.y * scale];
      // administrative burg.cell is deliberately not used for physical ownership.
      const owner = polygonIndex
        .query({ minX: point[0], maxX: point[0], minY: point[1], maxY: point[1] })
        .find(([id, polygon]) => pointInWater(point, { id, rings: [polygon] }));
      const reference = owner ? add(owner[0], point) : null;
      if (reference) cityRefs.set(cityId, reference);
      else blockedCityIds.push(cityId);
    }
    // Nearby buckets bound connector work; only same-patch connections are proposed.
    // buildLandRouteGraph rechecks every complete segment, including square caps.
    const radius = s.spacingMeters * 1.5;
    for (const patch of patches.values()) {
      const buckets = new Map<string, Node[]>();
      for (const node of patch.nodes) {
        const bx = Math.floor(node.point[0] / radius),
          by = Math.floor(node.point[1] / radius);
        for (let x = bx - 1; x <= bx + 1; x++)
          for (let y = by - 1; y <= by + 1; y++) {
            for (const other of buckets.get(`${x}:${y}`) ?? []) {
              if (++neighbourChecks > s.maxNeighbourChecks) return { reason: "neighbour-budget" };
              const distance = Math.hypot(other.point[0] - node.point[0], other.point[1] - node.point[1]);
              if (distance === 0 || distance > radius) continue;
              sourceEdges += 2;
              if (sourceEdges > s.maxSourceEdges) return { reason: "graph-budget" };
              node.neighbors.push(other.id);
              other.neighbors.push(node.id);
            }
          }
        const key = `${bx}:${by}`,
          bucket = buckets.get(key) ?? [];
        bucket.push(node);
        buckets.set(key, bucket);
      }
    }
  } catch (error) {
    if (error instanceof RangeError && ["sample-budget", "graph-budget"].includes(error.message))
      return { reason: error.message };
    throw error;
  }
  const built = buildLandRouteGraph({
    patches: [...patches.values()] as LandGuidePatch[],
    portals,
    roadWidthMeters: s.roadWidthMeters,
    firstNodeId: s.firstNodeId,
    maxSourceNodes: s.maxSourceNodes,
    maxSourceEdges: s.maxSourceEdges,
    environment: currentEnvironment
  });
  if (!("graph" in built)) return built;
  const cityNodeIds = new Map<number, number>();
  for (const [cityId, reference] of cityRefs) cityNodeIds.set(cityId, landGuideNodeId(built.graph, reference)!);
  return { graph: built.graph, cityNodeIds, blockedCityIds: Object.freeze(blockedCityIds), samples, neighbourChecks };
}
