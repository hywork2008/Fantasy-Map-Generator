import { worldContext } from "../context/worldContext";
import { Burgs } from "../generators/burgs-generator";
import { Routes } from "../generators/routes-generator";
import { burgApproachDryLink } from "../services/burgApproachDryLink";
import { updateBurgWaterAccess } from "../services/burgWaterAccess";
import { dualPortHaven } from "../services/dualPortShore";
import {
  applyStraightenedApproach,
  planDetouredBurgApproaches,
  reconnectRelocatedBurgLandRoutes,
  reconnectRelocatedBurgSeaRoutes,
  samePosition
} from "../services/relocatedBurgRoutes";
import { SettlementGeometrySession } from "../services/settlementGeometrySession";
import {
  burgCityRadiusMeters,
  describeWaterfrontIssue,
  drawnShoreNearBurg,
  settledRiverSite,
  settledShorePort,
  type WaterfrontIssue,
  waterfrontIssues
} from "../services/waterfrontSettlement";
import { generateWorldLandConnections } from "../services/worldLandConnectionRuntime";
import { simEvents } from "../simulation/events";
import { markLoadRepairCurrent } from "../simulation/loadRepairs";
import { yieldToHost } from "../simulation/ports";
import { optionsStore } from "../state/optionsStore";
import type { Burg, Route } from "../types/models";
import type { FractalizedShape } from "../utils/coastlineFractal";
import { mapUnitMeters } from "../utils/mapUnitMeters";
import { yieldToEventLoop } from "../utils/yieldToEventLoop";
import type { MapReadyTask, MapReadyTaskContext } from "./mapReadyTaskCoordinator";
import { legacyMutation, worldRuntime } from "./worldRuntime";

export const DUAL_PORT_PLACEMENT_TASK_ID = "dual-port-placement";
/** The UI shows a notice for this (detail: `{ count }`). */
export const WATERFRONT_CHECK_FAILED_EVENT = "fmg:waterfront-check-failed";

export { connectRelocatedBurg } from "../services/relocatedBurgRoutes";

