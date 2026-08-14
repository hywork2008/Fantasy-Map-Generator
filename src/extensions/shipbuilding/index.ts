import type {
  ExtensionAPI,
  ShipbuildingMaterialRequest,
  ShipbuildingMaterialRequestResult,
  ShipbuildingShipGoodStockRequest,
  ShipbuildingStrategicProcurementDemand,
  ShipbuildingSurplusShipRequest
} from "../hostTypes";
import {
  isShipbuildingMerchantHullReleaseRequest,
  isShipbuildingMerchantHullReservationRequest,
  isShipbuildingMerchantHullsRequest
} from "../hostTypes";
import type { LayerConfig } from "../hostUi";
import { measureGenerationStep } from "../hostUtils";
import {
  closeShipyardsOverview,
  openShipyardsOverview,
  refreshShipyardsOverviewIfOpen
} from "./controllers/shipyards-overview";
import {
  closeVesselAssetsOverview,
  openVesselAssetsOverview,
  refreshVesselAssetsOverviewIfOpen
} from "./controllers/vessel-assets-overview";
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
  getStateNavalCrewCapacity,
  releaseMerchantHullsFromCargo,
  reserveMerchantHullsForCargo,
  runShipyardTick
} from "./generators/shipyardQueue";
import { clearShipyards, drawShipyards } from "./renderers/drawShipyards";
import { clearShipbuildingContext, getWorldContext, initShipbuildingContext } from "./shipbuildingContext";
import { ShipyardsOverviewDialog } from "./ui/dialogs/ShipyardsOverviewDialog";
import { VesselAssetsOverviewDialog } from "./ui/dialogs/VesselAssetsOverviewDialog";

export const SHIPBUILDING_EXTENSION_ID = "shipbuilding";

export const shipbuildingLayers: LayerConfig[] = [
  {
    id: "toggleShipyards",
    name: "Shipyards",
    shortcut: null,
    tooltip: "Shipyard candidates: port towns with enough nearby forest to plausibly build ships",
    svgLayers: [{ id: "shipyards", insertBefore: "icons", display: "none" }]
  }
];

let _candidates: ShipyardCandidate[] = [];
// Provisional per-burg port capacity (docs/plan/ships.md "港湾収容力（暫定案）"), fed to the
// Shipyards overview dialog via openShipyardsOverview()/refreshShipyardsOverviewIfOpen().
let _portCapacity: Map<number, PortCapacity> = new Map();
let _unsubscribe: (() => void) | null = null;
let _unregisterMapReadyTask: (() => void) | null = null;
let _unregisterResetCommand: (() => void) | null = null;
let _unregisterTickSystem: (() => void) | null = null;
let _merchantHullsRequestHandler: ((event: Event) => void) | null = null;
let _merchantHullReservationRequestHandler: ((event: Event) => void) | null = null;
let _merchantHullReleaseRequestHandler: ((event: Event) => void) | null = null;
let _caravanHullPositionsHandler: ((event: Event) => void) | null = null;
let _fleetCapacityRequestHandler: ((event: Event) => void) | null = null;

function isFleetCapacityRequest(value: unknown): value is { stateId: number; capacity?: number; handled: boolean } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.stateId === "number" && typeof record.handled === "boolean";
}

