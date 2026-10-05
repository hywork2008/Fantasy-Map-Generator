import { quadtree } from "d3";
import type { WorldContext } from "../context/worldContext";
import { evaluateCalibratedWorldCellLandConnections } from "../generators/calibratedWorldLandConnections";
import { getConstrainedNetworkConnections, type NetworkConnection } from "../generators/constrainedLandNetwork";
import type { LandConnectionSnapshot } from "../generators/landConnectionAdoption";
import { exportRegisteredLandRouteSections } from "../generators/registeredLandRouteSections";
import type { WorldCellLandProposalResult } from "../generators/worldCellLandConnectionProposals";
import {
  createWorldLandConnectionSession,
  type PrioritizedLandAdoptionSettings
} from "../generators/worldLandConnectionAdoption";
import {
  restoreWorldLandConnections,
  saveWorldLandConnections,
  type WorldLandArchiveBudgets,
  type WorldLandArchiveCurrent
} from "../generators/worldLandConnectionArchive";
import { getWorldLandProposalContext, type WorldLandProposalResult } from "../generators/worldLandConnectionProposals";
import type { RegisteredRouteSceneSettings } from "../renderers/registeredLandRouteScene";
import type { Route } from "../types/models";
import { mapUnitMeters } from "../utils/mapUnitMeters";
import { WorldRiverGeometryRegistry } from "./worldRiverGeometry";

type CalibratedInput = Parameters<typeof evaluateCalibratedWorldCellLandConnections>[2];
/** Explicit, serializable engineering/selection contract. Absence retains legacy
 * generation until stage-6 default acceptance; no trial calibration is inferred.
 */
export interface WorldLandConnectionGenerationSettings {
  calibration: CalibratedInput["calibration"];
  nearby: CalibratedInput["nearby"];
  measurements: CalibratedInput["measurements"];
  budgetPolicy: CalibratedInput["budgetPolicy"];
  settings: CalibratedInput["settings"];
  cellPolicySettings: CalibratedInput["cellPolicySettings"];
  dryBaseline: NonNullable<CalibratedInput["dryBaseline"]>;
  allowedStateIds: readonly number[];
  maximumSupportedHeight: number;
  /** Missing engineering data forbids a bridge on that river. */
  capabilities: Readonly<Record<number, ReturnType<CalibratedInput["environment"]["capabilityAt"]>>>;
  adoption: PrioritizedLandAdoptionSettings;
  archive: WorldLandArchiveBudgets;
  scene: Omit<RegisteredRouteSceneSettings, "metresPerUnit" | "originMeters" | "connectionIds">;
}
type Evaluation = WorldLandProposalResult | WorldCellLandProposalResult;
type Current = Parameters<typeof exportRegisteredLandRouteSections>[1];
interface Active {
  pack: WorldContext["pack"];
  unit: string;
  fingerprint: string;
  snapshot: LandConnectionSnapshot;
  current: Current;
  scene: RegisteredRouteSceneSettings;
}
const active = new WeakMap<WorldContext, Active>();
const failed = new WeakMap<WorldContext, { pack: WorldContext["pack"]; unit: string; fingerprint: string }>();
function fingerprint(world: Readonly<WorldContext>, unit: string, includeArchive = true): string {
  return JSON.stringify([
    world.mapId,
    world.seed,
    world.distanceScale,
    unit,
    world.graphWidth,
    world.graphHeight,
    world.options.landConnectionGeneration,
    includeArchive ? world.options.registeredLandConnections : null,
    world.pack.cells.i,
    world.pack.cells.v,
    world.pack.cells.h,
    world.pack.cells.state,
    world.pack.cells.p,
    world.pack.cells.fl,
    world.pack.cells.capacity,
    world.pack.cells.subsistenceCapacity,
    world.pack.cells.s,
    world.pack.cells.g,
    world.pack.vertices.p,
    world.pack.burgs,
    world.pack.rivers,
    world.grid.cells.temp,
    world.grid.cells.prec
  ]);
}
function contracts(result: Evaluation) {
  if (result.status !== "evaluated") return null;
  return getWorldLandProposalContext(result);
}
function archiveCurrent(
  world: Readonly<WorldContext>,
  unit: string,
  evaluate: (registry: WorldRiverGeometryRegistry) => Evaluation,
  settings: WorldLandConnectionGenerationSettings
): WorldLandArchiveCurrent | null {
  return {
    world,
    worldIdentity: JSON.stringify([
      world.mapId,
      world.seed,
      unit,
      mapUnitMeters(world.distanceScale, unit),
      world.graphWidth * mapUnitMeters(world.distanceScale, unit),
      world.graphHeight * mapUnitMeters(world.distanceScale, unit)
    ]),
    distanceUnit: unit,
    geometrySettings: settings.settings.crossings.geometry,
    connectionsAt: registry => {
      const result = evaluate(registry),
        context = contracts(result);
      if (!context || result.status !== "evaluated") return null;
      const source = getConstrainedNetworkConnections(result.network, context.environment);
      if (!("connections" in source)) return null;
      return {
        worldIdentity: context.worldIdentity,
        environment: context.environment,
        nodePointAt: context.nodePointAt,
        costsAt: saved => {
          const connection = source.connections.find(
            c => c.id === saved.id && c.from === saved.from && c.to === saved.to && c.kind === saved.kind
          );
          if (!connection) return null;
          return connection.kind === "land"
            ? { constructionCostMeters: connection.constructionCostMeters ?? 0 }
            : {
                constructionCostMeters: connection.constructionCostMeters,
                useCostMeters: connection.useCostMeters,
                approachConstructionCostMeters: connection.approachConstructionCostMeters ?? 0
              };
        },
        edgePenaltyAt: () => null
      };
    }
  };
}
function provider(world: Readonly<WorldContext>, unit: string, settings: WorldLandConnectionGenerationSettings) {
  let walking: { key: string; connections: readonly NetworkConnection[] } | null = null;
  return (registry: WorldRiverGeometryRegistry): Evaluation => {
    if (!settings.dryBaseline?.guides)
      return {
        status: "unresolved",
        reason: "invalid-input",
        diagnostics: { enumeration: null, approachAttempts: 0, assessmentSearches: 0, rejected: [], individuals: [] }
      };
    const key = fingerprint(world, unit, false);
    if (walking?.key !== key) walking = null;
    const result = evaluateCalibratedWorldCellLandConnections(world, unit, {
      ...settings,
      cityIds: world.pack.burgs.flatMap(b => (b.i && !b.removed ? [b.i] : [])),
      registry,
      baselineConnections: walking?.connections ?? [],
      ...(walking ? { dryBaseline: undefined } : {}),
      cellRules: {
        allowsCell: c => settings.allowedStateIds.includes(c.stateId),
        supportsCell: c => c.height <= settings.maximumSupportedHeight
      },
      environment: {
        capabilityAt: id =>
          settings.capabilities[id] ?? { technology: { maxFixedSpanMeters: 0, maxMovableSpanMeters: 0 } }
      }
    });
    if (!walking && result.proposal?.status === "evaluated" && fingerprint(world, unit, false) === key) {
      const context = contracts(result.proposal);
      const source = context && getConstrainedNetworkConnections(result.proposal.network, context.environment);
      if (context && source && "connections" in source)
        walking = { key, connections: source.connections.filter(c => context.baselineConnectionIds.includes(c.id)) };
    }
    return (
      result.proposal ?? {
        status: "unresolved",
        reason: "invalid-input",
        diagnostics: { enumeration: null, approachAttempts: 0, assessmentSearches: 0, rejected: [], individuals: [] }
      }
    );
  };
}
/** Prepare everything before replacing ordinary routes. Geometry remains owned
 * by the registry; route points/cells are compatibility data for map consumers.
 */
