import { corridorDelta, corridorDot, corridorUnit } from "../services/approachCorridorGeometry";
import { checkDryLandSegment } from "../services/dryLandCorridor";
import type { PhysicalWaterIndex } from "../services/physicalWaterIndex";
import type { RiverPoint } from "../services/riverGeometry";
import { validWaterPolygon } from "../services/riverPhysicalGeometry";
import type { CorridorGuideNode } from "./approachCorridorSearch";
import type { CrossingApproachGuides } from "./riverCrossingApproaches";

export interface LocalApproachGuideSettings {
  spacingMeters: number;
  paddingMeters: number;
  terminalLeadMeters: number;
  connectorRadiusMeters: number;
  maxSamples: number;
  maxNodes: number;
  maxEdges: number;
  maxEdgeChecks: number;
}
export interface LocalGuideStats {
  samples: number;
  edgeChecks: number;
  nodes: number;
  edges: number;
}
export type LocalApproachGuideResult = (
  | { guides: CrossingApproachGuides }
  | { reason: "invalid-input" | "sample-budget" | "graph-budget" | "edge-budget" | "blocked-terminal" }
) & { stats: LocalGuideStats };
/** Finite goal-aligned navigation lattice. IDs are local slots, not world cells
 * or road junctions. Every edge is dry over its full width. Curved turns still
 * require the direction-state search; a disconnected finite lattice is not a
 * proof of continuous-plane unreachability. No random sampling or world writes.
 */
