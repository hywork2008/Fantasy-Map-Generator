import type { WorldContext } from "../context/worldContext";
import { WorldRiverGeometryRegistry, type WorldRiverGeometrySettings } from "../services/worldRiverGeometry";
import { isRegisteredLandConnectionSnapshot, type LandConnectionSnapshot } from "./landConnectionAdoption";
import {
  type LandArchiveBudgets,
  type LandArchiveCurrent,
  restoreRegisteredLandConnections,
  saveRegisteredLandConnections
} from "./registeredLandConnectionArchive";

export interface WorldLandArchiveBudgets {
  maxJsonCharacters: number;
  rivers: { maxJsonCharacters: number; maxRivers: number };
  connections: LandArchiveBudgets;
}
export interface WorldLandArchiveCurrent {
  world: Readonly<WorldContext>;
  worldIdentity: string;
  distanceUnit: string;
  geometrySettings: WorldRiverGeometrySettings;
  /** Build current water/terrain/cost contracts using this exact river registry. */
  connectionsAt: (registry: WorldRiverGeometryRegistry) => LandArchiveCurrent | null;
}
function validBudget(b: WorldLandArchiveBudgets): boolean {
  return Number.isSafeInteger(b.maxJsonCharacters) && b.maxJsonCharacters > 0;
}
/** Require every facility to use the reconstructed physical geometry itself,
 * not a version number copied onto an unrelated river snapshot. */
function boundToRivers(
  snapshot: LandConnectionSnapshot,
  current: WorldLandArchiveCurrent,
  contracts: LandArchiveCurrent,
  registry: WorldRiverGeometryRegistry
): boolean {
  if (contracts.worldIdentity !== current.worldIdentity) return false;
  for (const id of snapshot.facilityIds) {
    const input = contracts.environment.crossingInputAt(id);
    if (!input) return false;
    const river = current.world.pack.rivers.find(r => r.i === input.geometry.axis.riverId);
    if (!river) return false;
    const built = registry.get(current.world, river, current.distanceUnit, current.geometrySettings);
    if (!("geometry" in built) || built.geometry !== input.geometry) return false;
  }
  return true;
}
export function saveWorldLandConnections(
  snapshot: LandConnectionSnapshot,
  registry: WorldRiverGeometryRegistry,
  current: WorldLandArchiveCurrent,
  budgets: WorldLandArchiveBudgets
): { json: string } | { reason: string } {
  if (!validBudget(budgets)) return { reason: "invalid-budget" };
  if (!isRegisteredLandConnectionSnapshot(snapshot)) return { reason: "unregistered-snapshot" };
  const rivers = registry.saveVersions(
    current.world,
    current.distanceUnit,
    current.geometrySettings,
    current.worldIdentity,
    budgets.rivers
  );
  if (!rivers) return { reason: "river-archive" };
  const contracts = current.connectionsAt(registry);
  if (!contracts || !boundToRivers(snapshot, current, contracts, registry)) return { reason: "unbound-rivers" };
  const connections = saveRegisteredLandConnections(snapshot, contracts, budgets.connections);
  if ("reason" in connections) return connections;
  // Callbacks may change source data during validation. Do not emit mixed epochs.
  if (
    registry.saveVersions(
      current.world,
      current.distanceUnit,
      current.geometrySettings,
      current.worldIdentity,
      budgets.rivers
    ) !== rivers
  )
    return { reason: "changed-rivers" };
  const json = JSON.stringify({
    schemaVersion: 1,
    worldIdentity: current.worldIdentity,
    rivers,
    connections: connections.json
  });
  return json.length <= budgets.maxJsonCharacters ? { json } : { reason: "json-budget" };
}
export function restoreWorldLandConnections(
  json: string,
  current: WorldLandArchiveCurrent,
  budgets: WorldLandArchiveBudgets
) {
  if (!validBudget(budgets)) return { reason: "invalid-budget" };
  if (json.length > budgets.maxJsonCharacters) return { reason: "json-budget" };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { reason: "invalid-json" };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { reason: "invalid-archive" };
  const a = raw as Record<string, unknown>;
  if (
    Object.keys(a).sort().join() !== "connections,rivers,schemaVersion,worldIdentity" ||
    a.schemaVersion !== 1 ||
    typeof a.rivers !== "string" ||
    typeof a.connections !== "string"
  )
    return { reason: "invalid-archive" };
  if (a.worldIdentity !== current.worldIdentity) return { reason: "changed-world" };
  const rivers = WorldRiverGeometryRegistry.restoreVersions(
    a.rivers,
    current.world,
    current.distanceUnit,
    current.geometrySettings,
    current.worldIdentity,
    budgets.rivers
  );
  if (!rivers) return { reason: "river-archive" };
  const riverCheckpoint = rivers.saveVersions(
    current.world,
    current.distanceUnit,
    current.geometrySettings,
    current.worldIdentity,
    budgets.rivers
  );
  // Return the registry pair only after both archives have been revalidated together.
  const contracts = current.connectionsAt(rivers);
  if (!contracts || contracts.worldIdentity !== current.worldIdentity) return { reason: "missing-current-contract" };
  const restored = restoreRegisteredLandConnections(a.connections, contracts, budgets.connections);
  if (!("registry" in restored)) return restored;
  if (!boundToRivers(restored.registry.snapshot, current, contracts, rivers)) return { reason: "unbound-rivers" };
  const check = saveRegisteredLandConnections(restored.registry.snapshot, contracts, budgets.connections);
  if ("reason" in check) return check;
  if (
    rivers.saveVersions(
      current.world,
      current.distanceUnit,
      current.geometrySettings,
      current.worldIdentity,
      budgets.rivers
    ) !== riverCheckpoint
  )
    return { reason: "changed-rivers" };
  return { rivers, registry: restored.registry };
}