export function generateWorldLandConnections(
  world: WorldContext,
  unit: string
): { routes: Route[] } | { reason: string } {
  active.delete(world);
  failed.delete(world);
  const settings = world.options.landConnectionGeneration;
  if (!settings) return { reason: "disabled" };
  try {
    if (
      !settings.dryBaseline?.guides ||
      !Number.isFinite(settings.maximumSupportedHeight) ||
      settings.maximumSupportedHeight < 20 ||
      !Array.isArray(settings.allowedStateIds) ||
      settings.allowedStateIds.some(id => !Number.isSafeInteger(id) || id < 0)
    )
      return { reason: "invalid-cell-policy" };
    const registry = new WorldRiverGeometryRegistry(),
      evaluate = provider(world, unit, settings);
    const created = createWorldLandConnectionSession(() => evaluate(registry));
    if (!("session" in created))
      return {
        reason:
          created.evaluation?.status === "unresolved"
            ? `${created.reason}:${created.evaluation.reason}${"environmentReason" in created.evaluation ? `:${created.evaluation.environmentReason}` : ""}`
            : created.reason
      };
    const adoption = created.session.adoptPrioritized(settings.adoption);
    if (adoption.status === "unresolved") return { reason: adoption.reason ?? "adoption-unresolved" };
    const context = contracts(evaluate(registry));
    if (!context) return { reason: "changed-world" };
    const current = { environment: context.environment, nodePointAt: context.nodePointAt };
    const snapshot = created.session.snapshot,
      sections = exportRegisteredLandRouteSections(snapshot, current);
    if (!("sections" in sections)) return sections;
    const archive = archiveCurrent(world, unit, evaluate, settings);
    if (!archive) return { reason: "missing-current-contract" };
    const saved = saveWorldLandConnections(snapshot, registry, archive, settings.archive);
    if (!("json" in saved)) return saved;
    const scale = mapUnitMeters(world.distanceScale, unit);
    const centers = world.pack.cells.p.map((point, id) => ({ point, id }));
    const tree = quadtree<(typeof centers)[number]>()
      .x(c => c.point[0])
      .y(c => c.point[1])
      .addAll(centers);
    let id = world.pack.routes.reduce((largest, r) => Math.max(largest, r.i), -1) + 1;
    const routes: Route[] = [];
    let compatibilitySamples = 0;
    for (const connection of sections.sections.connections) {
      const pieces = connection.sections.flatMap(s => s.pieces);
      const points: Route["points"] = [];
      for (const piece of pieces) {
        const count =
          piece.kind === "line"
            ? Math.max(
                1,
                Math.ceil(
                  Math.hypot(piece.end[0] - piece.start[0], piece.end[1] - piece.start[1]) /
                    settings.dryBaseline.guides.spacingMeters
                )
              )
            : Math.ceil(Math.abs(piece.sweep) / (Math.PI / 32));
        if (!Number.isSafeInteger(count) || count > settings.dryBaseline.guides.maxSamples - compatibilitySamples)
          return { reason: "route-sample-budget" };
        for (let i = points.length ? 1 : 0; i <= count; i++) {
          if (++compatibilitySamples > settings.dryBaseline.guides.maxSamples) return { reason: "route-sample-budget" };
          const t = i / count;
          const p =
            i === 0
              ? piece.start
              : i === count
                ? piece.end
                : piece.kind === "line"
                  ? [
                      piece.start[0] + (piece.end[0] - piece.start[0]) * t,
                      piece.start[1] + (piece.end[1] - piece.start[1]) * t
                    ]
                  : [
                      piece.center[0] + piece.radiusMeters * Math.cos(piece.startAngle + piece.sweep * t),
                      piece.center[1] + piece.radiusMeters * Math.sin(piece.startAngle + piece.sweep * t)
                    ];
          const x = p[0] / scale,
            y = p[1] / scale,
            cell = tree.find(x, y)?.id;
          if (cell === undefined) return { reason: "missing-route-cell" };
          points.push([x, y, cell]);
        }
      }
      if (!Number.isSafeInteger(id)) return { reason: "route-id-budget" };
      routes.push({
        i: id++,
        group: "roads",
        feature: world.pack.cells.f?.[points[0][2]] ?? 0,
        points,
        cells: points.map(p => p[2]).filter((cell, i, cells) => !i || cells[i - 1] !== cell),
        registeredConnectionId: connection.id
      });
    }
    world.options.registeredLandConnections = saved.json;
    world.options.registeredLandConnectionUnit = unit;
    active.set(world, {
      pack: world.pack,
      unit,
      fingerprint: fingerprint(world, unit),
      snapshot,
      current,
      scene: { ...settings.scene, metresPerUnit: scale, originMeters: [0, 0] }
    });
    return { routes };
  } catch {
    return { reason: "invalid-generation-contract" };
  }
}
/** Saved archives reestablish provenance only through current world contracts.
 * Pack replacement, unit changes and source edits cannot inherit authorization.
 */
