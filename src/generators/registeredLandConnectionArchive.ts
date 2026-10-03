import type { RiverPoint } from "../services/riverGeometry";
import type { ApproachCorridor, ApproachCorridorSettings, CorridorGuideNode } from "./approachCorridorSearch";
import {
  buildConstrainedLandNetwork,
  getConstrainedNetworkConnections,
  type NetworkConnection,
  type NetworkCorridor,
  type NetworkEnvironment,
  type NetworkNode
} from "./constrainedLandNetwork";
import {
  createLandConnectionRegistry,
  isRegisteredLandConnectionSnapshot,
  type LandConnectionSnapshot
} from "./landConnectionAdoption";
import {
  type CrossingCandidateDimensions,
  createProvisionalRiverCrossing,
  type ProvisionalRiverCrossing
} from "./riverCrossingCandidates";

export interface SavedLandCorridor {
  corridor: ApproachCorridor;
  contract: {
    nodes: readonly CorridorGuideNode[];
    startNodeId: number;
    goalNodeId: number;
    startTangent?: RiverPoint;
    goalTangent: RiverPoint;
    settings: ApproachCorridorSettings;
    requiresEdgePenalty: boolean;
  };
}
interface SavedBase {
  id: number;
  from: number;
  to: number;
  bidirectional: boolean;
  constructionCostMeters: number;
}
export type SavedLandConnection = SavedBase &
  (
    | { kind: "land"; land: SavedLandCorridor }
    | {
        kind: "bridge";
        facilityId: number;
        approachA: SavedLandCorridor;
        approachB: SavedLandCorridor;
        useCostMeters: number;
        approachConstructionCostMeters: number;
      }
  );
