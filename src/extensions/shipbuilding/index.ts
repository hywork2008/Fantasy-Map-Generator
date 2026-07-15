import type { LayerConfig } from "../../store/layerState";
import type { ExtensionAPI, ShipbuildingMaterialRequest, ShipbuildingMaterialRequestResult } from "../hostTypes";
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
import { clearShipyardQueues, runShipyardTick } from "./generators/shipyardQueue";
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

function requestShipbuildingMaterials(
  request: Omit<ShipbuildingMaterialRequest, "result">
): ShipbuildingMaterialRequestResult {
  const detail: ShipbuildingMaterialRequest = { ...request };
  document.dispatchEvent(new CustomEvent("fmg:shipbuilding-materials-requested", { detail }));
  return detail.result ?? { status: "economyUnavailable" };
}

function recomputeAndMaybeDraw(api: ExtensionAPI): void {
  _candidates = computeShipyardCandidates();
  _portCapacity = computePortCapacity(_candidates);
  if (api.layerIsOn("toggleShipyards")) drawShipyards(_candidates);
}

export function init(api: ExtensionAPI): void {
  initShipbuildingContext(api);

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

  api.registerTimeTickHook((deltaYears, deltaMonths, deltaDays) => {
    if (!api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) return;
    // The UI's daily Advance Time loop calls this with deltaYears=0, deltaDays=1 per tick —
    // fold all three granularities into a years-equivalent so logging/build progress doesn't
    // silently stall (matches Economy's registerTimeTickHook and Nobility's tick hook).
    const effectiveDeltaYears = deltaYears + deltaMonths / 12 + deltaDays / 365.2425;
    runLoggingTick(_candidates, effectiveDeltaYears);
    const { burgs, states } = getWorldContext().pack;
    runShipyardTick(
      _candidates,
      burgs,
      states,
      effectiveDeltaYears,
      api.getEffectiveSkill,
      requestShipbuildingMaterials
    );
    runVoyageTick(burgs, states, effectiveDeltaYears);
    checkForeignInterference(_candidates, burgs, effectiveDeltaYears);
    // Refresh marker tooltips (build progress) and the overview dialog, if visible.
    if (api.layerIsOn("toggleShipyards")) drawShipyards(_candidates);
    refreshShipyardsOverviewIfOpen(_candidates, _portCapacity);
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
      _candidates = [];
      _portCapacity = new Map();
      clearShipyardQueues();
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
    clearShipyardQueues();
    recomputeAndMaybeDraw(api);
    refreshShipyardsOverviewIfOpen(_candidates, _portCapacity);
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
  _candidates = [];
  _portCapacity = new Map();
  clearShipyardQueues();
  closeShipyardsOverview();

  api.unregisterExtension(SHIPBUILDING_EXTENSION_ID);
  clearShipbuildingContext();
}
