import { historicalPeriodIndex } from "../../types/historicalPeriod";
import type { InfillLane } from "../types/contracts/localInfill";
import type { HistoricalPeriod, Point } from "../types/document";
import { nearestOnPolyline, polygonArea } from "./geom";
import type { FarmPlot } from "./localInfill.types";
import { convexInfillParts } from "./lotGeometry";
import { bounds, boundsOverlap, corridor, intersectConvex, PlotIndex } from "./parcelGeometry";

export interface RuralFieldInput {
  seed: string;
  land: { faceId: string; polygon: Point[] }[];
  roads: { points: Point[]; widthMeters: number }[];
  period?: HistoricalPeriod;
  areaBudgetM2?: number;
  /** Tests the whole footprint, including water, buildings and defence reservations. */
  blocked(polygon: Point[]): boolean;
}

export interface RuralFieldPlan {
  farms: FarmPlot[];
  lanes: InfillLane[];
  diagnostics: import("../types/contracts/ruralFields").RuralFieldDiagnostics;
}

type Cell = { x: number; y: number; point: Point; arable: boolean; parent?: string; road?: Point };
const key = (x: number, y: number) => `${x}:${y}`;
const adjacent = (cell: Cell) => [
  [cell.x - 1, cell.y],
  [cell.x + 1, cell.y],
  [cell.x, cell.y - 1],
  [cell.x, cell.y + 1]
];
const area = (polygon: Point[]) => Math.abs(polygonArea(polygon));
const rect = (x: number, y: number, w: number, h: number): Point[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h]
];

/** A survey lattice belongs to the countryside, not to the city mesh. Full-square
 * coverage is measured across all land pieces, so cell diagonals disappear while
 * holes and water remain impassable. Access is reserved before placing fields. */
export function planRuralFields(input: RuralFieldInput): RuralFieldPlan {
  let cosine = 0,
    sine = 0;
  for (const road of input.roads)
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1],
        b = road.points[i];
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
      cosine += length * Math.cos(angle * 4);
      sine += length * Math.sin(angle * 4);
    }
  // A five-degree survey frame follows dominant physical roads, independently
  // of how those roads or the underlying land are split into mesh edges.
  const angle =
    Math.hypot(cosine, sine) < 1e-6 ? 0 : (Math.round(Math.atan2(sine, cosine) / 4 / (Math.PI / 36)) * Math.PI) / 36;
  if (Math.abs(angle) < 1e-8) return planAlignedRuralFields(input);
  const rotate = (point: Point, radians: number): Point => [
    point[0] * Math.cos(radians) - point[1] * Math.sin(radians),
    point[0] * Math.sin(radians) + point[1] * Math.cos(radians)
  ];
  const local = (point: Point) => rotate(point, -angle);
  const world = (point: Point) => rotate(point, angle);
  const plan = planAlignedRuralFields({
    ...input,
    land: input.land.map(face => ({ ...face, polygon: face.polygon.map(local) })),
    roads: input.roads.map(road => ({ ...road, points: road.points.map(local) })),
    blocked: polygon => input.blocked(polygon.map(world))
  });
  return {
    ...plan,
    farms: plan.farms.map(farm => ({
      ...farm,
      polygon: farm.polygon.map(world),
      rows: farm.rows.map(row => row.map(world))
    })),
    lanes: plan.lanes.map(lane => ({ ...lane, points: lane.points.map(world) })),
    diagnostics: { ...plan.diagnostics, orientationRadians: angle }
  };
}