export interface RegisteredLandConnectionArchive {
  schemaVersion: 1;
  coordinateUnit: "metres";
  worldIdentity: string;
  revision: number;
  roadWidthMeters: number;
  nodes: readonly NetworkNode[];
  facilities: readonly { crossing: ProvisionalRiverCrossing; dimensions: CrossingCandidateDimensions }[];
  connections: readonly SavedLandConnection[];
}
export interface LandArchiveBudgets {
  maxJsonCharacters: number;
  maxFacilities: number;
  maxNodes: number;
  maxEdges: number;
  maxCorridorPieces: number;
  maxGuideNodes: number;
  maxGuideEdges: number;
  /** Caps each saved arc's validation work, independently of untrusted saved settings. */
  maxArcSections: number;
}
export interface LandArchiveCurrent {
  /** Same world/physical coordinate identity as the current proposal adapter. */
  worldIdentity: string;
  environment: NetworkEnvironment;
  nodePointAt: (id: number) => RiverPoint | null;
  /** Restore engineering/operating costs from CURRENT rules; saved costs are historical data. */
  costsAt: (
    connection: Readonly<SavedLandConnection>
  ) => { constructionCostMeters: number; useCostMeters?: number; approachConstructionCostMeters?: number } | null;
  edgePenaltyAt: (connectionId: number, side: "land" | "A" | "B") => ((fromId: number, toId: number) => number) | null;
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const id = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const point = (v: unknown): v is RiverPoint => Array.isArray(v) && v.length === 2 && v.every(finite);
const keys = (v: Record<string, unknown>, names: readonly string[]) => Object.keys(v).every(k => names.includes(k));
const settingKeys = [
  "roadWidthMeters",
  "minimumTurnRadiusMeters",
  "minimumStraightMeters",
  "minimumFinalStraightMeters",
  "turnPenaltyMetersPerRadian",
  "maxEnvelopeErrorMeters",
  "maxArcSections",
  "maxNodes",
  "maxEdges",
  "maxLabels",
  "maxExpansions"
] as const;
function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (record(a) && record(b))
    return (
      Object.keys(a).length === Object.keys(b).length &&
      Object.keys(a).every(k => Object.hasOwn(b, k) && equal(a[k], b[k]))
    );
  return false;
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function saveCorridor(source: NetworkCorridor): SavedLandCorridor {
  const i = source.input;
  return {
    corridor: {
      guideNodeIds: [...source.corridor.guideNodeIds],
      pieces: source.corridor.pieces.map(p =>
        p.kind === "line"
          ? { kind: "line", start: [...p.start], end: [...p.end], lengthMeters: p.lengthMeters }
          : {
              kind: "arc",
              start: [...p.start],
              end: [...p.end],
              lengthMeters: p.lengthMeters,
              center: [...p.center],
              radiusMeters: p.radiusMeters,
              startAngle: p.startAngle,
              sweep: p.sweep
            }
      ),
      distanceMeters: source.corridor.distanceMeters,
      costMeters: source.corridor.costMeters
    },
    contract: {
      nodes: i.nodes.map(n => ({ id: n.id, point: [...n.point], neighbors: [...n.neighbors] })),
      startNodeId: i.startNodeId,
      goalNodeId: i.goalNodeId,
      ...(i.startTangent ? { startTangent: [...i.startTangent] as RiverPoint } : {}),
      goalTangent: [...i.goalTangent],
      settings: Object.fromEntries(settingKeys.map(k => [k, i.settings[k]])) as unknown as ApproachCorridorSettings,
      requiresEdgePenalty: !!i.edgePenaltyMeters
    }
  };
}
/** Versioned independent data, never serialized water indices or functions.
 * Source contracts are saved, not reconstructed from route cells or drawn paths. */
export function saveRegisteredLandConnections(
  snapshot: LandConnectionSnapshot,
  current: Pick<LandArchiveCurrent, "worldIdentity" | "environment" | "nodePointAt">,
  budgets: LandArchiveBudgets
): { json: string; archive: RegisteredLandConnectionArchive } | { reason: string } {
  if (!validBudgets(budgets)) return { reason: "invalid-budget" };
  if (typeof current.worldIdentity !== "string" || !current.worldIdentity.length)
    return { reason: "missing-world-identity" };
  if (!isRegisteredLandConnectionSnapshot(snapshot)) return { reason: "unregistered-snapshot" };
  if (snapshot.facilityIds.length && typeof current.environment.allowsBridgeFootprint !== "function")
    return { reason: "missing-current-contract" };
  if (
    snapshot.network.nodes.length > budgets.maxNodes ||
    snapshot.network.edges.length > budgets.maxEdges ||
    snapshot.facilityIds.length > budgets.maxFacilities
  )
    return { reason: "graph-budget" };
  if (
    typeof current.nodePointAt !== "function" ||
    snapshot.network.nodes.some(n => !equal(n.point, current.nodePointAt(n.id)))
  )
    return { reason: "changed-nodes" };
  const result = getConstrainedNetworkConnections(snapshot.network, current.environment);
  if (!("connections" in result)) return result;
  const facilities = new Map<number, RegisteredLandConnectionArchive["facilities"][number]>();
  const connections: SavedLandConnection[] = result.connections.map(c => {
    const base = {
      id: c.id,
      from: c.from,
      to: c.to,
      bidirectional: c.bidirectional,
      constructionCostMeters: c.constructionCostMeters ?? 0
    };
    if (c.kind === "land") return { ...base, kind: "land", land: saveCorridor(c.land) };
    const d = c.crossingInput.dimensions;
    facilities.set(c.crossing.id, {
      crossing: c.crossing,
      dimensions: {
        bankSeatMeters: d.bankSeatMeters,
        straightApproachMeters: d.straightApproachMeters,
        roadWidthMeters: d.roadWidthMeters,
        localWindowMeters: d.localWindowMeters
      }
    });
    return {
      ...base,
      kind: "bridge",
      facilityId: c.crossing.id,
      approachA: saveCorridor(c.approachA),
      approachB: saveCorridor(c.approachB),
      useCostMeters: c.useCostMeters,
      approachConstructionCostMeters: c.approachConstructionCostMeters ?? 0
    };
  });
  const archive: RegisteredLandConnectionArchive = {
    schemaVersion: 1,
    coordinateUnit: "metres",
    worldIdentity: current.worldIdentity,
    revision: snapshot.revision,
    roadWidthMeters: snapshot.network.roadWidthMeters,
    nodes: snapshot.network.nodes.map(n => ({ id: n.id, point: [...n.point] })),
    facilities: [...facilities.values()].sort((a, b) => a.crossing.id - b.crossing.id),
    connections
  };
  for (const facility of archive.facilities) {
    const source = current.environment.crossingInputAt(facility.crossing.id);
    if (!source) return { reason: "changed-facility" };
    const expected = createProvisionalRiverCrossing({
      ...source,
      otherWater: [],
      waterIndex: current.environment.water,
      supportsDryFootprint: current.environment.supportsDryFootprint
    });
    if (!("candidate" in expected) || !equal(facility.crossing, expected.candidate))
      return { reason: "changed-facility" };
  }
  const json = JSON.stringify(archive);
  if (json.length > budgets.maxJsonCharacters) return { reason: "json-budget" };
  const checked = decode(json, budgets);
  if ("reason" in checked) return checked;
  return { json, archive: freeze(archive) };
}
function validBudgets(b: LandArchiveBudgets): boolean {
  return [
    b.maxJsonCharacters,
    b.maxFacilities,
    b.maxNodes,
    b.maxEdges,
    b.maxCorridorPieces,
    b.maxGuideNodes,
    b.maxGuideEdges,
    b.maxArcSections
  ].every(v => Number.isSafeInteger(v) && v > 0);
}
function decode(
  json: string,
  b: LandArchiveBudgets
): { archive: RegisteredLandConnectionArchive } | { reason: string } {
  if (!validBudgets(b)) return { reason: "invalid-budget" };
  if (typeof json !== "string") return { reason: "invalid-json" };
  if (json.length > b.maxJsonCharacters) return { reason: "json-budget" };
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    return { reason: "invalid-json" };
  }
  if (!record(v) || v.schemaVersion !== 1 || v.coordinateUnit !== "metres") return { reason: "unsupported-schema" };
  if (
    !keys(v, [
      "schemaVersion",
      "coordinateUnit",
      "worldIdentity",
      "revision",
      "roadWidthMeters",
      "nodes",
      "facilities",
      "connections"
    ])
  )
    return { reason: "invalid-archive" };
  if (
    typeof v.worldIdentity !== "string" ||
    !v.worldIdentity.length ||
    !id(v.revision) ||
    !finite(v.roadWidthMeters) ||
    v.roadWidthMeters <= 0 ||
    !Array.isArray(v.nodes) ||
    !Array.isArray(v.facilities) ||
    !Array.isArray(v.connections)
  )
    return { reason: "invalid-archive" };
  if (v.nodes.length > b.maxNodes || v.facilities.length > b.maxFacilities || v.connections.length > b.maxEdges)
    return { reason: "graph-budget" };
  if (
    v.nodes.some(n => !record(n) || !keys(n, ["id", "point"]) || !id(n.id) || !point(n.point)) ||
    new Set(v.nodes.map(n => n.id)).size !== v.nodes.length
  )
    return { reason: "invalid-node" };
  let pieces = 0,
    nodes = 0,
    edges = 0,
    directed = 0,
    budgetExceeded = false;
  function corridor(x: unknown): boolean {
    if (!record(x) || !record(x.corridor) || !record(x.contract)) return false;
    const c = x.corridor,
      i = x.contract;
    if (
      !keys(x, ["corridor", "contract"]) ||
      !keys(c, ["guideNodeIds", "pieces", "distanceMeters", "costMeters"]) ||
      !keys(i, ["nodes", "startNodeId", "goalNodeId", "startTangent", "goalTangent", "settings", "requiresEdgePenalty"])
    )
      return false;
    if (
      !Array.isArray(c.pieces) ||
      !Array.isArray(c.guideNodeIds) ||
      !finite(c.distanceMeters) ||
      c.distanceMeters < 0 ||
      !finite(c.costMeters) ||
      c.costMeters < 0 ||
      !Array.isArray(i.nodes) ||
      !id(i.startNodeId) ||
      !id(i.goalNodeId) ||
      !point(i.goalTangent) ||
      (i.startTangent !== undefined && !point(i.startTangent)) ||
      typeof i.requiresEdgePenalty !== "boolean" ||
      !record(i.settings)
    )
      return false;
    pieces += c.pieces.length;
    nodes += i.nodes.length;
    if (pieces > b.maxCorridorPieces || nodes > b.maxGuideNodes || c.guideNodeIds.length > b.maxGuideEdges + 1) {
      budgetExceeded = true;
      return false;
    }
    if (!c.guideNodeIds.every(id) || new Set(i.nodes.map(n => (record(n) ? n.id : null))).size !== i.nodes.length)
      return false;
    for (const n of i.nodes) {
      if (
        !record(n) ||
        !keys(n, ["id", "point", "neighbors"]) ||
        !id(n.id) ||
        !point(n.point) ||
        !Array.isArray(n.neighbors)
      )
        return false;
      edges += n.neighbors.length;
      if (edges > b.maxGuideEdges) {
        budgetExceeded = true;
        return false;
      }
      if (!n.neighbors.every(id) || new Set(n.neighbors).size !== n.neighbors.length) return false;
    }
    const settings = i.settings;
    if (!keys(settings, settingKeys) || !settingKeys.every(k => finite(settings[k]))) return false;
    if ((settings.maxArcSections as number) > b.maxArcSections) {
      budgetExceeded = true;
      return false;
    }
    const known = new Set(i.nodes.map(n => n.id));
    if (i.nodes.some(n => n.neighbors.some((v: number) => !known.has(v)))) return false;
    return c.pieces.every(
      p =>
        record(p) &&
        point(p.start) &&
        point(p.end) &&
        finite(p.lengthMeters) &&
        p.lengthMeters > 0 &&
        ((p.kind === "line" && keys(p, ["kind", "start", "end", "lengthMeters"])) ||
          (p.kind === "arc" &&
            keys(p, ["kind", "start", "end", "lengthMeters", "center", "radiusMeters", "startAngle", "sweep"]) &&
            point(p.center) &&
            finite(p.radiusMeters) &&
            finite(p.startAngle) &&
            finite(p.sweep)))
    );
  }
  const connectionIds = new Set<number>(),
    facilityIds = new Set<number>();
  for (const c of v.connections) {
    if (
      !record(c) ||
      !id(c.id) ||
      connectionIds.has(c.id) ||
      !id(c.from) ||
      !id(c.to) ||
      typeof c.bidirectional !== "boolean" ||
      !finite(c.constructionCostMeters) ||
      c.constructionCostMeters < 0
    )
      return { reason: "invalid-connection" };
    directed += c.bidirectional ? 2 : 1;
    if (directed > b.maxEdges) return { reason: "graph-budget" };
    connectionIds.add(c.id);
    if (c.kind === "land") {
      if (!keys(c, ["id", "from", "to", "bidirectional", "constructionCostMeters", "kind", "land"]))
        return { reason: "invalid-connection" };
      if (!corridor(c.land)) return { reason: budgetExceeded ? "graph-budget" : "invalid-corridor" };
    } else if (c.kind === "bridge") {
      if (
        !keys(c, [
          "id",
          "from",
          "to",
          "bidirectional",
          "constructionCostMeters",
          "kind",
          "facilityId",
          "approachA",
          "approachB",
          "useCostMeters",
          "approachConstructionCostMeters"
        ])
      )
        return { reason: "invalid-connection" };
      if (
        !id(c.facilityId) ||
        !finite(c.useCostMeters) ||
        c.useCostMeters <= 0 ||
        !finite(c.approachConstructionCostMeters) ||
        c.approachConstructionCostMeters < 0 ||
        !corridor(c.approachA) ||
        !corridor(c.approachB)
      )
        return { reason: budgetExceeded ? "graph-budget" : "invalid-corridor" };
      facilityIds.add(c.facilityId);
    } else return { reason: "invalid-connection" };
  }
  const seen = new Set<number>();
  for (const f of v.facilities) {
    if (
      !record(f) ||
      !keys(f, ["crossing", "dimensions"]) ||
      !record(f.crossing) ||
      !id(f.crossing.id) ||
      seen.has(f.crossing.id) ||
      !facilityIds.has(f.crossing.id) ||
      !record(f.dimensions)
    )
      return { reason: "invalid-facility" };
    seen.add(f.crossing.id);
  }
  if (seen.size !== facilityIds.size) return { reason: "missing-facility" };
  return { archive: v as unknown as RegisteredLandConnectionArchive };
}
/** No retargeting/fallback: current geometry must recreate every saved facility
 * exactly, with matching dimensions/version. All corridors are rebuilt against
 * current complete water/support/passage before one new session is registered. */
