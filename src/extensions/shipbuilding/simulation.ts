import { simEvents } from "../../simulation/events";
import type {
  ShipbuildingMaterialRequest,
  ShipbuildingMaterialRequestResult,
  ShipbuildingShipGoodStockRequest,
  ShipbuildingStrategicProcurementDemand,
  ShipbuildingSurplusShipRequest,
  SimulationExtension,
  SimulationExtensionAPI
} from "../hostTypes";
import {
  isShipbuildingMerchantHullReleaseRequest,
  isShipbuildingMerchantHullReservationRequest,
  isShipbuildingMerchantHullsRequest,
  isShipbuildingStateHullAvailabilityRequest,
  isShipbuildingStateHullReleaseRequest,
  isShipbuildingStateHullReservationRequest
} from "../hostTypes";
import { measureGenerationStep } from "../hostUtils";
import { checkForeignInterference } from "./generators/foreignInterference";
import { seedInitialFleets } from "./generators/initialFleet";
import { runLoggingTick } from "./generators/logging";
import { computePortCapacity, type PortCapacity } from "./generators/portCapacity";
import { runVoyageTick } from "./generators/shipVoyages";
import { computeShipyardCandidates, type ShipyardCandidate } from "./generators/shipyardCandidates";
import {
  applyCaravanHullPositions,
  clearShipyardQueues,
  getHulls,
  getInitialStateOwnedDemand,
  getStateNavyHullsCount,
  isStateAtWar,
  releaseMerchantHullsFromCargo,
  releaseStateHullsFromOverseasEscort,
  reserveMerchantHullsForCargo,
  reserveStateHullsForOverseasEscort,
  runShipyardTick
} from "./generators/shipyardQueue";
import { clearShipbuildingContext, getWorldContext, initShipbuildingContext } from "./shipbuildingContext";

/**
 * Shipbuilding simulation entry (docs/plan/simulation-core-separation.md §7, S5): shipyard state,
 * the tick system, the request/response events Economy and Nobility use, and the map-ready task.
 * The layer, dialogs and overview refreshes stay in `index.ts`, driven by SHIPBUILDING_CHANGED_EVENT.
 */

export const SHIPBUILDING_EXTENSION_ID = "shipbuilding";

/** Shipyard or hull data changed; `detail.redrawShipyards` asks the view to redraw the layer. */
export const SHIPBUILDING_CHANGED_EVENT = "fmg:shipbuilding-changed";

let _candidates: ShipyardCandidate[] = [];
// Provisional per-burg port capacity (docs/plan/ships.md "港湾収容力（暫定案）"), fed to the
// Shipyards overview dialog.
let _portCapacity: Map<number, PortCapacity> = new Map();

export function getShipyardCandidates(): ShipyardCandidate[] {
  return _candidates;
}

export function getPortCapacity(): Map<number, PortCapacity> {
  return _portCapacity;
}

function notifyShipbuildingChanged(detail: { redrawShipyards?: boolean } = {}): void {
  simEvents.dispatchEvent(new CustomEvent(SHIPBUILDING_CHANGED_EVENT, { detail }));
}

function isFleetCapacityRequest(value: unknown): value is { stateId: number; capacity?: number; handled: boolean } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.stateId === "number" && typeof record.handled === "boolean";
}

function publishMerchantHullSnapshot(): void {
  simEvents.dispatchEvent(
    new CustomEvent("fmg:shipbuilding-merchant-hulls-snapshot", {
      detail: {
        hulls: getHulls()
          .filter(hull => hull.owner === "market")
          .map(hull => ({
            id: hull.id,
            shipClassId: hull.shipClassId,
            homeBurgId: hull.homeBurgId,
            ownerId: hull.ownerId,
            status: hull.status,
            currentBurgId: hull.currentBurgId ?? null,
            nextBurgId: hull.nextBurgId ?? null,
            caravanId: hull.caravanId ?? null,
            routeProgress: hull.routeProgress ?? 0,
            duty: hull.duty
          }))
      }
    })
  );
}

