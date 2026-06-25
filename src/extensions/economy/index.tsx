import { worldContext } from "../../context/worldContext";
import { toggleLayerById } from "../../controllers/layers";
import { useExtensionState } from "../../store/extensionState";
import { type LayerConfig, useLayerState } from "../../store/layerState";
import { closeDialog, openRichDialog } from "../../ui/dialogs/dialogService";
import { tooltipExtensions } from "../../utils/uiHelpers";
import { Goods } from "./modules/goods-generator";
import { Markets } from "./modules/markets-generator";
import { Production } from "./modules/production-generator";
import { showEconomyTooltip, updateEconomyCellInfo } from "./tooltipHandler";
import { GoodsEditorDialog } from "./ui/dialogs/GoodsEditorDialog";
import { MarketDealsDialog } from "./ui/dialogs/MarketDealsDialog";
import { MarketOverviewDialog } from "./ui/dialogs/MarketOverviewDialog";
import { MarketsGoodCompareDialog } from "./ui/dialogs/MarketsGoodCompareDialog";
import { MarketsOverviewDialog } from "./ui/dialogs/MarketsOverviewDialog";
import { ProductionChainsDialog } from "./ui/dialogs/ProductionChainsDialog";
import { TradeAnimationDialog } from "./ui/dialogs/TradeAnimationDialog";
import { TradeDetailsDialog } from "./ui/dialogs/TradeDetailsDialog";

function withRegenerateConfirmation(featureName: string, _id: string, onConfirm: () => void) {
  const dontAsk = sessionStorage.getItem("regenerateFeatureDontAsk");
  if (dontAsk) return onConfirm();

  openRichDialog({
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

export function initEconomyExtension() {
  const { registerExtension, registerAction, registerDialog } = useExtensionState.getState();

  // Register the extension (default enabled: false)
  registerExtension(
    {
      id: ECONOMY_EXTENSION_ID,
      name: "Economy, Goods & Trade",
      description: "Adds economy system including goods production, markets, and trade routes."
    },
    false
  );

  // Register Economy Dialogs
  registerDialog({ id: "GoodsEditorDialog", extensionId: ECONOMY_EXTENSION_ID, component: GoodsEditorDialog });
  registerDialog({ id: "MarketsOverviewDialog", extensionId: ECONOMY_EXTENSION_ID, component: MarketsOverviewDialog });
  registerDialog({ id: "MarketOverviewDialog", extensionId: ECONOMY_EXTENSION_ID, component: MarketOverviewDialog });
  registerDialog({ id: "MarketDealsDialog", extensionId: ECONOMY_EXTENSION_ID, component: MarketDealsDialog });
  registerDialog({
    id: "MarketsGoodCompareDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: MarketsGoodCompareDialog
  });
  registerDialog({ id: "TradeDetailsDialog", extensionId: ECONOMY_EXTENSION_ID, component: TradeDetailsDialog });
  registerDialog({
    id: "ProductionChainsDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: ProductionChainsDialog
  });
  registerDialog({ id: "TradeAnimationDialog", extensionId: ECONOMY_EXTENSION_ID, component: TradeAnimationDialog });

  // Register Economy Actions for ToolsTab Regenerate section
  registerAction({
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

  registerAction({
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

  registerAction({
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

  registerAction({
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

  registerAction({
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

  registerAction({
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

  registerAction({
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
  useExtensionState.subscribe((state, prevState) => {
    const isEnabled = state.enabledExtensions[ECONOMY_EXTENSION_ID];
    const wasEnabled = prevState.enabledExtensions[ECONOMY_EXTENSION_ID];
    const { addLayers, removeLayers } = useLayerState.getState();

    if (isEnabled && !wasEnabled) {
      addLayers(economyLayers);
      tooltipExtensions.showMapTooltip = showEconomyTooltip;
      tooltipExtensions.updateCellInfo = updateEconomyCellInfo;
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
        if (useLayerState.getState().activeLayers[l.id]) {
          toggleLayerById(l.id);
        }
      });
      removeLayers(economyLayers.map(l => l.id));

      // Close all economy-related dialogs
      closeDialog("goodsEditor");
      closeDialog("marketsOverview");
      closeDialog("marketOverview");
      closeDialog("marketDeals");
      closeDialog("marketsGoodCompare");
      closeDialog("tradeDetails");
      closeDialog("productionChains");
      closeDialog("tradeAnimationEditor");

      // Clear the associated data from the worldContext when disabled
      worldContext.pack.goods = [];
      worldContext.pack.markets = [];
      worldContext.pack.deals = [];
      tooltipExtensions.showMapTooltip = undefined;
      tooltipExtensions.updateCellInfo = undefined;
      if (worldContext.pack.cells?.i) {
        worldContext.pack.cells.good = new Uint16Array(worldContext.pack.cells.i.length);
        worldContext.pack.cells.market = new Uint16Array(worldContext.pack.cells.i.length);
      }
    }
  });

  // Initial trigger
  const initialState = useExtensionState.getState();
  if (initialState.enabledExtensions[ECONOMY_EXTENSION_ID]) {
    useLayerState.getState().addLayers(economyLayers);
    tooltipExtensions.showMapTooltip = showEconomyTooltip;
    tooltipExtensions.updateCellInfo = updateEconomyCellInfo;
  }

  // Listen for core map generation to generate economy
  document.addEventListener("fmg:generate-post-core", () => {
    if (useExtensionState.getState().enabledExtensions[ECONOMY_EXTENSION_ID]) {
      Goods.generate();
      Markets.generate();
      Production.produce();
    }
  });
}