/** Same river/coast solver as generation, with detached drafts between yields. */
export async function repairDualPortPlacements(context: MapReadyTaskContext): Promise<void> {
  const world = worldContext,
    pack = world.pack;
  const candidates = pack.burgs.filter(
    // Placed sites are re-searched too: generation reserved them for a provisional population.
    b => b?.i && !b.removed && !b.lock && dualPortHaven(world, b) !== null
  );
  const unit = optionsStore.getState().distanceUnit;
  const revision = worldRuntime.readTrusted().revision;
  const current = () =>
    context.isCurrent() &&
    world.pack === pack &&
    optionsStore.getState().distanceUnit === unit &&
    worldRuntime.readTrusted().revision === revision;
  let start = performance.now();
  async function drain<T>(steps: Generator<void, T>): Promise<{ value: T } | null> {
    try {
      while (current()) {
        const next = steps.next();
        if (next.done) return { value: next.value };
        if (performance.now() - start >= 8) {
          await yieldToEventLoop();
          start = performance.now();
        }
      }
      return null;
    } finally {
      steps.return(undefined as T);
    }
  }
  // Requested load tasks also wait for a paint before surveying the map (two frames in a browser).
  await yieldToHost();
  await yieldToHost();
  if (!current()) return;
  const session = new SettlementGeometrySession();
  if (candidates.length && !(await drain(session.prepareSteps(world, unit)))) return;
  const proposals: { before: Burg; after: Burg }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    if (!current()) return;
    const burg = candidates[i];
    // Preserve user-locked approaches as well as user-locked cities.
    if (pack.routes.some(route => route.lock && route.points.some(p => samePosition(p, burg)))) continue;
    const before = { ...burg };
    const proposed = await drain(Burgs.dualPortPlacementSteps(before, session));
    if (!proposed || !current()) return;
    const after = proposed.value;
    if (after) proposals.push({ before, after });
    context.reportProgress((i + 1) / candidates.length);
    await yieldToEventLoop();
    start = performance.now();
  }
  if (!current()) return;
  // A coast promotion could leave a placed river town on the estuary water.
  // Older saves also retain unresolved towns vetoed by distant folded bends.
  // Re-site it on the nearest dry bank; its roads leave the abandoned position.
  if (!candidates.length && !(await drain(session.prepareSteps(world, unit)))) return;
  const stale = new Set<number>();
  for (const burg of pack.burgs) {
    if (!burg?.i || burg.removed || burg.lock || proposals.some(p => p.after.i === burg.i)) continue;
    const folded = burg.riverSiteStatus?.status === "unresolved" && burg.riverSiteStatus.reason === "folded-banks";
    if (!folded && !Burgs.isStrandedOnRiver(burg, session, unit)) continue;
    if (pack.routes.some(route => route.lock && route.points.some(p => samePosition(p, burg)))) continue;
    const resited = await drain(Burgs.resiteOnRiverBankSteps({ ...burg }, [burg.x, burg.y], session));
    if (!resited || !current()) return;
    if (!resited.value) continue;
    proposals.push({ before: { ...burg }, after: resited.value });
    stale.add(burg.i);
  }
  // Settle every waterfront town to the radius City Editor draws, now that
  // population is final; then check each port against the same geometry.
  const scale = mapUnitMeters(world.distanceScale, unit);
  const shapes = new Map<number, FractalizedShape | null>();
  const byId = new Map(proposals.map(p => [p.after.i!, p]));
  const radius = (b: Burg) => burgCityRadiusMeters(pack, b, world.populationRate, world.urbanization);
  for (const live of pack.burgs) {
    if (!live?.i || live.removed || live.lock) continue;
    if (pack.routes.some(route => route.lock && route.points.some(p => samePosition(p, live)))) continue;
    const proposal = byId.get(live.i);
    const base = proposal?.after ?? live;
    // A river-mouth port slides along its bank toward the drawn coast.
    const towardShore = base.waterAccess?.port.sea
      ? (x: number, y: number) =>
          drawnShoreNearBurg(world, { ...base, x, y }, scale, radius(base) * 6, shapes)?.distanceMeters ?? Infinity
      : undefined;
    const settled =
      settledRiverSite(pack, base, radius(base), scale, towardShore) ??
      (base.port ? settledShorePort(world, base, radius(base), scale, shapes) : null);
    if (!settled) continue;
    const after = { ...base, ...settled };
    updateBurgWaterAccess(after, pack);
    if (proposal) proposal.after = after;
    else proposals.push({ before: { ...live }, after });
  }
  if (!current()) return;
  // Relinked roads must not double back through a town's old position.
  const dryLink = burgApproachDryLink(world, unit, session);
  if (!proposals.length) {
    const detours = planDetouredBurgApproaches(pack.routes, pack.burgs, dryLink);
    if (detours.length && current())
      legacyMutation(() => {
        for (const detour of detours) applyStraightenedApproach(detour);
        pack.cells.routes = Routes.buildLinks(pack.routes);
        return { result: undefined, topics: ["map.networks"] };
      });
    reportWaterfront(world, scale, shapes, radius);
    return;
  }
  const moved = proposals.some(({ before, after }) => Math.hypot(after.x - before.x, after.y - before.y) > 1e-7);
  let physical: { routes: Route[] } | null = null;
  let staged = world;
  if (moved && world.options.landConnectionGeneration) {
    const byId = new Map(proposals.map(p => [p.after.i, p.after]));
    staged = {
      ...world,
      pack: { ...pack, burgs: pack.burgs.map(b => byId.get(b?.i) ?? b) },
      options: { ...world.options }
    };
    // Re-engineer only the physical land network. Shipping and authored routes
    // remain intact. A failed network proposal leaves the live map untouched.
    const proposedNetwork = generateWorldLandConnections(staged, unit);
    if (!("routes" in proposedNetwork)) {
      console.warn("Dual-port placement retained existing cities:", proposedNetwork.reason);
      reportWaterfront(world, scale, shapes, radius);
      return;
    }
    physical = proposedNetwork;
  }
  if (!current()) return;
  legacyMutation(() => {
    for (const { before, after } of proposals) {
      const burg = pack.burgs[before.i!];
      reconnectRelocatedBurgLandRoutes(pack.routes, before, after, dryLink, stale.has(before.i!));
      reconnectRelocatedBurgSeaRoutes(pack.routes, before, after);
      burg.x = after.x;
      burg.y = after.y;
      burg.riverPlacement = after.riverPlacement;
      burg.riverSiteStatus = after.riverSiteStatus;
      burg.waterAccess = after.waterAccess;
    }
    const detours = planDetouredBurgApproaches(pack.routes, pack.burgs, dryLink);
    for (const detour of detours) applyStraightenedApproach(detour);
    if ((moved || detours.length) && !physical) pack.cells.routes = Routes.buildLinks(pack.routes);
    if (physical) {
      world.options.registeredLandConnections = staged.options.registeredLandConnections;
      world.options.registeredLandConnectionUnit = staged.options.registeredLandConnectionUnit;
      pack.routes = [...pack.routes.filter(r => r.group === "searoutes" || r.lock), ...physical.routes];
      pack.cells.routes = Routes.buildLinks(pack.routes);
    }
    return { result: undefined, topics: ["map.settlements", "map.networks"] };
  });
  reportWaterfront(world, scale, shapes, radius);
}

/** Record each port's waterfront check and alert: a failure is an FMG placement defect. */
function reportWaterfront(
  world: typeof worldContext,
  scale: number,
  shapes: Map<number, FractalizedShape | null>,
  radius: (burg: Burg) => number
): void {
  const failures: { burg: Burg; issues: WaterfrontIssue[] }[] = [];
  legacyMutation(() => {
    for (const burg of world.pack.burgs) {
      if (!burg?.i || burg.removed) continue;
      const issues = burg.lock ? [] : waterfrontIssues(world, burg, radius(burg), scale, shapes);
      if (issues.length) {
        burg.waterfrontCheck = { status: "failed", issues };
        failures.push({ burg, issues });
      } else delete burg.waterfrontCheck;
    }
    // Every completed run ends here; an interrupted one returns earlier and stays due.
    markLoadRepairCurrent(world.options, "dualPortPlacement");
    return { result: undefined, topics: ["map.settlements"] };
  });
  if (!failures.length) return;
  console.warn(
    `Waterfront check failed for ${failures.length} port(s); review FMG settlement, road and river placement:\n` +
      failures
        .map(({ burg, issues }) => `  #${burg.i} ${burg.name}: ${issues.map(describeWaterfrontIssue).join("; ")}`)
        .join("\n")
  );
  simEvents.dispatchEvent(new CustomEvent(WATERFRONT_CHECK_FAILED_EVENT, { detail: { count: failures.length } }));
}

/** Registered by every SimulationHost and requested after an archive load (simulation/host.ts). */
export const dualPortPlacementTask: MapReadyTask = {
  id: DUAL_PORT_PLACEMENT_TASK_ID,
  label: "Checking river and sea ports",
  run: repairDualPortPlacements
};
