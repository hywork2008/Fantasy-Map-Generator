import FlatQueue from "flatqueue";
import {
  type CorridorPiece,
  checkCorridorArc,
  corridorDelta,
  corridorDot,
  corridorPieceTangents,
  corridorPositionTolerance,
  corridorUnit,
  makeCorridorTurn,
  sameCorridorDirection
} from "../services/approachCorridorGeometry";
import { checkDryLandSegment } from "../services/dryLandCorridor";
import type { PhysicalWaterIndex } from "../services/physicalWaterIndex";
import type { RiverPoint } from "../services/riverGeometry";

/** Navigation guides, not registered road junctions; fillets need not pass through them. */
export interface CorridorGuideNode {
  id: number;
  point: RiverPoint;
  neighbors: readonly number[];
}
export interface ApproachCorridorSettings {
  roadWidthMeters: number;
  minimumTurnRadiusMeters: number;
  minimumStraightMeters: number;
  minimumFinalStraightMeters: number;
  turnPenaltyMetersPerRadian: number;
  maxEnvelopeErrorMeters: number;
  maxArcSections: number;
  maxNodes: number;
  maxEdges: number;
  maxLabels: number;
  maxExpansions: number;
}
export interface ApproachCorridorInput {
  nodes: readonly CorridorGuideNode[];
  startNodeId: number;
  goalNodeId: number;
  /** For connecting to an existing road, its incoming tangent is mandatory. */
  startTangent?: RiverPoint;
  goalTangent: RiverPoint;
  settings: ApproachCorridorSettings;
  water: PhysicalWaterIndex;
  /** Providers must be deterministic for this search's fixed world snapshot. */
  supportsDryFootprint: (footprint: readonly RiverPoint[]) => boolean;
  /** Nonnegative game cost, distinct from the finalized physical travel distance. */
  edgePenaltyMeters?: (fromId: number, toId: number) => number;
}
export interface ApproachCorridor {
  guideNodeIds: readonly number[];
  pieces: readonly CorridorPiece[];
  distanceMeters: number;
  costMeters: number;
}
export interface CorridorSearchStats {
  labels: number;
  expansions: number;
  edgeChecks: number;
  turnChecks: number;
}
export type ApproachCorridorResult = (
  | { corridor: ApproachCorridor }
  | {
      reason:
        | "invalid-input"
        | "invalid-cost"
        | "graph-budget"
        | "search-budget"
        | "geometry-budget"
        | "no-corridor"
        | "validation-failed";
    }
) & { stats: CorridorSearchStats };
interface Label {
  key: string;
  anchorId: number;
  currentId: number;
  lineStart: RiverPoint;
  tangent: RiverPoint;
  cost: number;
  parent: Label | null;
  pieces: readonly CorridorPiece[];
}
function validSettings(s: ApproachCorridorSettings): boolean {
  return (
    [s.roadWidthMeters, s.minimumTurnRadiusMeters, s.maxEnvelopeErrorMeters].every(v => Number.isFinite(v) && v > 0) &&
    s.minimumTurnRadiusMeters > s.roadWidthMeters / 2 &&
    Number.isFinite(s.minimumTurnRadiusMeters + s.roadWidthMeters / 2) &&
    [s.minimumStraightMeters, s.minimumFinalStraightMeters, s.turnPenaltyMetersPerRadian].every(
      v => Number.isFinite(v) && v >= 0
    ) &&
    [s.maxArcSections, s.maxNodes, s.maxEdges, s.maxLabels, s.maxExpansions].every(
      v => Number.isSafeInteger(v) && v > 0
    )
  );
}
/** Direction-state Dijkstra. Prefix cost excludes the pending straight run until
 * its next turn (or the goal); every finalized increment is nonnegative. Thus a
 * shorter prefix cannot erase a different incoming direction/reserved fillet.
 * Collinear guide subdivisions stay pending, so they do not create artificial
 * corners or limit the length available for a turn. All budgets fail explicitly.
 */