function resetShipbuildingState(): void {
  _candidates = [];
  _portCapacity = new Map();
  clearShipyardQueues();
}

function requestShipbuildingMaterials(
  request: Omit<ShipbuildingMaterialRequest, "result">
): ShipbuildingMaterialRequestResult {
  const detail: ShipbuildingMaterialRequest = { ...request };
  simEvents.dispatchEvent(new CustomEvent("fmg:shipbuilding-materials-requested", { detail }));
  return detail.result ?? { status: "economyUnavailable" };
}

function notifyStrategicProcurementDemand(demand: ShipbuildingStrategicProcurementDemand): void {
  simEvents.dispatchEvent(new CustomEvent("fmg:shipbuilding-strategic-procurement-demand", { detail: demand }));
}

function requestShipGoodStock(marketId: number) {
  const detail: ShipbuildingShipGoodStockRequest = { marketId };
  simEvents.dispatchEvent(new CustomEvent("fmg:shipbuilding-ship-good-stock-request", { detail }));
  return detail.result;
}

function notifySurplusShipCompleted(burgId: number, marketId: number, shipClassId: string): boolean {
  const detail: ShipbuildingSurplusShipRequest = { burgId, marketId, shipClassId };
  simEvents.dispatchEvent(new CustomEvent("fmg:shipbuilding-surplus-ship-completed", { detail }));
  return detail.result === "fulfilled";
}

/** Recomputes shipyard candidates and port capacity from the current map. */
export function recomputeShipyards(): void {
  _candidates = computeShipyardCandidates();
  _portCapacity = computePortCapacity(_candidates);
}