export function restoreRegisteredLandConnections(
  json: string,
  current: LandArchiveCurrent,
  budgets: LandArchiveBudgets
): ReturnType<typeof createLandConnectionRegistry> | { reason: string } {
  const decoded = decode(json, budgets);
  if ("reason" in decoded) return decoded;
  const a = decoded.archive;
  if (a.worldIdentity !== current.worldIdentity) return { reason: "changed-world" };
  if (
    typeof current.nodePointAt !== "function" ||
    typeof current.costsAt !== "function" ||
    typeof current.edgePenaltyAt !== "function" ||
    typeof current.environment.crossingInputAt !== "function" ||
    (a.facilities.length && typeof current.environment.allowsBridgeFootprint !== "function")
  )
    return { reason: "missing-current-contract" };
  if (a.nodes.some(n => !equal(n.point, current.nodePointAt(n.id)))) return { reason: "changed-nodes" };
  const facilities = new Map<number, ProvisionalRiverCrossing>();
  for (const f of a.facilities) {
    const source = current.environment.crossingInputAt(f.crossing.id);
    if (!source || !equal(f.dimensions, source.dimensions)) return { reason: "changed-facility" };
    const recreated = createProvisionalRiverCrossing({
      ...source,
      otherWater: [],
      waterIndex: current.environment.water,
      supportsDryFootprint: current.environment.supportsDryFootprint
    });
    if (!("candidate" in recreated) || !equal(f.crossing, recreated.candidate)) return { reason: "changed-facility" };
    facilities.set(f.crossing.id, recreated.candidate);
  }
  let missingPenalty = false;
  function restore(saved: SavedLandCorridor, connectionId: number, side: "land" | "A" | "B"): NetworkCorridor {
    const penalty = current.edgePenaltyAt(connectionId, side);
    if (saved.contract.requiresEdgePenalty && !penalty) missingPenalty = true;
    return {
      corridor: saved.corridor,
      input: { ...saved.contract, ...current.environment, edgePenaltyMeters: penalty ?? undefined }
    };
  }
  const connections: NetworkConnection[] = [];
  for (const c of a.connections) {
    const costs = current.costsAt(freeze(c));
    if (!costs || !finite(costs.constructionCostMeters) || costs.constructionCostMeters < 0)
      return { reason: "invalid-cost" };
    const base = {
      id: c.id,
      from: c.from,
      to: c.to,
      bidirectional: c.bidirectional,
      constructionCostMeters: costs.constructionCostMeters
    };
    if (c.kind === "land") connections.push({ ...base, kind: "land", land: restore(c.land, c.id, "land") });
    else {
      if (
        !finite(costs.useCostMeters) ||
        costs.useCostMeters <= 0 ||
        !finite(costs.approachConstructionCostMeters) ||
        costs.approachConstructionCostMeters < 0
      )
        return { reason: "invalid-cost" };
      connections.push({
        ...base,
        kind: "bridge",
        crossing: facilities.get(c.facilityId)!,
        crossingInput: current.environment.crossingInputAt(c.facilityId)!,
        approachA: restore(c.approachA, c.id, "A"),
        approachB: restore(c.approachB, c.id, "B"),
        useCostMeters: costs.useCostMeters,
        approachConstructionCostMeters: costs.approachConstructionCostMeters
      });
    }
  }
  if (missingPenalty) return { reason: "missing-edge-penalty" };
  const built = buildConstrainedLandNetwork({
    nodes: a.nodes,
    connections,
    roadWidthMeters: a.roadWidthMeters,
    environment: current.environment,
    maxNodes: budgets.maxNodes,
    maxEdges: budgets.maxEdges,
    maxCorridorPieces: budgets.maxCorridorPieces,
    maxGuideNodes: budgets.maxGuideNodes,
    maxGuideEdges: budgets.maxGuideEdges
  });
  if (!("network" in built)) return built;
  return createLandConnectionRegistry(built.network, current.environment, budgets, a.revision);
}
