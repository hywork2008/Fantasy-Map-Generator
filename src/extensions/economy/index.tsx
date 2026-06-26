import "./types"; // activate module augmentation for PackedGraph
import type { LayerConfig } from "../../store/layerState";
import type { ExtensionAPI } from "../../types/extension-api";
import { clearEconomyContext, getApi, getViewContext, getWorldContext, initEconomyContext } from "./economyContext";
import { Goods } from "./generators/goods-generator";
import { Markets } from "./generators/markets-generator";
import { Production } from "./generators/production-generator";
import { TradeAnimation } from "./generators/trade-animation";
import { drawGoods } from "./renderers/draw-goods";
import { drawMarketsLayer } from "./renderers/draw-markets";
import { clear as clearTradeAnimation, draw as drawTradeAnimation } from "./renderers/draw-trade-animation";
import { showEconomyTooltip, updateEconomyCellInfo } from "./tooltipHandler";
import { GoodsEditorDialog } from "./ui/dialogs/GoodsEditorDialog";
import { MarketDealsDialog } from "./ui/dialogs/MarketDealsDialog";
import { MarketOverviewDialog } from "./ui/dialogs/MarketOverviewDialog";
import { MarketsGoodCompareDialog } from "./ui/dialogs/MarketsGoodCompareDialog";
import { MarketsOverviewDialog } from "./ui/dialogs/MarketsOverviewDialog";
import { ProductionChainsDialog } from "./ui/dialogs/ProductionChainsDialog";
import { TradeAnimationDialog } from "./ui/dialogs/TradeAnimationDialog";
import { TradeDetailsDialog } from "./ui/dialogs/TradeDetailsDialog";

/** Default goods set shown when the goods layer is first toggled on. */
function getDefaultGoodsSet(): Set<number> {
  const goods = getWorldContext().pack.goods ?? [];
  const wood = goods.find(g => g.name === "Wood");
  return wood ? new Set([wood.i]) : new Set(goods.map(g => g.i));
}

function withRegenerateConfirmation(featureName: string, _id: string, onConfirm: () => void) {
  const dontAsk = sessionStorage.getItem("regenerateFeatureDontAsk");
  if (dontAsk) return onConfirm();

  getApi().openRichDialog({
    title: `Regenerate ${featureName}`,
    content: `Regenerate will remove all the custom changes for the ${featureName}.<br /><br />Are you sure you want to proceed?`,
    buttons: [
      {
        label: "Proceed",
        onClick: () => {
          const dontAskBox = document.getElementById("dontAsk") as HTMLInputElement;
          if (dontAskBox?.checked) sessionStorage.setItem("regenerateFeatureDontAsk", "true");
          onConfirm();
        }
      },
      { label: "Cancel", onClick: () => {} }
    ],
    onOpen: container => {
      const checkbox =
        '<div style="margin-top: 1em;"><span><input id="dontAsk" class="checkbox" type="checkbox"><label for="dontAsk" class="checkbox-label dontAsk"><i>do not ask again</i></label><span></div>';
      container.insertAdjacentHTML("beforeend", checkbox);
    }
  });
}

export const ECONOMY_EXTENSION_ID = "economy";