function register(api: SimulationExtensionAPI): () => void {
  initShipbuildingContext(api);
  const listeners: [string, (event: Event) => void][] = [];
  const on = (type: string, listener: (event: Event) => void) => {
    api.events.addEventListener(type, listener);
    listeners.push([type, listener]);
  };

  on("fmg:shipbuilding-fleet-capacity-request", event => {
    if (!api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) return;
    const detail = (event as CustomEvent<unknown>).detail;
    if (!isFleetCapacityRequest(detail)) return;
    detail.capacity = getStateNavyHullsCount(detail.stateId);
    detail.handled = true;
  });

  on("fmg:shipbuilding-merchant-hulls-request", event => {
    if (!api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) return;
    const detail = (event as CustomEvent<unknown>).detail;
    if (!isShipbuildingMerchantHullsRequest(detail)) return;
    detail.handled = true;
    publishMerchantHullSnapshot();
  });

  on("fmg:shipbuilding-merchant-hull-reservation-request", event => {
    if (!api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) return;
    const detail = (event as CustomEvent<unknown>).detail;
    if (!isShipbuildingMerchantHullReservationRequest(detail)) return;
    detail.result = reserveMerchantHullsForCargo({
      hullIds: detail.hullIds,
      caravanId: detail.caravanId,
      originBurgId: detail.originBurgId,
      destinationBurgId: detail.destinationBurgId
    })
      ? "fulfilled"
      : "unavailable";
  });

  on("fmg:shipbuilding-merchant-hull-release-request", event => {
    if (!api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) return;
    const detail = (event as CustomEvent<unknown>).detail;
    if (!isShipbuildingMerchantHullReleaseRequest(detail)) return;
    if (detail.outcome === "lost") {
      // releaseMerchantHullsFromCargo handles maintenance; keep path for batch validation.
      detail.result = releaseMerchantHullsFromCargo({
        hullIds: detail.hullIds,
        outcome: "lost",
        destinationBurgId: detail.destinationBurgId
      })
        ? "fulfilled"
        : "unavailable";
      return;
    }
    detail.result = releaseMerchantHullsFromCargo({
      hullIds: detail.hullIds,
      outcome: "arrived",
      destinationBurgId: detail.destinationBurgId
    })
      ? "fulfilled"
      : "unavailable";
  });

  on("fmg:shipbuilding-state-hull-availability-request", event => {
    if (!api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) return;
    const detail = (event as CustomEvent<unknown>).detail;
    if (!isShipbuildingStateHullAvailabilityRequest(detail)) return;
    if (isStateAtWar(detail.stateId, getWorldContext().pack.states)) {
      detail.hullIds = [];
      return;
    }
    detail.hullIds = getHulls()
      .filter(
        hull =>
          hull.owner === "state" &&
          hull.ownerId === detail.stateId &&
          hull.status !== "maintenance" &&
          hull.duty !== "overseas" &&
          (hull.status === "docked" || hull.status === "voyage")
      )
      .map(hull => hull.id);
  });

  on("fmg:shipbuilding-state-hull-reservation-request", event => {
    if (!api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) return;
    const detail = (event as CustomEvent<unknown>).detail;
    if (!isShipbuildingStateHullReservationRequest(detail)) return;
    detail.result =
      !isStateAtWar(detail.stateId, getWorldContext().pack.states) &&
      reserveStateHullsForOverseasEscort({
        stateId: detail.stateId,
        expeditionId: detail.expeditionId,
        hullIds: detail.hullIds
      })
        ? "fulfilled"
        : "unavailable";
    notifyShipbuildingChanged();
  });

  on("fmg:shipbuilding-state-hull-release-request", event => {
    if (!api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) return;
    const detail = (event as CustomEvent<unknown>).detail;
    if (!isShipbuildingStateHullReleaseRequest(detail)) return;
    detail.result = releaseStateHullsFromOverseasEscort({
      expeditionId: detail.expeditionId,
      hullIds: detail.hullIds,
      outcome: detail.outcome
    })
      ? "fulfilled"
      : "unavailable";
    notifyShipbuildingChanged();
  });

  on("fmg:economy-caravan-hull-positions", (event: Event) => {
    if (!api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) return;
    const detail = (event as CustomEvent<{ updates?: unknown }>).detail;
    if (!detail || !Array.isArray(detail.updates)) return;
    const updates = detail.updates.filter(
      (
        u
      ): u is {
        hullId: number;
        caravanId: number;
        originBurgId: number | null;
        destinationBurgId: number | null;
        progress: number;
        phase: "transit" | "loading";
      } =>
        Boolean(u) &&
        typeof u === "object" &&
        typeof (u as { hullId?: unknown }).hullId === "number" &&
        typeof (u as { caravanId?: unknown }).caravanId === "number" &&
        typeof (u as { progress?: unknown }).progress === "number" &&
        ((u as { phase?: unknown }).phase === "transit" || (u as { phase?: unknown }).phase === "loading")
    );
    if (updates.length) applyCaravanHullPositions(updates);
  });

  const unregisterResetCommand = api.registerExtensionCommand({
    extensionId: SHIPBUILDING_EXTENSION_ID,
    name: "reset",
    execute: value => {
      if (value !== undefined) throw new Error("shipbuilding.reset does not accept a payload");
      resetShipbuildingState();
      return { changed: true };
    }
  });

  // Economy phase: lexical id places this after `economy.tick`. Logging events fire
  // before Economy's production-settlement microtask (scheduled from economy.tick).
  const unregisterTickSystem = api.registerSimulationSystem({
    id: "shipbuilding.tick",
    phase: "economy",
    reads: ["map.settlements", "map.politics", "extension.shipbuilding", "extension.economy"],
    writes: ["extension.shipbuilding", "extension.economy", "extension.nobility"],
    cadence: { every: 1 },
    profileLabel: "shipbuilding",
    run: (context, writer) => {
      if (!api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) return;
      // The UI's daily Advance Time loop calls this with deltaYears=0, deltaDays=1 per tick —
      // fold all three granularities into a years-equivalent so logging/build progress doesn't
      // silently stall (matches Economy and Nobility systems).
      const { years: deltaYears, months: deltaMonths, days: deltaDays } = context.delta;
      const effectiveDeltaYears = deltaYears + deltaMonths / 12 + deltaDays / 365.2425;
      runLoggingTick(_candidates, effectiveDeltaYears);
      const { burgs, states } = getWorldContext().pack;
      runShipyardTick(
        _candidates,
        burgs,
        states,
        effectiveDeltaYears,
        api.getEffectiveSkill,
        requestShipbuildingMaterials,
        notifyStrategicProcurementDemand,
        requestShipGoodStock,
        notifySurplusShipCompleted,
        _portCapacity
      );
      runVoyageTick(burgs, states, effectiveDeltaYears);
      checkForeignInterference(_candidates, burgs, effectiveDeltaYears);
      // Layer redraw goes through RenderCoordinator + registerDrawLayerHook after
      // extension.* topics commit (P2-12). Overview is a dialog refresh, not a map draw.
      notifyShipbuildingChanged();
      writer.markChanged("extension.shipbuilding", "extension.economy", "extension.nobility");
    }
  });

  const unsubscribe = api.subscribeExtensionState((state, prevState) => {
    const isEnabled = state.enabledExtensions[SHIPBUILDING_EXTENSION_ID];
    const wasEnabled = prevState.enabledExtensions[SHIPBUILDING_EXTENSION_ID];
    if (isEnabled && !wasEnabled) {
      publishMerchantHullSnapshot();
      api.requestMapReadyTask("shipbuilding.initialization");
    } else if (!isEnabled && wasEnabled) {
      api.dispatchExtensionCommand({ extensionId: SHIPBUILDING_EXTENSION_ID, name: "reset", payload: undefined });
      simEvents.dispatchEvent(new CustomEvent("fmg:shipbuilding-merchant-hulls-unavailable"));
    }
  });

  if (api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) publishMerchantHullSnapshot();

  const unregisterMapReadyTask = api.registerMapReadyTask({
    id: "shipbuilding.initialization",
    label: "Preparing shipyards",
    dependsOn: ["economy.initialization"],
    run: context => {
      if (!context.isCurrent() || !api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) return;
      if (!api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) return;
      measureGenerationStep("generateShipbuilding", () => {
        // A brand-new map reuses burg/state ids from 0, so queue/tech/completed-hull
        // state tied to the previous map's ids must not carry over.
        api.dispatchExtensionCommand({ extensionId: SHIPBUILDING_EXTENSION_ID, name: "reset", payload: undefined });
        recomputeShipyards();
        notifyShipbuildingChanged({ redrawShipyards: true });
      });

      if (!context.isCurrent() || !api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) return;
      measureGenerationStep("generateShipbuildingInitialFleet", () => {
        // Port-owning states receive historically weighted starter hulls so Vessel assets
        // is not empty at game start (docs/plan/shipbuilding-initial-fleet.md).
        seedInitialFleets(_candidates, _portCapacity);
        publishMerchantHullSnapshot();
        notifyShipbuildingChanged();
      });

      if (!context.isCurrent() || !api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) return;
      measureGenerationStep("generateShipbuildingInitialStock", () => {
        const demands = getInitialStateOwnedDemand(_candidates, getWorldContext().pack.burgs);
        if (!demands.length) return;
        simEvents.dispatchEvent(
          new CustomEvent("fmg:shipbuilding-initial-stock-request", { detail: { source: "shipbuilding", demands } })
        );
      });
    }
  });

  return () => {
    unsubscribe();
    unregisterMapReadyTask();
    api.dispatchExtensionCommand({ extensionId: SHIPBUILDING_EXTENSION_ID, name: "reset", payload: undefined });
    unregisterResetCommand();
    unregisterTickSystem();
    simEvents.dispatchEvent(new CustomEvent("fmg:shipbuilding-merchant-hulls-unavailable"));
    for (const [type, listener] of listeners) api.events.removeEventListener(type, listener);
    clearShipbuildingContext();
  };
}

export const shipbuildingSimulation: SimulationExtension = {
  id: SHIPBUILDING_EXTENSION_ID,
  requires: ["economy"],
  register
};