function publishMerchantHullSnapshot(): void {
  document.dispatchEvent(
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
  document.dispatchEvent(new CustomEvent("fmg:shipbuilding-materials-requested", { detail }));
  return detail.result ?? { status: "economyUnavailable" };
}

function notifyStrategicProcurementDemand(demand: ShipbuildingStrategicProcurementDemand): void {
  document.dispatchEvent(new CustomEvent("fmg:shipbuilding-strategic-procurement-demand", { detail: demand }));
}

function requestShipGoodStock(marketId: number) {
  const detail: ShipbuildingShipGoodStockRequest = { marketId };
  document.dispatchEvent(new CustomEvent("fmg:shipbuilding-ship-good-stock-request", { detail }));
  return detail.result;
}

function notifySurplusShipCompleted(burgId: number, marketId: number, shipClassId: string): boolean {
  const detail: ShipbuildingSurplusShipRequest = { burgId, marketId, shipClassId };
  document.dispatchEvent(new CustomEvent("fmg:shipbuilding-surplus-ship-completed", { detail }));
  return detail.result === "fulfilled";
}

function recomputeAndMaybeDraw(api: ExtensionAPI): void {
  _candidates = computeShipyardCandidates();
  _portCapacity = computePortCapacity(_candidates);
  if (api.layerIsOn("toggleShipyards")) drawShipyards(_candidates);
}

export function init(api: ExtensionAPI): void {
  initShipbuildingContext(api);

  _fleetCapacityRequestHandler = event => {
    if (!api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) return;
    const detail = (event as CustomEvent<unknown>).detail;
    if (!isFleetCapacityRequest(detail)) return;
    const fleetCrew = getWorldContext().options.military?.find(unit => unit.name === "fleet")?.crew ?? 100;
    detail.capacity = Math.floor(getStateNavalCrewCapacity(detail.stateId) / Math.max(1, fleetCrew));
    detail.handled = true;
  };
  document.addEventListener("fmg:shipbuilding-fleet-capacity-request", _fleetCapacityRequestHandler);

  _merchantHullsRequestHandler = event => {
    if (!api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) return;
    const detail = (event as CustomEvent<unknown>).detail;
    if (!isShipbuildingMerchantHullsRequest(detail)) return;
    detail.handled = true;
    publishMerchantHullSnapshot();
  };
  document.addEventListener("fmg:shipbuilding-merchant-hulls-request", _merchantHullsRequestHandler);

  _merchantHullReservationRequestHandler = event => {
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
  };
  document.addEventListener(
    "fmg:shipbuilding-merchant-hull-reservation-request",
    _merchantHullReservationRequestHandler
  );

  _merchantHullReleaseRequestHandler = event => {
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
  };
  document.addEventListener("fmg:shipbuilding-merchant-hull-release-request", _merchantHullReleaseRequestHandler);

  _caravanHullPositionsHandler = (event: Event) => {
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
  };
  document.addEventListener("fmg:economy-caravan-hull-positions", _caravanHullPositionsHandler);

  _unregisterResetCommand = api.registerExtensionCommand({
    extensionId: SHIPBUILDING_EXTENSION_ID,
    name: "reset",
    execute: value => {
      if (value !== undefined) throw new Error("shipbuilding.reset does not accept a payload");
      resetShipbuildingState();
      return { changed: true };
    }
  });

  api.registerExtension(
    {
      id: SHIPBUILDING_EXTENSION_ID,
      name: "Shipbuilding",
      description:
        "Identifies port towns with nearby forest suited to shipbuilding, as a foundation for Age of Sail mechanics.",
      // Optional: logging ticks notify Economy's Wood good via a CustomEvent (loose
      // coupling, no direct import) so local timber output depletes over time. Works
      // without Economy enabled — the event is just never picked up.
      dependencies: [{ id: "economy", required: false }]
    },
    false
  );

  api.registerAction({
    id: "shipbuilding-regenerate-shipyards",
    extensionId: SHIPBUILDING_EXTENSION_ID,
    tab: "tools",
    section: "regenerate",
    label: "Shipyards",
    tooltip: "Click to recompute shipyard candidate towns",
    onClick: () => recomputeAndMaybeDraw(api)
  });

  api.registerDialog({
    id: "ShipyardsOverviewDialog",
    extensionId: SHIPBUILDING_EXTENSION_ID,
    component: ShipyardsOverviewDialog
  });
  api.registerDialog({
    id: "VesselAssetsOverviewDialog",
    extensionId: SHIPBUILDING_EXTENSION_ID,
    component: VesselAssetsOverviewDialog
  });

  api.registerAction({
    id: "shipbuilding-view-shipyards",
    extensionId: SHIPBUILDING_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    label: "Shipyards",
    dialogId: "ShipyardsOverviewDialog",
    tooltip: "View all shipyards, their build progress, and completed hulls",
    onClick: () => {
      if (api.isDialogOpen("ShipyardsOverviewDialog")) {
        closeShipyardsOverview();
      } else {
        openShipyardsOverview(_candidates, _portCapacity, (x, y) => api.zoomTo(x, y, 8));
      }
    }
  });
  api.registerAction({
    id: "shipbuilding-view-vessel-assets",
    extensionId: SHIPBUILDING_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    label: "Vessel assets",
    dialogId: "VesselAssetsOverviewDialog",
    tooltip: "View completed state and merchant vessels by owner, port, class, and status",
    onClick: () => {
      if (api.isDialogOpen("VesselAssetsOverviewDialog")) closeVesselAssetsOverview();
      else openVesselAssetsOverview();
    }
  });

  api.registerLayerToggle("toggleShipyards", (_event?: MouseEvent) => {
    if (!api.layerIsOn("toggleShipyards")) {
      api.turnLayerOn("toggleShipyards");
      drawShipyards(_candidates);
    } else {
      clearShipyards();
      api.turnLayerOff("toggleShipyards");
    }
  });

  api.registerDrawLayerHook(() => {
    if (api.layerIsOn("toggleShipyards")) drawShipyards(_candidates);
  });

  api.registerLayerElement("toggleShipyards", () => document.getElementById("shipyards"));

  // Economy phase: lexical id places this after `economy.tick`. Logging events fire
  // before Economy's production-settlement microtask (scheduled from economy.tick).
  _unregisterTickSystem = api.registerSimulationSystem({
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
      refreshShipyardsOverviewIfOpen(_candidates, _portCapacity);
      refreshVesselAssetsOverviewIfOpen();
      writer.markChanged("extension.shipbuilding", "extension.economy", "extension.nobility");
    }
  });

  _unsubscribe = api.subscribeExtensionState((state, prevState) => {
    const isEnabled = state.enabledExtensions[SHIPBUILDING_EXTENSION_ID];
    const wasEnabled = prevState.enabledExtensions[SHIPBUILDING_EXTENSION_ID];

    if (isEnabled && !wasEnabled) {
      api.addLayers(shipbuildingLayers);
      publishMerchantHullSnapshot();
      api.requestMapReadyTask("shipbuilding.initialization");
    } else if (!isEnabled && wasEnabled) {
      if (api.layerIsOn("toggleShipyards")) api.toggleLayerById("toggleShipyards");
      api.removeLayers(shipbuildingLayers.map(l => l.id));
      api.dispatchExtensionCommand({ extensionId: SHIPBUILDING_EXTENSION_ID, name: "reset", payload: undefined });
      document.dispatchEvent(new CustomEvent("fmg:shipbuilding-merchant-hulls-unavailable"));
      closeShipyardsOverview();
      closeVesselAssetsOverview();
    }
  });

  if (api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) {
    api.addLayers(shipbuildingLayers);
    publishMerchantHullSnapshot();
  }

  _unregisterMapReadyTask = api.registerMapReadyTask({
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
        recomputeAndMaybeDraw(api);
      });

      if (!context.isCurrent() || !api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) return;
      measureGenerationStep("generateShipbuildingInitialFleet", () => {
        // Port-owning states receive historically weighted starter hulls so Vessel assets
        // is not empty at game start (docs/plan/shipbuilding-initial-fleet.md).
        seedInitialFleets(_candidates, _portCapacity);
        publishMerchantHullSnapshot();
        refreshShipyardsOverviewIfOpen(_candidates, _portCapacity);
        refreshVesselAssetsOverviewIfOpen();
      });

      if (!context.isCurrent() || !api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) return;
      measureGenerationStep("generateShipbuildingInitialStock", () => {
        const demands = getInitialStateOwnedDemand(_candidates, getWorldContext().pack.burgs);
        if (!demands.length) return;
        document.dispatchEvent(
          new CustomEvent("fmg:shipbuilding-initial-stock-request", { detail: { source: "shipbuilding", demands } })
        );
      });
    }
  });
}