export function buildLocalApproachGuides(input: {
  start: RiverPoint;
  goal: RiverPoint;
  startTangent?: RiverPoint;
  goalTangent: RiverPoint;
  roadWidthMeters: number;
  settings: LocalApproachGuideSettings;
  water: PhysicalWaterIndex;
  supportsDryFootprint: (footprint: readonly RiverPoint[]) => boolean;
}): LocalApproachGuideResult {
  const s = input.settings;
  const stats: LocalGuideStats = { samples: 0, edgeChecks: 0, nodes: 0, edges: 0 };
  const fail = (reason: Extract<LocalApproachGuideResult, { reason: string }>["reason"]): LocalApproachGuideResult => ({
    reason,
    stats
  });
  const tangent = corridorUnit(input.goalTangent),
    startTangent = input.startTangent ? corridorUnit(input.startTangent) : null;
  if (
    !tangent ||
    (input.startTangent && !startTangent) ||
    ![
      ...input.start,
      ...input.goal,
      input.roadWidthMeters,
      s.spacingMeters,
      s.terminalLeadMeters,
      s.connectorRadiusMeters
    ].every(v => Number.isFinite(v)) ||
    input.start.length !== 2 ||
    input.goal.length !== 2 ||
    input.roadWidthMeters <= 0 ||
    s.spacingMeters <= 0 ||
    s.terminalLeadMeters <= 0 ||
    s.connectorRadiusMeters <= 0 ||
    !Number.isFinite(s.paddingMeters) ||
    s.paddingMeters < 0 ||
    ![s.maxSamples, s.maxNodes, s.maxEdges, s.maxEdgeChecks].every(v => Number.isSafeInteger(v) && v > 0)
  )
    return fail("invalid-input");
  const normal: RiverPoint = [-tangent[1], tangent[0]];
  const goalLead: RiverPoint = [
    input.goal[0] - tangent[0] * s.terminalLeadMeters,
    input.goal[1] - tangent[1] * s.terminalLeadMeters
  ];
  const startLead: RiverPoint = startTangent
    ? [input.start[0] + startTangent[0] * s.terminalLeadMeters, input.start[1] + startTangent[1] * s.terminalLeadMeters]
    : input.start;
  const points = [input.start, input.goal, goalLead, startLead];
  if (points.some(p => !p.every(Number.isFinite))) return fail("invalid-input");
  const projected = points.map(p => {
    const d = corridorDelta(p, input.goal);
    return [corridorDot(d, tangent), corridorDot(d, normal)];
  });
  const minX = Math.floor((Math.min(...projected.map(p => p[0])) - s.paddingMeters) / s.spacingMeters);
  const maxX = Math.ceil((Math.max(...projected.map(p => p[0])) + s.paddingMeters) / s.spacingMeters);
  const minY = Math.floor((Math.min(...projected.map(p => p[1])) - s.paddingMeters) / s.spacingMeters);
  const maxY = Math.ceil((Math.max(...projected.map(p => p[1])) + s.paddingMeters) / s.spacingMeters);
  const columns = maxX - minX + 1,
    rows = maxY - minY + 1;
  if (
    ![minX, maxX, minY, maxY, columns, rows, columns * rows].every(Number.isSafeInteger) ||
    columns * rows > s.maxSamples
  )
    return fail("sample-budget");
  const nodes: { id: number; point: RiverPoint; neighbors: number[] }[] = [];
  const byId = new Map<number, (typeof nodes)[number]>();
  const half = input.roadWidthMeters / 2;
  const dryPoint = (p: RiverPoint) => {
    const footprint: RiverPoint[] = [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half]
    ].map(([u, v]) => [p[0] + u * tangent[0] + v * normal[0], p[1] + u * tangent[1] + v * normal[1]]);
    return (
      validWaterPolygon({ id: -1, rings: [footprint] }) &&
      !input.water.touchesWater(footprint) &&
      input.supportsDryFootprint(footprint)
    );
  };
  function add(id: number, point: RiverPoint) {
    const node = { id, point, neighbors: [] as number[] };
    nodes.push(node);
    byId.set(id, node);
    stats.nodes++;
  }
  // Special slots cannot become intermediate junctions. Goal has no outgoing edges.
  add(0, [...input.start]);
  add(1, [...input.goal]);
  add(2, goalLead);
  if (startTangent) add(3, startLead);
  if (points.some(p => !dryPoint(p))) return fail("blocked-terminal");
  if (nodes.length > s.maxNodes) return fail("graph-budget");
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      stats.samples++;
      const p: RiverPoint = [
        input.goal[0] + s.spacingMeters * (x * tangent[0] + y * normal[0]),
        input.goal[1] + s.spacingMeters * (x * tangent[1] + y * normal[1])
      ];
      if (!p.every(Number.isFinite)) return fail("invalid-input");
      if (!dryPoint(p) || points.some(q => Math.hypot(...corridorDelta(p, q)) < 1e-9)) continue;
      if (nodes.length >= s.maxNodes) return fail("graph-budget");
      add(4 + (y - minY) * columns + x - minX, p);
    }
  let budget: "edge-budget" | "graph-budget" | null = null;
  function connect(a: number, b: number, both = false): boolean {
    const from = byId.get(a)!,
      to = byId.get(b)!;
    if (stats.edgeChecks >= s.maxEdgeChecks) {
      budget = "edge-budget";
      return false;
    }
    stats.edgeChecks++;
    const valid = checkDryLandSegment({
      start: from.point,
      end: to.point,
      widthMeters: input.roadWidthMeters,
      water: input.water,
      supportsDryFootprint: input.supportsDryFootprint
    });
    if (!("tangent" in valid)) return false;
    if (stats.edges + (both ? 2 : 1) > s.maxEdges) {
      budget = "graph-budget";
      return false;
    }
    from.neighbors.push(b);
    if (both) to.neighbors.push(a);
    stats.edges += both ? 2 : 1;
    return true;
  }
  if (!connect(2, 1) || (startTangent && !connect(0, 3))) return fail(budget ?? "blocked-terminal");
  const source = startTangent ? 3 : 0;
  const near = (a: RiverPoint, b: RiverPoint) => Math.hypot(...corridorDelta(a, b)) <= s.connectorRadiusMeters;
  if (near(startLead, goalLead)) connect(source, 2);
  for (const node of nodes.filter(n => n.id >= 4)) {
    const slot = node.id - 4,
      x = slot % columns,
      y = Math.floor(slot / columns);
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [1, 1],
      [-1, 1]
    ]) {
      const xx = x + dx,
        yy = y + dy;
      if (xx < 0 || xx >= columns || yy >= rows) continue;
      const target = 4 + yy * columns + xx;
      if (byId.has(target)) connect(node.id, target, true);
      if (budget) return fail(budget);
    }
    if (near(startLead, node.point)) connect(source, node.id);
    if (budget) return fail(budget);
    if (near(node.point, goalLead)) connect(node.id, 2);
    if (budget) return fail(budget);
  }
  if (budget) return fail(budget);
  return {
    guides: {
      nodes: nodes as CorridorGuideNode[],
      startNodeId: 0,
      approachNodeId: 1,
      startTangent: input.startTangent
    },
    stats
  };
}
