import { checkDryLandSegment } from "../services/dryLandCorridor";
import type { PhysicalWaterIndex } from "../services/physicalWaterIndex";
import type { RiverPoint } from "../services/riverGeometry";
import { validWaterPolygon } from "../services/riverPhysicalGeometry";
import {
  type ApproachCorridorInput,
  type ApproachCorridorResult,
  type CorridorGuideNode,
  findApproachCorridor
} from "./approachCorridorSearch";

export interface LandGuideReference {
  patchId: number;
  nodeId: number;
}
export interface LandGuidePatch {
  id: number;
  /** Derived lookup metadata only. It does not authorize connectivity. */
  cellId?: number;
  nodes: readonly CorridorGuideNode[];
}
export interface LandSharedPortal {
  id: number;
  /** Explicit same-position dry connection; no automatic coordinate welding. */
  members: readonly LandGuideReference[];
}
export interface LandRouteGraphNode extends CorridorGuideNode {
  sources: readonly LandGuideReference[];
  cellIds: readonly number[];
  portalId?: number;
  /** Weak dry-guide component, NOT a continuous land component or directed reachability proof. */
  dryComponentId: number;
}
export interface LandRouteGraph {
  nodes: readonly LandRouteGraphNode[];
  roadWidthMeters: number;
  nextNodeId: number;
  /** Blocked proposed edges are omitted, never replaced by water-crossing shortcuts. */
  rejectedEdges: readonly { from: number; to: number; reason: "water-intersection" | "unsupported-terrain" }[];
  stats: { sourceNodes: number; sourceEdges: number; edgeChecks: number; dryComponents: number };
}
export interface LandRouteGraphEnvironment {
  water: PhysicalWaterIndex;
  /** Includes actual footprint-wide terrain, jurisdiction and allowed-region rules. */
  supportsDryFootprint: (footprint: readonly RiverPoint[]) => boolean;
}
export type LandRouteGraphResult =
  | { graph: LandRouteGraph }
  | { reason: "invalid-input" | "graph-budget" | "invalid-portal" | "blocked-node" | "invalid-edge" };
const validId = (v: number) => Number.isSafeInteger(v) && v >= 0;
const key = (r: LandGuideReference) => `${r.patchId}:${r.nodeId}`;
/** Assemble finite dry navigation patches. Shared portals are explicit aliases
 * of the SAME physical point; geometry/proximity/cell ownership never creates
 * aliases. This is a dry-only foundation, with no adopted bridge edges yet.
 * Every source edge is checked against the complete current water snapshot.
 */
