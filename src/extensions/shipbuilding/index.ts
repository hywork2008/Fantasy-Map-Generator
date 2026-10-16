import type { ExtensionAPI } from "../hostTypes";
import type { LayerConfig } from "../hostUi";
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
import { clearShipyards, drawShipyards } from "./renderers/drawShipyards";
import { bindShipbuildingView } from "./shipbuildingContext";
import {
  getPortCapacity,
  getShipyardCandidates,
  recomputeShipyards,
  SHIPBUILDING_CHANGED_EVENT,
  SHIPBUILDING_EXTENSION_ID,
  shipbuildingSimulation
} from "./simulation";
import { ShipyardsOverviewDialog } from "./ui/dialogs/ShipyardsOverviewDialog";
import { VesselAssetsOverviewDialog } from "./ui/dialogs/VesselAssetsOverviewDialog";

export { SHIPBUILDING_EXTENSION_ID };

export const shipbuildingLayers: LayerConfig[] = [
  {
    id: "toggleShipyards",
    name: "Shipyards",
    shortcut: null,
    tooltip: "Shipyard candidates: port towns with enough nearby forest to plausibly build ships",
    svgLayers: [{ id: "shipyards", insertBefore: "icons", display: "none" }]
  }
];

let _unsubscribe: (() => void) | null = null;
let _unregisterSimulation: (() => void) | null = null;

let _changedHandler: ((event: Event) => void) | null = null;

export function init(api: ExtensionAPI): void {
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
  _unregisterSimulation = api.registerSimulationExtension(shipbuildingSimulation);
  bindShipbuildingView(api);
  _changedHandler = event => {
    const redraw = (event as CustomEvent<{ redrawShipyards?: boolean } | undefined>).detail?.redrawShipyards;
    if (redraw && api.layerIsOn("toggleShipyards")) drawShipyards(getShipyardCandidates());
    refreshShipyardsOverviewIfOpen(getShipyardCandidates(), getPortCapacity());
    refreshVesselAssetsOverviewIfOpen();
  };
  document.addEventListener(SHIPBUILDING_CHANGED_EVENT, _changedHandler);

  api.registerAction({
    id: "shipbuilding-regenerate-shipyards",
    extensionId: SHIPBUILDING_EXTENSION_ID,
    tab: "tools",
    section: "regenerate",
    label: "Shipyards",
    tooltip: "Click to recompute shipyard candidate towns",
    onClick: () => {
      recomputeShipyards();
      if (api.layerIsOn("toggleShipyards")) drawShipyards(getShipyardCandidates());
    }
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
        openShipyardsOverview(getShipyardCandidates(), getPortCapacity(), (x, y) => api.zoomTo(x, y, 8));
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
      drawShipyards(getShipyardCandidates());
    } else {
      clearShipyards();
      api.turnLayerOff("toggleShipyards");
    }
  });

  api.registerDrawLayerHook(() => {
    if (api.layerIsOn("toggleShipyards")) drawShipyards(getShipyardCandidates());
  });

  api.registerLayerElement("toggleShipyards", () => document.getElementById("shipyards"));

  _unsubscribe = api.subscribeExtensionState((state, prevState) => {
    const isEnabled = state.enabledExtensions[SHIPBUILDING_EXTENSION_ID];
    const wasEnabled = prevState.enabledExtensions[SHIPBUILDING_EXTENSION_ID];

    if (isEnabled && !wasEnabled) {
      api.addLayers(shipbuildingLayers);
    } else if (!isEnabled && wasEnabled) {
      if (api.layerIsOn("toggleShipyards")) api.toggleLayerById("toggleShipyards");
      api.removeLayers(shipbuildingLayers.map(l => l.id));
      closeShipyardsOverview();
      closeVesselAssetsOverview();
    }
  });

  if (api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) api.addLayers(shipbuildingLayers);
}

export function cleanup(api: ExtensionAPI): void {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  api.removeLayers(shipbuildingLayers.map(l => l.id));
  closeShipyardsOverview();
  closeVesselAssetsOverview();
  if (_changedHandler) document.removeEventListener(SHIPBUILDING_CHANGED_EVENT, _changedHandler);
  _changedHandler = null;
  _unregisterSimulation?.();
  _unregisterSimulation = null;
  bindShipbuildingView(null);
  api.unregisterExtension(SHIPBUILDING_EXTENSION_ID);
}