function planAlignedRuralFields(input: RuralFieldInput): RuralFieldPlan {
  const budget =
    input.areaBudgetM2 === undefined
      ? undefined
      : Math.max(0, Number.isFinite(input.areaBudgetM2) ? input.areaBudgetM2 : 0);
  const result: RuralFieldPlan = {
    farms: [],
    lanes: [],
    diagnostics: {
      requestedAreaM2: budget,
      candidateAreaM2: 0,
      reachableAreaM2: 0,
      cultivatedAreaM2: 0,
      shortfallAreaM2: budget ?? 0,
      orientationRadians: 0,
      gridMeters: 8
    }
  };
  if (!input.land.length || !input.roads.length || budget === 0) return result;
  const land = input.land.flatMap(face =>
    convexInfillParts(face.polygon).map(polygon => ({ faceId: face.faceId, polygon, box: bounds(polygon) }))
  );
  if (!land.length) return result;
  const index = new PlotIndex<(typeof land)[number]>();
  for (const part of land) index.add(part, part.box);
  const box = bounds(land.flatMap(part => part.polygon));
  const extentArea = (box[2] - box[0]) * (box[3] - box[1]);
  // Bound work for very wide imported frames. The lattice is anchored at world zero.
  const quantum = Math.max(8, Math.ceil(Math.sqrt(extentArea / 60_000) / 2) * 2);
  result.diagnostics.gridMeters = quantum;
  const period = historicalPeriodIndex(input.period ?? "ageOfExploration");
  const mechanized = period >= historicalPeriodIndex("petroleumEra");
  const enclosed = period >= historicalPeriodIndex("steamEra");
  const across = mechanized ? 8 : enclosed ? 6 : 4;
  const maxLength = Math.max(4, Math.round((mechanized ? 320 : enclosed ? 200 : 144) / quantum));
  const minLength = Math.max(2, Math.ceil((mechanized ? 36 : 24) / quantum));
  const width = mechanized ? 4 : 2.8;
  const phase = [...input.seed].reduce((n, c) => (n * 33 + c.charCodeAt(0)) >>> 0, 5381) % (across + 1);
  const isHeadland = (y: number) => ((y % (across + 1)) + across + 1) % (across + 1) === phase;
  const roads = input.roads.flatMap(road =>
    road.points.slice(1).flatMap((b, i) => {
      const a = road.points[i];
      const band = corridor(a, b, road.widthMeters + 2, road.widthMeters / 2 + 1);
      return band.length ? [{ points: [a, b], widthMeters: road.widthMeters, polygon: band, box: bounds(band) }] : [];
    })
  );
  const roadIndex = new PlotIndex<(typeof roads)[number]>();
  for (const road of roads) roadIndex.add(road, road.box);
  const cells = new Map<string, Cell>();
  const queue: string[] = [];
  for (let y = Math.floor(box[1] / quantum); y < Math.ceil(box[3] / quantum); y++) {
    for (let x = Math.floor(box[0] / quantum); x < Math.ceil(box[2] / quantum); x++) {
      const polygon = rect(x * quantum, y * quantum, quantum, quantum);
      const cellBox = bounds(polygon);
      const covered = index
        .query(cellBox)
        .reduce(
          (sum, part) => sum + (boundsOverlap(part.box, cellBox) ? area(intersectConvex(polygon, part.polygon)) : 0),
          0
        );
      if (covered < quantum * quantum - 0.01 || input.blocked(polygon)) continue;
      const point: Point = [(x + 0.5) * quantum, (y + 0.5) * quantum];
      const nearby = roadIndex.query([
        point[0] - quantum * 2,
        point[1] - quantum * 2,
        point[0] + quantum * 2,
        point[1] + quantum * 2
      ]);
      const arable = !nearby.some(road => area(intersectConvex(polygon, road.polygon)) > 0.01);
      const cell: Cell = { x, y, point, arable };
      const id = key(x, y);
      cells.set(id, cell);
      if (arable) result.diagnostics.candidateAreaM2 += quantum * quantum;
      const nearest = nearby
        .map(road => ({ road, hit: nearestOnPolyline(point, road.points) }))
        .sort((a, b) => a.hit.dist - b.hit.dist)[0];
      if (!nearest || nearest.hit.dist > quantum + nearest.road.widthMeters / 2) continue;
      // A connector can leave the rural face to meet its bordering street,
      // but must still clear every physical reservation, including water.
      const target = nearest.hit.point;
      if (nearest.hit.dist > 0.01 && input.blocked(corridor(point, target, width, width / 2))) continue;
      cell.road = target;
      queue.push(id);
    }
  }
  // Multi-source traversal proves physical access without inventing a bridge.
  const reachable = new Set(queue);
  const depth = new Map(queue.map(id => [id, 0]));
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i],
      cell = cells.get(id)!;
    if (cell.arable) result.diagnostics.reachableAreaM2 += quantum * quantum;
    for (const [x, y] of adjacent(cell)) {
      const nextId = key(x, y),
        next = cells.get(nextId);
      if (!next || reachable.has(nextId)) continue;
      next.parent = id;
      depth.set(nextId, depth.get(id)! + 1);
      reachable.add(nextId);
      queue.push(nextId);
    }
  }
  const headlandIds = queue.filter(id => isHeadland(cells.get(id)!.y));
  const access = new Set(headlandIds);
  const trunks = new Set<string>();
  // Each continuous headland needs one connection, not a separate track for
  // every square (which would consume all the land between the headlands).
  for (const id of headlandIds) {
    const first = cells.get(id)!;
    if (access.has(key(first.x - 1, first.y))) continue;
    let best = id;
    for (let x = first.x; access.has(key(x, first.y)); x++) {
      const candidate = key(x, first.y);
      if (depth.get(candidate)! < depth.get(best)!) best = candidate;
    }
    for (
      let current: string | undefined = best;
      current && !trunks.has(current);
      current = cells.get(current)?.parent
    ) {
      trunks.add(current);
      access.add(current);
    }
  }
  // Re-root the shared network. Its paths now follow headlands and trunks,
  // rather than the original search tree across the cultivable interior.
  const accessQueue = [...access].filter(id => cells.get(id)!.road);
  const accessReachable = new Set(accessQueue);
  const accessParent = new Map<string, string>();
  for (let i = 0; i < accessQueue.length; i++) {
    const id = accessQueue[i];
    for (const [x, y] of adjacent(cells.get(id)!)) {
      const next = key(x, y);
      if (!access.has(next) || accessReachable.has(next)) continue;
      accessReachable.add(next);
      accessParent.set(next, id);
      accessQueue.push(next);
    }
  }
  const usedAccess = new Set<string>();
  const remaining = new Set(queue.filter(id => cells.get(id)!.arable && !access.has(id)));
  const usable = (x: number, y: number) =>
    Array.from({ length: across }, (_, i) => key(x, y + i)).every(id => remaining.has(id));
  const headlands = queue
    .filter(id => isHeadland(cells.get(id)!.y) && accessReachable.has(id))
    .sort((a, b) => {
      const ap = cells.get(a)!.point,
        bp = cells.get(b)!.point;
      return Math.hypot(...ap) - Math.hypot(...bp) || a.localeCompare(b);
    });
  let available = budget ?? Infinity;
  for (const accessId of headlands) {
    const start = cells.get(accessId)!;
    const y = start.y + 1,
      x = start.x;
    if (!usable(x, y)) continue;
    let count = 0;
    while (count < maxLength && usable(x + count, y) && access.has(key(x + count, start.y))) count++;
    if (count < minLength) continue;
    const height = across * quantum - 1;
    const length = Math.min(count * quantum - 1, available / height);
    if (length < minLength * quantum - 1) continue;
    const polygon = rect(x * quantum + 0.5, y * quantum + 0.5, length, height);
    const sources = [
      ...new Set(
        index
          .query(bounds(polygon))
          .filter(part => area(intersectConvex(polygon, part.polygon)) > 0.01)
          .map(part => part.faceId)
      )
    ].sort();
    if (!sources.length) continue;
    const rows: Point[][] = [];
    for (let row = mechanized ? 6 : 4; row < height - 1; row += mechanized ? 6 : 4)
      rows.push([
        [polygon[0][0] + 1, polygon[0][1] + row],
        [polygon[1][0] - 1, polygon[0][1] + row]
      ]);
    result.farms.push({
      faceId: sources[0],
      sourceFaceIds: sources,
      plotId: `rural-v1:${x}:${y}`,
      polygon,
      rows,
      kind: "open-field"
    });
    result.lanes.push({
      faceId: sources[0],
      points: [
        [(x + 0.5) * quantum, start.point[1]],
        [(x + Math.ceil((length + 1) / quantum) - 0.5) * quantum, start.point[1]]
      ],
      widthMeters: quantum - 1,
      kind: "headland"
    });
    available -= length * height;
    for (let dx = 0; dx < Math.ceil((length + 1) / quantum); dx++)
      for (let dy = 0; dy < across; dy++) remaining.delete(key(x + dx, y + dy));
    // Retain only paths serving an adopted plot; distant unselected bands do
    // not acquire roads merely because the frame is large.
    for (
      let current: string | undefined = accessId;
      current && !usedAccess.has(current);
      current = accessParent.get(current)
    )
      usedAccess.add(current);
  }
  const owner = (point: Point) => {
    const polygon = rect(point[0] - 0.1, point[1] - 0.1, 0.2, 0.2);
    return (
      index.query(bounds(polygon)).find(part => area(intersectConvex(polygon, part.polygon)) > 0.001)?.faceId ??
      input.land[0].faceId
    );
  };
  // Paths follow the same rooted tree reserved above; each segment lies in
  // two adjacent fully covered squares, rather than cutting across a hole.
  for (const id of usedAccess) {
    const cell = cells.get(id)!;
    const parent = accessParent.get(id);
    const target = parent ? cells.get(parent)!.point : cell.road;
    if (!target || Math.hypot(target[0] - cell.point[0], target[1] - cell.point[1]) < 0.01) continue;
    result.lanes.push({
      faceId: owner(cell.point),
      points: [cell.point, target],
      widthMeters: width,
      kind: "farm-track"
    });
  }
  result.diagnostics.cultivatedAreaM2 = result.farms.reduce((sum, farm) => sum + area(farm.polygon), 0);
  result.diagnostics.shortfallAreaM2 = Math.max(
    0,
    (budget ?? result.diagnostics.cultivatedAreaM2) - result.diagnostics.cultivatedAreaM2
  );
  return result;
}