export const economyLayers: LayerConfig[] = [
  {
    id: "toggleGoods",
    name: "Goods",
    shortcut: null,
    tooltip: "Goods and Production: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleMarketsLayer",
    name: "Markets",
    shortcut: null,
    tooltip: "Markets: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  },
  {
    id: "toggleTrade",
    name: "Trade",
    shortcut: "`",
    tooltip:
      "Trade: animated trade deal flows. Click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style"
  }
];

let _unsubscribe: (() => void) | null = null;
let _generatePostCoreHandler: (() => void) | null = null;

export function init(api: ExtensionAPI): void {
  initEconomyContext(api);

  // Register the extension (default enabled: false)
  api.registerExtension(
    {
      id: ECONOMY_EXTENSION_ID,
      name: "Economy, Goods & Trade",
      description: "Adds economy system including goods production, markets, and trade routes."
    },
    false
  );

  // Register Economy Dialogs
  api.registerDialog({ id: "GoodsEditorDialog", extensionId: ECONOMY_EXTENSION_ID, component: GoodsEditorDialog });
  api.registerDialog({
    id: "MarketsOverviewDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: MarketsOverviewDialog
  });
  api.registerDialog({
    id: "MarketOverviewDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: MarketOverviewDialog
  });
  api.registerDialog({ id: "MarketDealsDialog", extensionId: ECONOMY_EXTENSION_ID, component: MarketDealsDialog });
  api.registerDialog({
    id: "MarketsGoodCompareDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: MarketsGoodCompareDialog
  });
  api.registerDialog({ id: "TradeDetailsDialog", extensionId: ECONOMY_EXTENSION_ID, component: TradeDetailsDialog });
  api.registerDialog({
    id: "ProductionChainsDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: ProductionChainsDialog
  });
  api.registerDialog({
    id: "TradeAnimationDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: TradeAnimationDialog
  });

  // Register Economy Actions for ToolsTab Regenerate section
  api.registerAction({
    id: "economy-regenerate-economy",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "regenerate",
    label: "Economy",
    tooltip: "Rebuild market territories, production, trade deals, and taxes from the current goods and markets",
    onClick: () => {
      withRegenerateConfirmation("Economy", "regenerateEconomy", () => {
        Goods.generate();
        Markets.generate(true);
        Production.produce();
      });
    }
  });

  api.registerAction({
    id: "economy-regenerate-goods",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "regenerate",
    label: "Goods",
    tooltip: "Click to regenerate bonus goods placement",
    onClick: () => {
      withRegenerateConfirmation("Goods", "regenerateGoods", () => Goods.generate());
    }
  });

  api.registerAction({
    id: "economy-regenerate-markets",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "regenerate",
    label: "Markets",
    tooltip: "Click to regenerate markets and their territories",
    onClick: () => {
      withRegenerateConfirmation("Markets", "regenerateMarkets", () => Markets.generate(true));
    }
  });

  api.registerAction({
    id: "economy-regenerate-production",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "regenerate",
    label: "Production",
    tooltip: "Click to regenerate production and trade deals",
    onClick: () => {
      withRegenerateConfirmation("Production", "regenerateProduction", () => Production.produce());
    }
  });

  api.registerAction({
    id: "economy-edit-goods",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    label: "Goods",
    tooltip: "Click to open Goods Editor (Shortcut: Shift + G)",
    onClick: () => {
      document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "editGoods" } }));
    }
  });

  api.registerAction({
    id: "economy-edit-markets",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    label: "Markets",
    tooltip: "Click to open Markets Overview",
    onClick: () => {
      document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "overviewMarketsButton" } }));
    }
  });

  api.registerAction({
    id: "economy-edit-trade",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    label: "Trade",
    tooltip: "Click to open Trade Animation Editor",
    onClick: () => {
      document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "editTradeAnimationButton" } }));
    }
  });

  // Subscribe to extension state changes to dynamically add/remove layers
  _unsubscribe = api.subscribeExtensionState((state, prevState) => {
    const isEnabled = state.enabledExtensions[ECONOMY_EXTENSION_ID];
    const wasEnabled = prevState.enabledExtensions[ECONOMY_EXTENSION_ID];
    const worldContext = getWorldContext(); // live reference, same object as host

    if (isEnabled && !wasEnabled) {
      api.addLayers(economyLayers);
      api.tooltipExtensions.showMapTooltip = showEconomyTooltip;
      api.tooltipExtensions.updateCellInfo = updateEconomyCellInfo;
      // Generate economy if it's completely missing
      if (!worldContext.pack.goods || worldContext.pack.goods.length === 0) {
        if (
          worldContext.pack.cells?.i &&
          (!worldContext.pack.cells.good || worldContext.pack.cells.good.length !== worldContext.pack.cells.i.length)
        ) {
          worldContext.pack.cells.good = new Uint16Array(worldContext.pack.cells.i.length);
          worldContext.pack.cells.market = new Uint16Array(worldContext.pack.cells.i.length);
        }
        Goods.generate();
        Markets.generate();
        Production.produce();
      }
    } else if (!isEnabled && wasEnabled) {
      // Visually turn off layers before removing them
      economyLayers.forEach(l => {
        if (api.layerIsOn(l.id)) {
          api.toggleLayerById(l.id);
        }
      });
      api.removeLayers(economyLayers.map(l => l.id));

      // Close all economy-related dialogs
      api.closeDialog("goodsEditor");
      api.closeDialog("marketsOverview");
      api.closeDialog("marketOverview");
      api.closeDialog("marketDeals");
      api.closeDialog("marketsGoodCompare");
      api.closeDialog("tradeDetails");
      api.closeDialog("productionChains");
      api.closeDialog("tradeAnimationEditor");

      // Clear economy data from worldContext when disabled
      worldContext.pack.goods = [];
      worldContext.pack.markets = [];
      worldContext.pack.deals = [];
      api.tooltipExtensions.showMapTooltip = undefined;
      api.tooltipExtensions.updateCellInfo = undefined;
      if (worldContext.pack.cells?.i) {
        worldContext.pack.cells.good = new Uint16Array(worldContext.pack.cells.i.length);
        worldContext.pack.cells.market = new Uint16Array(worldContext.pack.cells.i.length);
      }
    }
  });

  // If already enabled at load time (e.g. persisted preference), add layers immediately
  if (api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
    api.addLayers(economyLayers);
    api.tooltipExtensions.showMapTooltip = showEconomyTooltip;
    api.tooltipExtensions.updateCellInfo = updateEconomyCellInfo;
  }

  // Listen for core map generation to generate economy
  _generatePostCoreHandler = () => {
    if (api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
      Goods.generate();
      Markets.generate();
      Production.produce();
    }
  };
  document.addEventListener("fmg:generate-post-core", _generatePostCoreHandler);

  // Bind trade animation renderer (must happen before any toggle)
  TradeAnimation.bind({
    draw: drawTradeAnimation,
    clear: clearTradeAnimation,
    isLayerOn: () => api.layerIsOn("toggleTrade")
  });

  // Register layer toggle handlers
  api.registerLayerToggle("toggleGoods", (_event?: MouseEvent) => {
    if (!api.layerIsOn("toggleGoods")) {
      api.turnLayerOn("toggleGoods");
      drawGoods(getDefaultGoodsSet());
    } else {
      getViewContext().goods.selectAll("#goodsCells,#goodsIcons,#goodsBurgs").html("");
      api.turnLayerOff("toggleGoods");
    }
  });

  api.registerLayerToggle("toggleMarketsLayer", (_event?: MouseEvent) => {
    if (!api.layerIsOn("toggleMarketsLayer")) {
      api.turnLayerOn("toggleMarketsLayer");
      drawMarketsLayer();
    } else {
      getViewContext().marketsFill.html("").style("display", "none");
      getViewContext().markets.html("").style("display", "none");
      api.turnLayerOff("toggleMarketsLayer");
    }
  });

  api.registerLayerToggle("toggleTrade", (_event?: MouseEvent) => {
    if (!api.layerIsOn("toggleTrade")) {
      api.turnLayerOn("toggleTrade");
      TradeAnimation.start();
    } else {
      TradeAnimation.stop();
      api.turnLayerOff("toggleTrade");
    }
  });

  // Redraw economy layers whenever the host calls drawLayers()
  api.registerDrawLayerHook(() => {
    if (api.layerIsOn("toggleGoods")) drawGoods(getDefaultGoodsSet());
    if (api.layerIsOn("toggleMarketsLayer")) drawMarketsLayer();
    if (api.layerIsOn("toggleTrade")) TradeAnimation.start();
  });
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

  // Remove layers and clear tooltip hooks
  api.removeLayers(economyLayers.map(l => l.id));
  api.tooltipExtensions.showMapTooltip = undefined;
  api.tooltipExtensions.updateCellInfo = undefined;

  api.unregisterExtension(ECONOMY_EXTENSION_ID);
  clearEconomyContext();
}