export function getWorldLandConnectionCurrent(
  world: Readonly<WorldContext>,
  unit: string
): { snapshot: LandConnectionSnapshot; current: Current; scene: RegisteredRouteSceneSettings } | null {
  const key = world as WorldContext,
    settings = world.options.landConnectionGeneration;
  if (!settings || !world.options.registeredLandConnections) {
    active.delete(key);
    failed.delete(key);
    return null;
  }
  let before = "";
  const reject = () => {
    active.delete(key);
    if (before && fingerprint(world, unit) === before) failed.set(key, { pack: world.pack, unit, fingerprint: before });
    return null;
  };
  try {
    before = fingerprint(world, unit);
    const failure = failed.get(key);
    if (failure?.pack === world.pack && failure.unit === unit && failure.fingerprint === before) return null;
    let found = active.get(key);
    if (!found || found.pack !== world.pack || found.unit !== unit) {
      active.delete(key);
      const evaluate = provider(world, unit, settings),
        archive = archiveCurrent(world, unit, evaluate, settings);
      if (!archive) return reject();
      const restored = restoreWorldLandConnections(world.options.registeredLandConnections, archive, settings.archive);
      if (!("registry" in restored)) return reject();
      const context = contracts(evaluate(restored.rivers));
      if (!context) return reject();
      found = {
        pack: world.pack,
        unit,
        fingerprint: before,
        snapshot: restored.registry.snapshot,
        current: { environment: context.environment, nodePointAt: context.nodePointAt },
        scene: { ...settings.scene, metresPerUnit: mapUnitMeters(world.distanceScale, unit), originMeters: [0, 0] }
      };
    } else if (found.fingerprint !== before) {
      // Revalidate the archive, including current costs, after any source edit.
      active.delete(key);
      return getWorldLandConnectionCurrent(world, unit);
    }
    if (
      !("sections" in exportRegisteredLandRouteSections(found.snapshot, found.current)) ||
      fingerprint(world, unit) !== before
    ) {
      return reject();
    }
    active.set(key, found);
    failed.delete(key);
    return { snapshot: found.snapshot, current: found.current, scene: found.scene };
  } catch {
    active.delete(key);
    return null;
  }
}
