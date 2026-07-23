import type {
  ExtensionAPI,
  ShipbuildingMaterialRequest,
  ShipbuildingMaterialRequestResult,
  ShipbuildingShipGoodStockRequest,
  ShipbuildingStrategicProcurementDemand,
  ShipbuildingSurplusShipRequest
} from "../hostTypes";
import type { LayerConfig } from "../hostUi";
import {
  closeShipyardsOverview,
  openShipyardsOverview,
  refreshShipyardsOverviewIfOpen
} from "./controllers/shipyards-overview";
import { checkForeignInterference } from "./generators/foreignInterference";
import { runLoggingTick } from "./generators/logging";
import { computePortCapacity, type PortCapacity } from "./generators/portCapacity";
import { runVoyageTick } from "./generators/shipVoyages";
import { computeShipyardCandidates, type ShipyardCandidate } from "./generators/shipyardCandidates";
import { clearShipyardQueues, getInitialStateOwnedDemand, runShipyardTick } from "./generators/shipyardQueue";
import { clearShipyards, drawShipyards } from "./renderers/drawShipyards";
import { clearShipbuildingContext, getWorldContext, initShipbuildingContext } from "./shipbuildingContext";
import { ShipyardsOverviewDialog } from "./ui/dialogs/ShipyardsOverviewDialog";

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
let _generatePostCoreHandler: (() => void) | null = null;
let _unregisterResetCommand: (() => void) | null = null;
let _unregisterTickSystem: (() => void) | null = null;

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
      writer.markChanged("extension.shipbuilding", "extension.economy", "extension.nobility");
    }
  });

  _unsubscribe = api.subscribeExtensionState((state, prevState) => {
    const isEnabled = state.enabledExtensions[SHIPBUILDING_EXTENSION_ID];
    const wasEnabled = prevState.enabledExtensions[SHIPBUILDING_EXTENSION_ID];

    if (isEnabled && !wasEnabled) {
      api.addLayers(shipbuildingLayers);
      if (getWorldContext().pack.burgs?.length) recomputeAndMaybeDraw(api);
    } else if (!isEnabled && wasEnabled) {
      if (api.layerIsOn("toggleShipyards")) api.toggleLayerById("toggleShipyards");
      api.removeLayers(shipbuildingLayers.map(l => l.id));
      api.dispatchExtensionCommand({ extensionId: SHIPBUILDING_EXTENSION_ID, name: "reset", payload: undefined });
      closeShipyardsOverview();
    }
  });

  if (api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) {
    api.addLayers(shipbuildingLayers);
  }

  _generatePostCoreHandler = () => {
    if (!api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) return;
    // A brand-new map reuses burg/state ids from 0, so queue/tech/completed-hull
    // state tied to the previous map's ids must not carry over.
    api.dispatchExtensionCommand({ extensionId: SHIPBUILDING_EXTENSION_ID, name: "reset", payload: undefined });
    recomputeAndMaybeDraw(api);
    refreshShipyardsOverviewIfOpen(_candidates, _portCapacity);

    // Deferred to a microtask so this always runs after every fmg:generate-post-core listener
    // (including Economy's Goods/Markets/Production generation) has finished, regardless of
    // extensions/index.ts init order — same idiom Economy's own tick-hook ordering fix uses
    // (see economy/index.tsx's scheduleProductionRefresh comment). Economy must already have
    // pack.markets/pack.goods populated for the initial-stock warm-up request to do anything.
    queueMicrotask(() => {
      if (!api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) return;
      const demands = getInitialStateOwnedDemand(_candidates, getWorldContext().pack.burgs);
      if (!demands.length) return;
      document.dispatchEvent(
        new CustomEvent("fmg:shipbuilding-initial-stock-request", { detail: { source: "shipbuilding", demands } })
      );
    });
  };
  document.addEventListener("fmg:generate-post-core", _generatePostCoreHandler);
}

export function cleanup(api: ExtensionAPI): void {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  if (_generatePostCoreHandler) {
    document.removeEventListener("fmg:generate-post-core", _generatePostCoreHandler);
    _generatePostCoreHandler = null;
  }

  api.removeLayers(shipbuildingLayers.map(l => l.id));
  api.dispatchExtensionCommand({ extensionId: SHIPBUILDING_EXTENSION_ID, name: "reset", payload: undefined });
  closeShipyardsOverview();

  _unregisterResetCommand?.();
  _unregisterResetCommand = null;
  _unregisterTickSystem?.();
  _unregisterTickSystem = null;

  api.unregisterExtension(SHIPBUILDING_EXTENSION_ID);
  clearShipbuildingContext();
}
