import { worldContext } from "../context/worldContext";
import { Burgs } from "../generators/burgs-generator";
import { Routes } from "../generators/routes-generator";
import { dualPortHaven } from "../services/dualPortShore";
import { SettlementGeometrySession } from "../services/settlementGeometrySession";
import { generateWorldLandConnections } from "../services/worldLandConnectionRuntime";
import { useOptionsState } from "../store/optionsState";
import type { Burg, Route } from "../types/models";
import { yieldToEventLoop } from "../utils/yieldToEventLoop";
import { type MapReadyTaskContext, registerMapReadyTask, requestMapReadyTask } from "./mapReadyTaskCoordinator";
import { legacyMutation, worldRuntime } from "./worldRuntime";

const TASK_ID = "dual-port-placement";
const samePosition = (p: readonly number[], burg: Readonly<Burg>) =>
  p[2] === burg.cell && Math.hypot(p[0] - burg.x, p[1] - burg.y) < 1e-7;

/** Preserve old approaches and bridges; prepend/insert only a surveyed dry link.
 * Original convergence geometry must carry the link too, so later CE preparation
 * cannot restore endpoints at the old town location. */
export function connectRelocatedBurg(route: Route, before: Readonly<Burg>, after: Readonly<Burg>): void {
  const connect = (points: Route["points"]): Route["points"] =>
    points.flatMap((p, i) => {
      if (!samePosition(p, before)) return [p];
      const next: [number, number, number] = [after.x, after.y, before.cell];
      if (i === 0) return [next, p];
      if (i === points.length - 1) return [p, next];
      return [p, next, [...p] as [number, number, number]];
    });
  route.points = connect(route.points);
  route.fixedSettlementApproach = true;
  if (route.riverRoadConvergence) {
    route.riverRoadConvergence.originalPoints = connect(route.riverRoadConvergence.originalPoints);
    route.riverRoadConvergence.pointsKey = JSON.stringify(route.points);
  }
  route.cells = route.points.map(p => p[2]).filter((c, i, a) => !i || c !== a[i - 1]);
}

/** Same river/coast solver as generation, with detached drafts between yields. */
export async function repairDualPortPlacements(context: MapReadyTaskContext): Promise<void> {
  const world = worldContext,
    pack = world.pack;
  const candidates = pack.burgs.filter(
    b => b?.i && !b.removed && !b.lock && !b.riverPlacement?.coastConstrained && dualPortHaven(world, b) !== null
  );
  if (!candidates.length) return;
  const unit = useOptionsState.getState().distanceUnit;
  const revision = worldRuntime.readTrusted().revision;
  const current = () =>
    context.isCurrent() &&
    world.pack === pack &&
    useOptionsState.getState().distanceUnit === unit &&
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
  // Requested load tasks also wait for a paint before surveying the map.
  if (typeof requestAnimationFrame === "function") {
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  } else await yieldToEventLoop();
  if (!current()) return;
  const session = new SettlementGeometrySession();
  if (!(await drain(session.prepareSteps(world, unit)))) return;
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
  if (!current() || !proposals.length) return;
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
      return;
    }
    physical = proposedNetwork;
  }
  if (!current()) return;
  legacyMutation(() => {
    for (const { before, after } of proposals) {
      const burg = pack.burgs[before.i!];
      if (Math.hypot(after.x - before.x, after.y - before.y) > 1e-7) {
        for (const route of pack.routes) {
          if (
            route.group !== "searoutes" &&
            !route.lock &&
            route.registeredConnectionId === undefined &&
            route.points.some(p => samePosition(p, before))
          )
            connectRelocatedBurg(route, before, after);
        }
      }
      burg.x = after.x;
      burg.y = after.y;
      burg.riverPlacement = after.riverPlacement;
      burg.riverSiteStatus = after.riverSiteStatus;
      burg.waterAccess = after.waterAccess;
    }
    if (physical) {
      world.options.registeredLandConnections = staged.options.registeredLandConnections;
      world.options.registeredLandConnectionUnit = staged.options.registeredLandConnectionUnit;
      pack.routes = [...pack.routes.filter(r => r.group === "searoutes" || r.lock), ...physical.routes];
      pack.cells.routes = Routes.buildLinks(pack.routes);
    }
    return { result: undefined, topics: ["map.settlements", "map.networks"] };
  });
}

registerMapReadyTask({ id: TASK_ID, label: "Checking river and sea ports", run: repairDualPortPlacements });

export function requestDualPortPlacementRepair(): void {
  requestMapReadyTask(TASK_ID);
}

// Also cover an already displayed map when this module is installed by hot reload.
requestDualPortPlacementRepair();