export function findApproachCorridor(input: ApproachCorridorInput): ApproachCorridorResult {
  const { settings: s } = input;
  const stats: CorridorSearchStats = { labels: 0, expansions: 0, edgeChecks: 0, turnChecks: 0 };
  const fail = (reason: Extract<ApproachCorridorResult, { reason: string }>["reason"]): ApproachCorridorResult => ({
    reason,
    stats
  });
  if (
    !validSettings(s) ||
    !corridorUnit(input.goalTangent) ||
    (input.startTangent && !corridorUnit(input.startTangent))
  )
    return fail("invalid-input");
  if (input.nodes.length > s.maxNodes || input.nodes.reduce((n, node) => n + node.neighbors.length, 0) > s.maxEdges)
    return fail("graph-budget");
  const nodes = new Map<number, CorridorGuideNode>();
  for (const node of input.nodes) {
    if (
      !Number.isSafeInteger(node.id) ||
      node.id < 0 ||
      nodes.has(node.id) ||
      !node.point.every(Number.isFinite) ||
      node.point.length !== 2
    )
      return fail("invalid-input");
    nodes.set(node.id, {
      id: node.id,
      point: [node.point[0], node.point[1]],
      neighbors: [...new Set(node.neighbors)].sort((a, b) => a - b)
    });
  }
  if (
    !nodes.has(input.startNodeId) ||
    !nodes.has(input.goalNodeId) ||
    input.startNodeId === input.goalNodeId ||
    [...nodes.values()].some(n => n.neighbors.some(id => !nodes.has(id) || id === n.id))
  )
    return fail("invalid-input");
  const start = nodes.get(input.startNodeId)!,
    goal = nodes.get(input.goalNodeId)!;
  const goalTangent = corridorUnit(input.goalTangent)!,
    startTangent = input.startTangent ? corridorUnit(input.startTangent)! : null;
  const edges = new Map<string, { tangent: RiverPoint; penalty: number } | null>();
  let invalidCost = false;
  function edge(from: CorridorGuideNode, to: CorridorGuideNode) {
    const key = `${from.id}:${to.id}`;
    if (edges.has(key)) return edges.get(key)!;
    stats.edgeChecks++;
    const dry = checkDryLandSegment({
      start: from.point,
      end: to.point,
      widthMeters: s.roadWidthMeters,
      water: input.water,
      supportsDryFootprint: input.supportsDryFootprint
    });
    if (!("tangent" in dry)) {
      edges.set(key, null);
      return null;
    }
    const penalty = input.edgePenaltyMeters?.(from.id, to.id) ?? 0;
    if (!Number.isFinite(penalty) || penalty < 0) {
      invalidCost = true;
      edges.set(key, null);
      return null;
    }
    const value = { tangent: dry.tangent, penalty };
    edges.set(key, value);
    return value;
  }
  const queue = new FlatQueue<Label>(),
    best = new Map<string, number>();
  let labelBudget = false;
  function enqueue(label: Omit<Label, "key">) {
    // Transient state key, not a saved facility/node ID. Exact incoming geometry
    // is retained, including the length reserved by a previous turn.
    if (!Number.isFinite(label.cost) || label.cost < 0) {
      invalidCost = true;
      return;
    }
    const key = `${label.anchorId}:${label.currentId}:${label.lineStart.join(",")}:${label.tangent.join(",")}`;
    if (label.cost >= (best.get(key) ?? Infinity)) return;
    if (stats.labels >= s.maxLabels) {
      labelBudget = true;
      return;
    }
    stats.labels++;
    best.set(key, label.cost);
    queue.push({ ...label, key }, label.cost);
  }
  for (const id of start.neighbors) {
    const e = edge(start, nodes.get(id)!);
    if (!e || (startTangent && !sameCorridorDirection(startTangent, e.tangent))) continue;
    enqueue({
      anchorId: start.id,
      currentId: id,
      lineStart: start.point,
      tangent: e.tangent,
      cost: e.penalty,
      parent: null,
      pieces: []
    });
  }
  let complete: { label: Label; pieces: readonly CorridorPiece[]; cost: number } | null = null;
  function line(a: RiverPoint, b: RiverPoint): CorridorPiece[] {
    const lengthMeters = Math.hypot(...corridorDelta(b, a));
    return lengthMeters <= corridorPositionTolerance(a, b) ? [] : [{ kind: "line", start: a, end: b, lengthMeters }];
  }
  while (queue.length) {
    if (invalidCost) return fail("invalid-cost");
    if (labelBudget) return fail("search-budget");
    const label = queue.pop()!;
    if (label.cost !== best.get(label.key)) continue;
    if (complete && label.cost >= complete.cost) break;
    if (stats.expansions >= s.maxExpansions) return fail("search-budget");
    stats.expansions++;
    const current = nodes.get(label.currentId)!,
      remaining = corridorDot(corridorDelta(current.point, label.lineStart), label.tangent);
    const tolerance = corridorPositionTolerance(current.point, label.lineStart);
    if (current.id === goal.id) {
      if (
        remaining < -tolerance ||
        remaining + tolerance < s.minimumFinalStraightMeters ||
        !sameCorridorDirection(label.tangent, goalTangent)
      )
        continue;
      const final = line(label.lineStart, goal.point),
        cost = label.cost + final.reduce((n, p) => n + p.lengthMeters, 0);
      if (!Number.isFinite(cost)) return fail("invalid-cost");
      if (!complete || cost < complete.cost) complete = { label, pieces: final, cost };
      continue;
    }
    for (const nextId of current.neighbors) {
      const next = nodes.get(nextId)!,
        e = edge(current, next);
      if (!e) continue;
      const turn = makeCorridorTurn(current.point, label.tangent, e.tangent, s.minimumTurnRadiusMeters);
      if (!turn) continue;
      if (!turn.arc) {
        enqueue({ ...label, currentId: next.id, cost: label.cost + e.penalty, parent: label, pieces: [] });
        continue;
      }
      if (remaining + tolerance < turn.trimMeters + s.minimumStraightMeters) continue;
      stats.turnChecks++;
      const valid = checkCorridorArc(turn.arc, {
        roadWidthMeters: s.roadWidthMeters,
        maxEnvelopeErrorMeters: s.maxEnvelopeErrorMeters,
        maxArcSections: s.maxArcSections,
        water: input.water,
        supportsDryFootprint: input.supportsDryFootprint
      });
      if ("reason" in valid) {
        if (valid.reason === "geometry-budget") return fail("geometry-budget");
        continue;
      }
      const pieces = [...line(label.lineStart, turn.arc.start), turn.arc];
      const increment =
        pieces.reduce((n, p) => n + p.lengthMeters, 0) +
        Math.abs(turn.angle) * s.turnPenaltyMetersPerRadian +
        e.penalty;
      if (!Number.isFinite(label.cost + increment)) return fail("invalid-cost");
      enqueue({
        anchorId: current.id,
        currentId: next.id,
        lineStart: turn.arc.end,
        tangent: e.tangent,
        cost: label.cost + increment,
        parent: label,
        pieces
      });
    }
  }
  if (invalidCost) return fail("invalid-cost");
  if (labelBudget) return fail("search-budget");
  if (!complete) return fail("no-corridor");
  const chain: Label[] = [];
  for (let label: Label | null = complete.label; label; label = label.parent) chain.push(label);
  chain.reverse();
  const pieces = [...chain.flatMap(l => l.pieces), ...complete.pieces];
  const corridor: ApproachCorridor = {
    guideNodeIds: [start.id, ...chain.map(l => l.currentId)],
    pieces,
    distanceMeters: pieces.reduce((n, p) => n + p.lengthMeters, 0),
    costMeters: complete.cost
  };
  if (!validateApproachCorridor(corridor, input)) return fail("validation-failed");
  return { corridor, stats };
}
/** Recheck finalized geometry, not just its guide edges. This catches a fillet
 * cutting into water, shortened straight segments and tangent/endpoint drift.
 */