export function cleanup(api: ExtensionAPI): void {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  _unregisterMapReadyTask?.();
  _unregisterMapReadyTask = null;

  api.removeLayers(shipbuildingLayers.map(l => l.id));
  api.dispatchExtensionCommand({ extensionId: SHIPBUILDING_EXTENSION_ID, name: "reset", payload: undefined });
  closeShipyardsOverview();
  closeVesselAssetsOverview();

  _unregisterResetCommand?.();
  _unregisterResetCommand = null;
  _unregisterTickSystem?.();
  _unregisterTickSystem = null;

  api.unregisterExtension(SHIPBUILDING_EXTENSION_ID);
  document.dispatchEvent(new CustomEvent("fmg:shipbuilding-merchant-hulls-unavailable"));
  if (_merchantHullsRequestHandler) {
    document.removeEventListener("fmg:shipbuilding-merchant-hulls-request", _merchantHullsRequestHandler);
    _merchantHullsRequestHandler = null;
  }
  if (_merchantHullReservationRequestHandler) {
    document.removeEventListener(
      "fmg:shipbuilding-merchant-hull-reservation-request",
      _merchantHullReservationRequestHandler
    );
    _merchantHullReservationRequestHandler = null;
  }
  if (_merchantHullReleaseRequestHandler) {
    document.removeEventListener("fmg:shipbuilding-merchant-hull-release-request", _merchantHullReleaseRequestHandler);
    _merchantHullReleaseRequestHandler = null;
  }
  if (_caravanHullPositionsHandler) {
    document.removeEventListener("fmg:economy-caravan-hull-positions", _caravanHullPositionsHandler);
    _caravanHullPositionsHandler = null;
  }
  if (_fleetCapacityRequestHandler) {
    document.removeEventListener("fmg:shipbuilding-fleet-capacity-request", _fleetCapacityRequestHandler);
    _fleetCapacityRequestHandler = null;
  }
  clearShipbuildingContext();
}
