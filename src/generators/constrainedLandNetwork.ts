import FlatQueue from "flatqueue";
import {
  type CorridorPiece,
  corridorDelta,
  corridorPieceTangents,
  corridorPositionTolerance,
  corridorUnit,
  sameCorridorDirection
} from "../services/approachCorridorGeometry";
import { bridgePassageFootprint } from "../services/bridgePassageGeometry";
import type { RiverPoint } from "../services/riverGeometry";
import { validWaterPolygon } from "../services/riverPhysicalGeometry";
import { type ApproachCorridor, type ApproachCorridorInput, validateApproachCorridor } from "./approachCorridorSearch";
import type { LandRouteGraphEnvironment } from "./dryLandRouteGraph";
import {
  type CrossingCandidateInput,
  type ProvisionalRiverCrossing,
  validateProvisionalRiverCrossing
} from "./riverCrossingCandidates";

export interface NetworkCorridor {
  corridor: ApproachCorridor;
  input: ApproachCorridorInput;
}
export interface NetworkNode {
  id: number;
  point: RiverPoint;
}
interface ConnectionBase {
  id: number;
  from: number;
  to: number;
  bidirectional: boolean;
}
export type NetworkConnection = ConnectionBase &
  (
    | { kind: "land"; land: NetworkCorridor; constructionCostMeters?: number }
    | {
        kind: "bridge";
        crossing: ProvisionalRiverCrossing;
        crossingInput: CrossingCandidateInput;
        approachA: NetworkCorridor;
        approachB: NetworkCorridor;
        constructionCostMeters: number;
        useCostMeters: number;
        /** New outside approach works, charged per connection even on an existing bridge. */
        approachConstructionCostMeters?: number;
      }
  );
interface CrossingReference {
  facilityId: number;
  riverId: number;
  arcLengthMeters: number;
  fromBank: "left" | "right";
  toBank: "left" | "right";
  constructionCostMeters: number;
  useCostMeters: number;
}
export interface ConstrainedNetworkEdge {
  id: number;
  reverse: boolean;
  from: number;
  to: number;
  pieces: readonly CorridorPiece[];
  distanceMeters: number;
  costMeters: number;
  crossing?: Readonly<CrossingReference>;
  connectionConstructionCostMeters?: number;
}
export interface ConstrainedLandNetwork {
  nodes: readonly NetworkNode[];
  edges: readonly ConstrainedNetworkEdge[];
  roadWidthMeters: number;
}
export interface NetworkEnvironment extends LandRouteGraphEnvironment {
  /** Whole bridge occupied area, including water; mandatory in world proposal adapters. */
  allowsBridgeFootprint?: (footprint: readonly RiverPoint[], facilityId: number) => boolean;
  /** Current geometry/version/capability for every referenced facility. Unknown blocks validation. */
  crossingInputAt: (facilityId: number) => CrossingCandidateInput | null;
}
const validators = new WeakMap<ConstrainedLandNetwork, readonly ((env: NetworkEnvironment) => boolean)[]>();
const connectionSources = new WeakMap<
  ConstrainedLandNetwork,
  ReadonlyMap<number, (env: NetworkEnvironment) => NetworkConnection | null>