export function validateApproachCorridor(corridor: ApproachCorridor, input: ApproachCorridorInput): boolean {
  const { settings: s } = input;
  const goalTangent = corridorUnit(input.goalTangent),
    startTangent = input.startTangent ? corridorUnit(input.startTangent) : null;
  if (!validSettings(s) || !corridor.pieces.length || !goalTangent || (input.startTangent && !startTangent))
    return false;
  const start = input.nodes.find(n => n.id === input.startNodeId)?.point,
    goal = input.nodes.find(n => n.id === input.goalNodeId)?.point;
  if (
    !start ||
    !goal ||
    corridor.guideNodeIds[0] !== input.startNodeId ||
    corridor.guideNodeIds.at(-1) !== input.goalNodeId
  )
    return false;
  const nodes = new Map(input.nodes.map(node => [node.id, node]));
  let extraCost = 0;
  for (let i = 1; i < corridor.guideNodeIds.length; i++) {
    const fromId = corridor.guideNodeIds[i - 1],
      toId = corridor.guideNodeIds[i];
    if (!nodes.get(fromId)?.neighbors.includes(toId) || !nodes.has(toId)) return false;
    const penalty = input.edgePenaltyMeters?.(fromId, toId) ?? 0;
    if (!Number.isFinite(penalty) || penalty < 0) return false;
    extraCost += penalty;
  }
  const turnCost = corridor.pieces.reduce(
    (n, p) => n + (p.kind === "arc" ? Math.abs(p.sweep) * s.turnPenaltyMetersPerRadian : 0),
    0
  );

  let previous: CorridorPiece | null = null,
    previousEndTangent: RiverPoint | null = null;
  let distance = 0,
    straightRun = 0;
  for (const piece of corridor.pieces) {
    const tangents = corridorPieceTangents(piece);
    if (!tangents) return false;
    const tolerance = corridorPositionTolerance(piece.start, piece.end, previous?.end ?? start);
    if (
      Math.hypot(...corridorDelta(piece.start, previous?.end ?? start)) > tolerance ||
      (previousEndTangent && !sameCorridorDirection(previousEndTangent, tangents.start))
    )
      return false;
    if (!previous && input.startTangent && !sameCorridorDirection(startTangent!, tangents.start)) return false;
    if (piece.kind === "line") {
      const valid = checkDryLandSegment({
        start: piece.start,
        end: piece.end,
        widthMeters: s.roadWidthMeters,
        water: input.water,
        supportsDryFootprint: input.supportsDryFootprint
      });
      if (!("lengthMeters" in valid) || Math.abs(valid.lengthMeters - piece.lengthMeters) > tolerance) return false;
      straightRun += piece.lengthMeters;
    } else {
      if (straightRun + tolerance < s.minimumStraightMeters) return false;
      straightRun = 0;
      if (
        piece.radiusMeters < s.minimumTurnRadiusMeters ||
        "reason" in
          checkCorridorArc(piece, {
            roadWidthMeters: s.roadWidthMeters,
            maxEnvelopeErrorMeters: s.maxEnvelopeErrorMeters,
            maxArcSections: s.maxArcSections,
            water: input.water,
            supportsDryFootprint: input.supportsDryFootprint
          })
      )
        return false;
    }
    distance += piece.lengthMeters;
    previous = piece;
    previousEndTangent = tangents.end;
  }
  const last = corridor.pieces.at(-1)!;
  const tolerance = corridorPositionTolerance(start, goal);
  return (
    Math.hypot(...corridorDelta(last.end, goal)) <= tolerance &&
    sameCorridorDirection(previousEndTangent!, goalTangent) &&
    (last.kind === "line"
      ? straightRun + tolerance >= s.minimumFinalStraightMeters
      : s.minimumFinalStraightMeters === 0) &&
    Math.abs(corridor.distanceMeters - distance) <= tolerance * corridor.pieces.length &&
    Number.isFinite(corridor.costMeters) &&
    Number.isFinite(extraCost + turnCost) &&
    Math.abs(corridor.costMeters - distance - extraCost - turnCost) <=
      tolerance * (corridor.pieces.length + corridor.guideNodeIds.length)
  );
}