export function buildLandRouteGraph(input: {
  patches: readonly LandGuidePatch[];
  portals: readonly LandSharedPortal[];
  roadWidthMeters: number;
  firstNodeId: number;
  maxSourceNodes: number;
  maxSourceEdges: number;
  environment: LandRouteGraphEnvironment;
}): LandRouteGraphResult {
  if (
    !validId(input.firstNodeId) ||
    !Number.isFinite(input.roadWidthMeters) ||
    input.roadWidthMeters <= 0 ||
    ![input.maxSourceNodes, input.maxSourceEdges].every(n => Number.isSafeInteger(n) && n > 0)
  )
    return { reason: "invalid-input" };
  const sourceNodes = input.patches.reduce((n, p) => n + p.nodes.length, 0),
    sourceEdges = input.patches.reduce((n, p) => n + p.nodes.reduce((sum, node) => sum + node.neighbors.length, 0), 0);
  // Empty patches/portals cannot consume unbounded validation work.
  if (
    input.patches.length > input.maxSourceNodes ||
    input.portals.length > input.maxSourceNodes ||
    sourceNodes > input.maxSourceNodes ||
    sourceEdges > input.maxSourceEdges
  )
    return { reason: "graph-budget" };
  if (!Number.isSafeInteger(input.firstNodeId + sourceNodes)) return { reason: "invalid-input" };
  const patches = [...input.patches].sort((a, b) => a.id - b.id);
  if (new Set(patches.map(p => p.id)).size !== patches.length) return { reason: "invalid-input" };
  const source = new Map<
    string,
    { ref: LandGuideReference; point: RiverPoint; neighbors: readonly number[]; cellId?: number }
  >();
  for (const p of patches) {
    if (!validId(p.id) || (p.cellId !== undefined && !validId(p.cellId))) return { reason: "invalid-input" };
    for (const node of [...p.nodes].sort((a, b) => a.id - b.id)) {
      const ref = { patchId: p.id, nodeId: node.id },
        k = key(ref);
      if (
        !validId(node.id) ||
        source.has(k) ||
        node.point.length !== 2 ||
        !node.point.every(Number.isFinite) ||
        node.neighbors.some(n => !validId(n) || n === node.id)
      )
        return { reason: "invalid-input" };
      source.set(k, {
        ref,
        point: [...node.point],
        neighbors: [...new Set(node.neighbors)].sort((a, b) => a - b),
        cellId: p.cellId
      });
    }
    for (const n of p.nodes)
      if (n.neighbors.some(id => !source.has(key({ patchId: p.id, nodeId: id })))) return { reason: "invalid-input" };
  }
  const aliases = new Map<string, LandSharedPortal>();
  const portals = [...input.portals].sort((a, b) => a.id - b.id);
  if (new Set(portals.map(p => p.id)).size !== portals.length) return { reason: "invalid-portal" };
  let portalMembers = 0;
  for (const p of portals) {
    portalMembers += p.members.length;
    if (portalMembers > input.maxSourceNodes) return { reason: "graph-budget" };
    if (!validId(p.id) || p.members.length < 2) return { reason: "invalid-portal" };
    const origin = source.get(key(p.members[0]))?.point;
    for (const r of p.members) {
      const k = key(r),
        node = source.get(k);
      if (!origin || !node || aliases.has(k) || node.point[0] !== origin[0] || node.point[1] !== origin[1])
        return { reason: "invalid-portal" };
      aliases.set(k, p);
    }
  }
  const mutable: {
    id: number;
    point: RiverPoint;
    neighbors: number[];
    sources: LandGuideReference[];
    cellIds: number[];
    portalId?: number;
    dryComponentId: number;
  }[] = [];
  const mapping = new Map<string, number>(),
    portalNodes = new Map<number, number>();
  for (const [k, n] of source) {
    const portal = aliases.get(k),
      existing = portal ? portalNodes.get(portal.id) : undefined;
    let slot = existing;
    if (slot === undefined) {
      slot = mutable.length;
      const half = input.roadWidthMeters / 2;
      const footprint: RiverPoint[] = [
        [-half, -half],
        [half, -half],
        [half, half],
        [-half, half]
      ].map(([x, y]) => [n.point[0] + x, n.point[1] + y]);
      if (
        !validWaterPolygon({ id: -1, rings: [footprint] }) ||
        input.environment.water.touchesWater(footprint) ||
        !input.environment.supportsDryFootprint(footprint)
      )
        return { reason: "blocked-node" };
      mutable.push({
        id: input.firstNodeId + slot,
        point: n.point,
        neighbors: [],
        sources: [],
        cellIds: [],
        portalId: portal?.id,
        dryComponentId: -1
      });
      if (portal) portalNodes.set(portal.id, slot);
    }
    mapping.set(k, slot);
    mutable[slot].sources.push(n.ref);
    if (n.cellId !== undefined && !mutable[slot].cellIds.includes(n.cellId)) mutable[slot].cellIds.push(n.cellId);
  }
  const rejectedEdges: LandRouteGraph["rejectedEdges"][number][] = [];
  const seen = new Set<string>();
  let edgeChecks = 0;
  const weak = mutable.map(() => new Set<number>());
  for (const [k, n] of source)
    for (const target of n.neighbors) {
      const a = mapping.get(k)!,
        b = mapping.get(key({ patchId: n.ref.patchId, nodeId: target }))!;
      if (a === b) return { reason: "invalid-edge" };
      const directed = `${a}:${b}`;
      if (seen.has(directed)) continue;
      seen.add(directed);
      edgeChecks++;
      const dry = checkDryLandSegment({
        start: mutable[a].point,
        end: mutable[b].point,
        widthMeters: input.roadWidthMeters,
        ...input.environment
      });
      if (!("tangent" in dry)) {
        if (dry.reason === "invalid-segment") return { reason: "invalid-edge" };
        rejectedEdges.push({ from: mutable[a].id, to: mutable[b].id, reason: dry.reason });
        continue;
      }
      mutable[a].neighbors.push(mutable[b].id);
      weak[a].add(b);
      weak[b].add(a);
    }
  let dryComponents = 0;
  for (let i = 0; i < mutable.length; i++) {
    if (mutable[i].dryComponentId !== -1) continue;
    const queue = [i];
    mutable[i].dryComponentId = dryComponents;
    for (let cursor = 0; cursor < queue.length; cursor++)
      for (const next of weak[queue[cursor]])
        if (mutable[next].dryComponentId === -1) {
          mutable[next].dryComponentId = dryComponents;
          queue.push(next);
        }
    dryComponents++;
  }
  const nodes = mutable.map(n =>
    Object.freeze({
      ...n,
      point: Object.freeze(n.point),
      neighbors: Object.freeze(n.neighbors.sort((a, b) => a - b)),
      sources: Object.freeze(n.sources.map(r => Object.freeze(r))),
      cellIds: Object.freeze(n.cellIds.sort((a, b) => a - b))
    })
  );
  return {
    graph: Object.freeze({
      nodes: Object.freeze(nodes),
      roadWidthMeters: input.roadWidthMeters,
      nextNodeId: input.firstNodeId + nodes.length,
      rejectedEdges: Object.freeze(rejectedEdges.map(e => Object.freeze(e))),
      stats: Object.freeze({ sourceNodes, sourceEdges, edgeChecks, dryComponents })
    })
  };
}
/** Query with the current COMPLETE obstacle/terrain snapshot. Old dry edges are
 * rechecked by the search, and finalized arcs are validated over their full width.
 * A component is only a coarse guide prefilter, never the route acceptance gate.
 */
export function findLandRouteCorridor(
  graph: LandRouteGraph,
  input: Omit<ApproachCorridorInput, "nodes">
): ApproachCorridorResult {
  if (input.settings.roadWidthMeters !== graph.roadWidthMeters)
    return { reason: "invalid-input", stats: { labels: 0, expansions: 0, edgeChecks: 0, turnChecks: 0 } };
  return findApproachCorridor({ ...input, nodes: graph.nodes });
}
export function landGuideNodeId(graph: LandRouteGraph, reference: LandGuideReference): number | null {
  return (
    graph.nodes.find(n => n.sources.some(r => r.patchId === reference.patchId && r.nodeId === reference.nodeId))?.id ??
    null
  );
}