>();
const validId = (id: number) => Number.isSafeInteger(id) && id >= 0;
function reversePieces(pieces: readonly CorridorPiece[]): CorridorPiece[] {
  return [...pieces]
    .reverse()
    .map(p =>
      p.kind === "line"
        ? { ...p, start: p.end, end: p.start }
        : { ...p, start: p.end, end: p.start, startAngle: p.startAngle + p.sweep, sweep: -p.sweep }
    );
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function savedCorridor(source: NetworkCorridor): NetworkCorridor {
  return {
    corridor: structuredClone(source.corridor),
    input: {
      ...source.input,
      nodes: structuredClone(source.input.nodes),
      settings: { ...source.input.settings },
      startTangent: source.input.startTangent ? [...source.input.startTangent] : undefined,
      goalTangent: [...source.input.goalTangent]
    }
  };
}
function corridorValid(source: NetworkCorridor, env: LandRouteGraphEnvironment, width: number): boolean {
  return (
    source.input.settings.roadWidthMeters === width &&
    validateApproachCorridor(source.corridor, { ...source.input, ...env })
  );
}
/** Session-only candidate network. An atomic bridge edge includes BOTH outside
 * approaches and E→D→W→W→D→E, with no internal branch nodes. This does not select,
 * construct, persist or render a facility. All public junctions are outside it.
 */
export function buildConstrainedLandNetwork(input: {
  nodes: readonly NetworkNode[];
  connections: readonly NetworkConnection[];
  roadWidthMeters: number;
  maxNodes: number;
  maxEdges: number;
  maxCorridorPieces: number;
  maxGuideNodes: number;
  maxGuideEdges: number;
  environment: LandRouteGraphEnvironment & Pick<NetworkEnvironment, "allowsBridgeFootprint">;
}):
  | { network: ConstrainedLandNetwork }
  | { reason: "invalid-input" | "graph-budget" | "invalid-land" | "invalid-bridge" | "invalid-junction" } {
  const roadWidthMeters = input.roadWidthMeters;
  if (
    !Number.isFinite(roadWidthMeters) ||
    roadWidthMeters <= 0 ||
    ![input.maxNodes, input.maxEdges, input.maxCorridorPieces, input.maxGuideNodes, input.maxGuideEdges].every(
      n => Number.isSafeInteger(n) && n > 0
    )
  )
    return { reason: "invalid-input" };
  if (
    input.nodes.length > input.maxNodes ||
    input.connections.reduce((n, e) => n + (e.bidirectional ? 2 : 1), 0) > input.maxEdges
  )
    return { reason: "graph-budget" };
  let pieceCount = 0,
    guideNodes = 0,
    guideEdges = 0;
  for (const c of input.connections)
    for (const source of c.kind === "land" ? [c.land] : [c.approachA, c.approachB]) {
      pieceCount += source.corridor.pieces.length;
      guideNodes += source.input.nodes.length;
      if (pieceCount > input.maxCorridorPieces || guideNodes > input.maxGuideNodes) return { reason: "graph-budget" };
      for (const n of source.input.nodes) {
        guideEdges += n.neighbors.length;
        if (guideEdges > input.maxGuideEdges) return { reason: "graph-budget" };
      }
    }
  const nodes = [...structuredClone(input.nodes)].sort((a, b) => a.id - b.id),
    byId = new Map(nodes.map(n => [n.id, n]));
  if (
    byId.size !== nodes.length ||
    nodes.some(n => !validId(n.id) || n.point.length !== 2 || !n.point.every(Number.isFinite)) ||
    new Set(input.connections.map(e => e.id)).size !== input.connections.length
  )
    return { reason: "invalid-input" };
  const edges: ConstrainedNetworkEdge[] = [],
    checks: ((env: NetworkEnvironment) => boolean)[] = [],
    sources = new Map<number, (env: NetworkEnvironment) => NetworkConnection | null>();
  for (const node of nodes) {
    const half = roadWidthMeters / 2;
    const footprint: RiverPoint[] = [
      [-half, -half],
      [half, -half],
      [half, half],
      [-half, half]
    ].map(([x, y]) => [node.point[0] + x, node.point[1] + y]);
    const check = (env: LandRouteGraphEnvironment) =>
      validWaterPolygon({ id: -1, rings: [footprint] }) &&
      !env.water.touchesWater(footprint) &&
      env.supportsDryFootprint(footprint);
    if (!check(input.environment)) return { reason: "invalid-junction" };
    checks.push(check);
  }
  const facilities = new Map<number, string>();
  for (const c of [...input.connections].sort((a, b) => a.id - b.id)) {
    if (!validId(c.id) || !byId.has(c.from) || !byId.has(c.to) || c.from === c.to) return { reason: "invalid-input" };
    let pieces: CorridorPiece[],
      distanceMeters: number,
      costMeters: number,
      crossing: CrossingReference | undefined,
      check: (env: NetworkEnvironment) => boolean;
    if (c.kind === "land") {
      if (
        c.constructionCostMeters !== undefined &&
        (!Number.isFinite(c.constructionCostMeters) || c.constructionCostMeters < 0)
      )
        return { reason: "invalid-input" };
      const land = savedCorridor(c.land);
      if (!corridorValid(land, input.environment, roadWidthMeters)) return { reason: "invalid-land" };
      pieces = [...land.corridor.pieces];
      distanceMeters = land.corridor.distanceMeters;
      costMeters = land.corridor.costMeters;
      check = env => corridorValid(land, env, roadWidthMeters);
      const base = {
        id: c.id,
        from: c.from,
        to: c.to,
        bidirectional: c.bidirectional,
        constructionCostMeters: c.constructionCostMeters
      };
      sources.set(c.id, () => ({ ...base, kind: "land", land }));
    } else {
      const bridge = structuredClone(c.crossing),
        a = savedCorridor(c.approachA),
        b = savedCorridor(c.approachB);
      const matches = (p: RiverPoint, q: RiverPoint) => p[0] === q[0] && p[1] === q[1];
      const passage = bridgePassageFootprint(bridge.approachA, bridge.approachB, roadWidthMeters);
      const requiresPassagePolicy = !!input.environment.allowsBridgeFootprint;
      const validate = (
        source: CrossingCandidateInput,
        env: LandRouteGraphEnvironment & Pick<NetworkEnvironment, "allowsBridgeFootprint">
      ) => {
        const ta = corridorUnit(corridorDelta(bridge.deckA, bridge.approachA)),
          tb = corridorUnit(corridorDelta(bridge.deckB, bridge.approachB));
        return (
          !!passage &&
          (!requiresPassagePolicy || !!env.allowsBridgeFootprint) &&
          (!env.allowsBridgeFootprint || env.allowsBridgeFootprint(passage, bridge.id)) &&
          source.dimensions.roadWidthMeters === roadWidthMeters &&
          validateProvisionalRiverCrossing(bridge, {
            ...source,
            otherWater: [],
            waterIndex: env.water,
            supportsDryFootprint: env.supportsDryFootprint
          }) &&
          corridorValid(a, env, roadWidthMeters) &&
          corridorValid(b, env, roadWidthMeters) &&
          matches(a.corridor.pieces.at(-1)!.end, bridge.approachA) &&
          matches(b.corridor.pieces.at(-1)!.end, bridge.approachB) &&
          !!ta &&
          !!tb &&
          sameCorridorDirection(corridorPieceTangents(a.corridor.pieces.at(-1)!)!.end, ta) &&
          sameCorridorDirection(corridorPieceTangents(b.corridor.pieces.at(-1)!)!.end, tb)
        );
      };
      if (
        !validId(bridge.id) ||
        !Number.isFinite(c.constructionCostMeters) ||
        c.constructionCostMeters < 0 ||
        !Number.isFinite(c.useCostMeters) ||
        c.useCostMeters <= 0 ||
        (c.approachConstructionCostMeters !== undefined &&
          (!Number.isFinite(c.approachConstructionCostMeters) || c.approachConstructionCostMeters < 0)) ||
        !validate(c.crossingInput, input.environment)
      )
        return { reason: "invalid-bridge" };
      const signature = JSON.stringify([bridge, c.constructionCostMeters, c.useCostMeters]);
      if (facilities.has(bridge.id) && facilities.get(bridge.id) !== signature) return { reason: "invalid-bridge" };
      facilities.set(bridge.id, signature);
      // W/D/E are private to the atomic connection, including its dry seats.
      const span = corridorDelta(bridge.approachB, bridge.approachA),
        spanLength = Math.hypot(...span);
      for (const node of nodes) {
        const d = corridorDelta(node.point, bridge.approachA),
          along = (d[0] * span[0] + d[1] * span[1]) / spanLength;
        const across = Math.abs(d[0] * span[1] - d[1] * span[0]) / spanLength;
        if (along >= 0 && along <= spanLength && across <= roadWidthMeters / 2) return { reason: "invalid-junction" };
      }
      const length = Math.hypot(...corridorDelta(bridge.approachB, bridge.approachA));
      pieces = [
        ...a.corridor.pieces,
        { kind: "line", start: bridge.approachA, end: bridge.approachB, lengthMeters: length },
        ...reversePieces(b.corridor.pieces)
      ];
      distanceMeters = a.corridor.distanceMeters + length + b.corridor.distanceMeters;
      costMeters = a.corridor.costMeters + length + b.corridor.costMeters;
      crossing = {
        facilityId: bridge.id,
        riverId: bridge.riverId,
        arcLengthMeters: bridge.arcLengthMeters,
        fromBank: bridge.banks[0].reference!.side,
        toBank: bridge.banks[1].reference!.side,
        constructionCostMeters: c.constructionCostMeters,
        useCostMeters: c.useCostMeters
      };
      check = env => {
        const current = env.crossingInputAt(bridge.id);
        return !!current && validate(current, env);
      };
      const base = {
        id: c.id,
        from: c.from,
        to: c.to,
        bidirectional: c.bidirectional,
        constructionCostMeters: c.constructionCostMeters,
        useCostMeters: c.useCostMeters,
        approachConstructionCostMeters: c.approachConstructionCostMeters
      };
      sources.set(c.id, env => {
        const current = env.crossingInputAt(bridge.id);
        return current
          ? { ...base, kind: "bridge", crossing: bridge, crossingInput: current, approachA: a, approachB: b }
          : null;
      });
    }
    if (![distanceMeters, costMeters].every(v => Number.isFinite(v) && v >= 0)) return { reason: "invalid-input" };
    const start = pieces[0].start,
      end = pieces.at(-1)!.end;
    if (
      Math.hypot(...corridorDelta(start, byId.get(c.from)!.point)) >
        corridorPositionTolerance(start, byId.get(c.from)!.point) ||
      Math.hypot(...corridorDelta(end, byId.get(c.to)!.point)) > corridorPositionTolerance(end, byId.get(c.to)!.point)
    )
      return { reason: "invalid-junction" };
    edges.push({
      id: c.id,
      reverse: false,
      from: c.from,
      to: c.to,
      pieces,
      distanceMeters,
      costMeters,
      crossing,
      connectionConstructionCostMeters:
        c.kind === "land" ? (c.constructionCostMeters ?? 0) : (c.approachConstructionCostMeters ?? 0)
    });
    checks.push(check);
    if (c.bidirectional) {
      edges.push({
        id: c.id,
        reverse: true,
        from: c.to,
        to: c.from,
        pieces: reversePieces(pieces),
        distanceMeters,
        costMeters,
        connectionConstructionCostMeters:
          c.kind === "land" ? (c.constructionCostMeters ?? 0) : (c.approachConstructionCostMeters ?? 0),
        crossing: crossing ? { ...crossing, fromBank: crossing.toBank, toBank: crossing.fromBank } : undefined
      });
      checks.push(check);
    }
  }
  const network = freeze({ nodes, edges, roadWidthMeters: roadWidthMeters });
  validators.set(network, checks);
  connectionSources.set(network, sources);
  return { network };
}

/** Extracts only explicit connection IDs from a session-validated source and
 * rebuilds their authoritative corridor contracts against the current world.
 * An edge list/JSON copy cannot manufacture a registered connection. */
export function selectConstrainedLandNetwork(
  network: ConstrainedLandNetwork,
  connectionIds: readonly number[],
  environment: NetworkEnvironment,
  budgets: Pick<
    Parameters<typeof buildConstrainedLandNetwork>[0],
    "maxNodes" | "maxEdges" | "maxCorridorPieces" | "maxGuideNodes" | "maxGuideEdges"
  >
): ReturnType<typeof buildConstrainedLandNetwork> | { reason: "unvalidated-network" | "invalid-geometry" } {
  const sources = connectionSources.get(network),
    checks = validators.get(network);
  if (!sources || !checks) return { reason: "unvalidated-network" };
  if (new Set(connectionIds).size !== connectionIds.length || connectionIds.some(id => !sources.has(id)))
    return { reason: "invalid-input" };
  if (!checks.every(check => check(environment))) return { reason: "invalid-geometry" };
  const connections: NetworkConnection[] = [];
  for (const id of [...connectionIds].sort((a, b) => a - b)) {
    const c = sources.get(id)!(environment);
    if (!c) return { reason: "invalid-geometry" };
    connections.push(c);
  }
  return buildConstrainedLandNetwork({
    nodes: network.nodes,
    connections,
    roadWidthMeters: network.roadWidthMeters,
    environment,
    maxNodes: budgets.maxNodes,
    maxEdges: budgets.maxEdges,
    maxCorridorPieces: budgets.maxCorridorPieces,
    maxGuideNodes: budgets.maxGuideNodes,
    maxGuideEdges: budgets.maxGuideEdges
  });
}

/** Canonical facility geometry for an authenticated current network, never inferred from drawn roads. */
export function getConstrainedNetworkCrossings(
  network: ConstrainedLandNetwork,
  environment: NetworkEnvironment
): { crossings: readonly ProvisionalRiverCrossing[] } | { reason: "unvalidated-network" | "invalid-geometry" } {
  const sources = connectionSources.get(network),
    checks = validators.get(network);
  if (!sources || !checks) return { reason: "unvalidated-network" };
  if (!checks.every(check => check(environment))) return { reason: "invalid-geometry" };
  const crossings = new Map<number, ProvisionalRiverCrossing>();
  for (const source of sources.values()) {
    const connection = source(environment);
    if (!connection) return { reason: "invalid-geometry" };
    if (connection.kind === "bridge") crossings.set(connection.crossing.id, structuredClone(connection.crossing));
  }
  return { crossings: freeze([...crossings.values()].sort((a, b) => a.id - b.id)) };
}
export interface NetworkSearchSettings {
  maxLabels: number;
  maxExpansions: number;
  historyCountCap: number;
  repeatCrossingCostMeters: number;
}
export interface RiverCrossingHistory {
  riverId: number;
  count: number;
  arcLengthMeters: number;
  fromBank: "left" | "right";
  toBank: "left" | "right";
}
export type NetworkRouteResult = (
  | {
      route: {
        edges: readonly ConstrainedNetworkEdge[];
        distanceMeters: number;
        costMeters: number;
        costs: { travelMeters: number; constructionMeters: number; repeatCrossingMeters: number };
        crossingHistory: readonly RiverCrossingHistory[];
        facilityIds: readonly number[];
      };
    }
  | {
      reason:
        | "invalid-input"
        | "unvalidated-network"
        | "invalid-geometry"
        | "invalid-cost"
        | "search-budget"
        | "no-route";
    }
) & { stats: { labels: number; expansions: number } };
/** Direction/history/facility-state Dijkstra. Exact tangent continuity is required
 * at external junctions; this stage never inserts a kink or moves a bridge.
 * Saturated counts bound penalties, and distinct incoming edges/history survive.
 */
export function findConstrainedLandRoute(
  network: ConstrainedLandNetwork,
  input: {
    startNodeId: number;
    goalNodeId: number;
    startTangent?: RiverPoint;
    goalTangent?: RiverPoint;
    settings: NetworkSearchSettings;
    environment: NetworkEnvironment;
    /** Explicit connection availability; omitted means all candidate connections. */
    allowedConnectionIds?: readonly number[];
    alreadyPaidFacilityIds?: readonly number[];
    alreadyPaidConnectionIds?: readonly number[];
    maxConstructionCostMeters?: number;
    maxRouteCostMeters?: number;
  }
): NetworkRouteResult {
  const stats = { labels: 0, expansions: 0 };
  const fail = (reason: Extract<NetworkRouteResult, { reason: string }>["reason"]): NetworkRouteResult => ({
    reason,
    stats
  });
  const s = input.settings,
    startTangent = input.startTangent ? corridorUnit(input.startTangent) : null,
    goalTangent = input.goalTangent ? corridorUnit(input.goalTangent) : null;
  if (
    ![s.maxLabels, s.maxExpansions, s.historyCountCap].every(n => Number.isSafeInteger(n) && n > 0) ||
    !Number.isFinite(s.repeatCrossingCostMeters) ||
    s.repeatCrossingCostMeters < 0 ||
    !network.nodes.some(n => n.id === input.startNodeId) ||
    !network.nodes.some(n => n.id === input.goalNodeId) ||
    (input.startTangent && !startTangent) ||
    (input.goalTangent && !goalTangent)
  )
    return fail("invalid-input");
  const connectionIds = new Set(network.edges.map(e => e.id)),
    facilityIds = new Set(network.edges.flatMap(e => (e.crossing ? [e.crossing.facilityId] : []))),
    roadIds = connectionIds;
  for (const [ids, known] of [
    [input.allowedConnectionIds, connectionIds],
    [input.alreadyPaidFacilityIds, facilityIds],
    [input.alreadyPaidConnectionIds, roadIds]
  ] as const)
    if (
      ids &&
      (ids.length > known.size || new Set(ids).size !== ids.length || ids.some(id => !validId(id) || !known.has(id)))
    )
      return fail("invalid-input");
  for (const cap of [input.maxConstructionCostMeters, input.maxRouteCostMeters])
    if (cap !== undefined && (!Number.isFinite(cap) || cap < 0)) return fail("invalid-input");
  const allowed = input.allowedConnectionIds ? new Set(input.allowedConnectionIds) : null,
    paidFacilities = new Set(input.alreadyPaidFacilityIds),
    paidRoads = new Set(input.alreadyPaidConnectionIds);
  const checks = validators.get(network);
  if (!checks) return fail("unvalidated-network");
  if (checks.some(check => !check(input.environment))) return fail("invalid-geometry");
  interface Label {
    node: number;
    incoming: number | null;
    history: RiverCrossingHistory[];
    facilities: number[];
    roads: number[];
    travel: number;
    construction: number;
    repeat: number;
    cost: number;
    distance: number;
    parent: Label | null;
    key: string;
  }
  const adjacency = new Map<number, number[]>();
  network.edges.forEach((e, i) => {
    const list = adjacency.get(e.from) ?? [];
    list.push(i);
    adjacency.set(e.from, list);
  });
  const queue = new FlatQueue<Label>(),
    best = new Map<string, number>();
  let budget = false,
    overflow = false;
  function push(l: Omit<Label, "key">) {
    if (![l.cost, l.distance, l.travel, l.construction, l.repeat].every(Number.isFinite)) {
      overflow = true;
      return;
    }
    if (
      l.construction > (input.maxConstructionCostMeters ?? Infinity) ||
      l.cost > (input.maxRouteCostMeters ?? Infinity)
    )
      return;
    const key = JSON.stringify([l.node, l.incoming, l.history, l.facilities, l.roads]);
    if (l.cost >= (best.get(key) ?? Infinity)) return;
    if (stats.labels >= s.maxLabels) {
      budget = true;
      return;
    }
    stats.labels++;
    best.set(key, l.cost);
    queue.push({ ...l, key }, l.cost);
  }
  push({
    node: input.startNodeId,
    incoming: null,
    history: [],
    facilities: [],
    roads: [],
    travel: 0,
    construction: 0,
    repeat: 0,
    cost: 0,
    distance: 0,
    parent: null
  });
  while (queue.length) {
    if (budget) return fail("search-budget");
    if (overflow) return fail("invalid-cost");
    const l = queue.pop()!;
    if (l.cost !== best.get(l.key)) continue;
    if (stats.expansions >= s.maxExpansions) return fail("search-budget");
    stats.expansions++;
    const incoming = l.incoming === null ? null : network.edges[l.incoming],
      tangent = incoming ? corridorPieceTangents(incoming.pieces.at(-1)!)!.end : startTangent;
    if (l.node === input.goalNodeId && (!goalTangent || (tangent && sameCorridorDirection(tangent, goalTangent)))) {
      const path: ConstrainedNetworkEdge[] = [];
      for (let p: Label | null = l; p?.parent; p = p.parent) path.push(network.edges[p.incoming!]);
      path.reverse();
      return {
        route: {
          edges: path,
          distanceMeters: l.distance,
          costMeters: l.cost,
          costs: { travelMeters: l.travel, constructionMeters: l.construction, repeatCrossingMeters: l.repeat },
          crossingHistory: l.history,
          facilityIds: l.facilities
        },
        stats
      };
    }
    for (const index of adjacency.get(l.node) ?? []) {
      const e = network.edges[index],
        entry = corridorPieceTangents(e.pieces[0])!.start;
      if (allowed && !allowed.has(e.id)) continue;
      if (tangent && !sameCorridorDirection(tangent, entry)) continue;
      if (e.crossing && incoming?.crossing?.facilityId === e.crossing.facilityId && incoming.from === e.to) continue;
      const history = l.history.map(h => ({ ...h })),
        facilities = [...l.facilities],
        roads = [...l.roads];
      let travel = e.costMeters,
        construction = 0,
        repeat = 0;
      if (e.crossing) {
        const c = e.crossing,
          previous = history.find(h => h.riverId === c.riverId);
        travel += c.useCostMeters;
        repeat += (previous?.count ?? 0) * s.repeatCrossingCostMeters;
        const next = {
          riverId: c.riverId,
          count: Math.min(s.historyCountCap, (previous?.count ?? 0) + 1),
          arcLengthMeters: c.arcLengthMeters,
          fromBank: c.fromBank,
          toBank: c.toBank
        };
        if (previous) history[history.indexOf(previous)] = next;
        else history.push(next);
        history.sort((a, b) => a.riverId - b.riverId);
        if (!facilities.includes(c.facilityId)) {
          if (!paidFacilities.has(c.facilityId)) construction += c.constructionCostMeters;
          facilities.push(c.facilityId);
          facilities.sort((a, b) => a - b);
        }
      }
      if ((e.connectionConstructionCostMeters ?? 0) > 0 && !paidRoads.has(e.id) && !roads.includes(e.id)) {
        construction += e.connectionConstructionCostMeters ?? 0;
        roads.push(e.id);
        roads.sort((a, b) => a - b);
      }
      const increment = travel + construction + repeat;
      push({
        node: e.to,
        incoming: index,
        history,
        facilities,
        roads,
        travel: l.travel + travel,
        construction: l.construction + construction,
        repeat: l.repeat + repeat,
        cost: l.cost + increment,
        distance: l.distance + e.distanceMeters,
        parent: l
      });
    }
  }
  return fail(overflow ? "invalid-cost" : budget ? "search-budget" : "no-route");
}
