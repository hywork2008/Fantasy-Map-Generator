import type { LayerConfig } from "../../store/layerState";
import type { ExtensionAPI } from "../hostTypes";
import { runLoggingTick } from "./generators/logging";
import { computeShipyardCandidates, type ShipyardCandidate } from "./generators/shipyardCandidates";
import { clearShipyardQueues, runShipyardTick } from "./generators/shipyardQueue";
import { clearShipyards, drawShipyards } from "./renderers/drawShipyards";
import { clearShipbuildingContext, getWorldContext, initShipbuildingContext } from "./shipbuildingContext";

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
let _unsubscribe: (() => void) | null = null;
let _generatePostCoreHandler: (() => void) | null = null;

function recomputeAndMaybeDraw(api: ExtensionAPI): void {
  _candidates = computeShipyardCandidates();
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

  api.registerTimeTickHook(deltaYears => {
    if (!api.isExtensionEnabled(SHIPBUILDING_EXTENSION_ID)) return;
    runLoggingTick(_candidates, deltaYears);
    const { burgs, states } = getWorldContext().pack;
    runShipyardTick(_candidates, burgs, states, deltaYears, api.getEffectiveSkill);
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
      clearShipyardQueues();
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
  clearShipyardQueues();

  api.unregisterExtension(SHIPBUILDING_EXTENSION_ID);
  clearShipbuildingContext();
}
