import "./types"; // activate module augmentation for PackedGraph
import type { LayerConfig } from "../../store/layerState";
import { regenerateFeatureDialogStore } from "../../store/regenerateFeatureDialogState";
import { useUiPreferencesState } from "../../store/uiPreferencesState";
import type { ExtensionAPI } from "../../types/extension-api";
import type { Point } from "../hostCore";
import {
  isShipbuildingMaterialRequest,
  isShipbuildingProcurementStatusRequest,
  isShipbuildingStrategicProcurementDemand
} from "../hostTypes";
import { formatPrice } from "../hostUtils";
import { getBurgEconomySummary, getBurgProductPerThousandResidents } from "./burgEconomySummary";
import { economyStyleConfig } from "./EconomyStyleConfig";
import { clearEconomyContext, getWorldContext, initEconomyContext } from "./economyContext";
import { clearBurgMarketLedgers, syncBurgMarketLedgers } from "./generators/burgMarketLedgers";
import { Caravans } from "./generators/caravans";
import { FoodProduction } from "./generators/foodProduction";
import {
  clearForestDepletion,
  consumeDirtyFlag,
  registerLogHarvest,
  tickForestRegrowth
} from "./generators/forestDepletion";
import { Goods, isGoodEnabled } from "./generators/goods-generator";
import { clearMarketManagers, syncMarketManagers } from "./generators/marketManagers";
import { Markets } from "./generators/markets-generator";
import { clearMerchantOrganizations } from "./generators/merchantOrganizations";
import { Production } from "./generators/production-generator";
import { StrategicProcurement } from "./generators/strategicProcurement";
import {
  clearStrategicProcurementExpenses,
  clearVoyageIncome,
  registerVoyageIncome,
  Taxes
} from "./generators/taxes-generator";
import { TradeAnimation } from "./generators/trade-animation";
import { drawGoods } from "./renderers/draw-goods";
import { drawMarketsLayer } from "./renderers/draw-markets";
import {
  clear as clearTradeAnimation,
  draw as drawTradeAnimation,
  getCaravanPosition,
  getCaravansAtPoint
} from "./renderers/draw-trade-animation";
import { economyMapPickHandler } from "./renderers/economyMapPickHandler";
import { createEconomyWebglLayerSpec } from "./renderers/economyWebglLayers";
import { getDisplayedGoodIds } from "./store/goodsDisplaySelection";
import { showEconomyTooltip, updateEconomyCellInfo } from "./tooltipHandler";
import { StatesEditorTreasuryTab } from "./ui/components/StatesEditorTreasuryTab";
import { GoodsDistributionEditorDialog } from "./ui/dialogs/GoodsDistributionEditorDialog";
import { GoodsEditorDialog } from "./ui/dialogs/GoodsEditorDialog";
import { GoodsProducersDialog } from "./ui/dialogs/GoodsProducersDialog";
import { GoodsStockDialog } from "./ui/dialogs/GoodsStockDialog";
import { GoodsTagsFilterDialog } from "./ui/dialogs/GoodsTagsFilterDialog";
import { MarketDealsDialog } from "./ui/dialogs/MarketDealsDialog";
import { MarketOverviewDialog } from "./ui/dialogs/MarketOverviewDialog";
import { MarketsGoodCompareDialog } from "./ui/dialogs/MarketsGoodCompareDialog";
import { MarketsOverviewDialog } from "./ui/dialogs/MarketsOverviewDialog";
import { MarketTradeOpportunitiesDialog } from "./ui/dialogs/MarketTradeOpportunitiesDialog";
import { ProductionChainsDialog } from "./ui/dialogs/ProductionChainsDialog";
import { ProductionOverviewDialog } from "./ui/dialogs/ProductionOverviewDialog";
import { TradeAnimationDialog } from "./ui/dialogs/TradeAnimationDialog";
import { TradeDetailsDialog } from "./ui/dialogs/TradeDetailsDialog";

function withRegenerateConfirmation(featureName: string, _id: string, onConfirm: () => void) {
  if (useUiPreferencesState.getState().dontAskRegenerateFeature) return onConfirm();

  regenerateFeatureDialogStore.getState().open({ featureName, onConfirm });
}

export const ECONOMY_EXTENSION_ID = "economy";
const economyWebglLayerSpec = createEconomyWebglLayerSpec();

const ECONOMY_PRESETS: Record<string, { label: string; layers: string[] }> = {
  goods: {
    label: "Goods map",
    layers: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleCells",
      "toggleGoods",
      "toggleMarketsLayer",
      "toggleLakes",
      "toggleRivers",
      "toggleRoutes",
      "toggleScaleBar",
      "toggleTrade",
      "toggleVignette"
    ]
  },
  trade: {
    label: "Trade animation",
    layers: [
      "toggleBorders",
      "toggleBurgIcons",
      "toggleLakes",
      "toggleRivers",
      "toggleRoutes",
      "toggleScaleBar",
      "toggleStates",
      "toggleTrade",
      "toggleVignette"
    ]
  }
};

export const economyLayers: LayerConfig[] = [
  {
    id: "toggleGoods",
    name: "Goods",
    shortcut: null,
    tooltip:
      "Goods and Production: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style",
    svgLayers: [{ id: "goods", insertBefore: "icons", display: "none" }]
  },
  {
    id: "toggleMarketsLayer",
    name: "Markets",
    shortcut: null,
    tooltip: "Markets: click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style",
    svgLayers: [
      // Fill polygons rendered below Icons so burg icons remain visible on top.
      { id: "marketsLayerFill", insertBefore: "icons", display: "none" },
      // Border paths, center circles and labels — also below Icons layer.
      { id: "marketsLayer", insertBefore: "icons", display: "none" }
    ]
  },
  {
    id: "toggleTrade",
    name: "Trade",
    shortcut: "`",
    tooltip:
      "Trade: animated trade deal flows. Click to toggle, drag to raise or lower the layer. Ctrl + click to edit layer style",
    svgLayers: [{ id: "tradeAnimation", insertAfter: "marketsLayer" }]
  }
];

/**
 * Registers/unregisters the Product/Wealth/Treasury (Burgs Overview) and Treasury (States Editor)
 * overview columns, plus the Good/Market/Cell Production/Burg Production Cell Info rows. Called
 * from the enable/disable branches of subscribeExtensionState (and once at init() if already
 * enabled) so these appear/disappear live with the extension toggle, instead of always showing —
 * unlike registerDialog/registerAction/registerEditorTab, which are one-shot and only fully
 * cleaned up on unregisterExtension().
 */
function registerOverviewColumns(api: ExtensionAPI): void {
  api.registerBurgOverviewColumn({
    id: "product",
    extensionId: ECONOMY_EXTENSION_ID,
    label: "Product",
    tip: "Gross Product: local sale revenue minus purchased ingredient costs during the production",
    getValue: burg => burg.product || 0,
    format: formatPrice
  });
  api.registerBurgOverviewColumn({
    id: "wealth",
    extensionId: ECONOMY_EXTENSION_ID,
    label: "Product / 1k",
    tip: "Gross product per 1,000 actual residents during the production cycle",
    getValue: getBurgProductPerThousandResidents,
    format: formatPrice
  });
  api.registerBurgOverviewColumn({
    id: "treasury",
    extensionId: ECONOMY_EXTENSION_ID,
    label: "Treasury",
    tip: "Treasury: accumulated cash balance",
    getValue: burg => burg.treasury || 0,
    format: formatPrice
  });
  api.registerStateOverviewColumn({
    id: "treasury",
    extensionId: ECONOMY_EXTENSION_ID,
    label: "Treasury",
    tip: "Current treasury. Click to view and edit sales/poll tax rates",
    getValue: state => state.treasury || 0,
    format: formatPrice,
    onClick: () =>
      document.dispatchEvent(
        new CustomEvent("fmg:activate-editor-tab", { detail: { editorId: "statesEditor", tabId: "states-treasury" } })
      )
  });

  api.registerCellInfoRow({ id: "good", extensionId: ECONOMY_EXTENSION_ID, label: "Good" });
  api.registerCellInfoRow({ id: "market", extensionId: ECONOMY_EXTENSION_ID, label: "Market" });
  api.registerCellInfoRow({ id: "marketHolder", extensionId: ECONOMY_EXTENSION_ID, label: "Market Holder" });
  api.registerCellInfoRow({ id: "cellProduction", extensionId: ECONOMY_EXTENSION_ID, label: "Cell Production" });
  api.registerCellInfoRow({ id: "burgProduction", extensionId: ECONOMY_EXTENSION_ID, label: "Burg Production" });
}

function unregisterOverviewColumns(api: ExtensionAPI): void {
  api.unregisterBurgOverviewColumn("product");
  api.unregisterBurgOverviewColumn("wealth");
  api.unregisterBurgOverviewColumn("treasury");
  api.unregisterStateOverviewColumn("treasury");
  api.unregisterCellInfoRow("good");
  api.unregisterCellInfoRow("market");
  api.unregisterCellInfoRow("marketHolder");
  api.unregisterCellInfoRow("cellProduction");
  api.unregisterCellInfoRow("burgProduction");
}

let _unsubscribe: (() => void) | null = null;
let _generatePostCoreHandler: (() => void) | null = null;
let _logHarvestedHandler: ((e: Event) => void) | null = null;
let _materialsRequestedHandler: ((e: Event) => void) | null = null;
let _strategicProcurementDemandHandler: ((e: Event) => void) | null = null;
let _strategicProcurementStatusHandler: ((e: Event) => void) | null = null;
let _voyageIncomeHandler: ((e: Event) => void) | null = null;
let _mapPickCandidatesHandler: ((e: Event) => void) | null = null;
let _gunpowderEraChangedHandler: (() => void) | null = null;

function refreshEconomyForGunpowderEra(api: ExtensionAPI): void {
  const worldContext = getWorldContext();
  Goods.generate();
  Markets.generate(true);
  Production.produce();
  if (worldContext.pack.caravans) {
    worldContext.pack.caravans = worldContext.pack.caravans
      .map(caravan => {
        const payload = caravan.payload.filter(item => {
          const good = Goods.get(item.goodId);
          return good !== undefined && isGoodEnabled(good);
        });
        if (payload.length === caravan.payload.length) return caravan;
        if (!payload.length) return null;
        return {
          ...caravan,
          payload,
          units: payload.reduce((sum, item) => sum + item.units, 0),
          value: payload.reduce((sum, item) => sum + item.value, 0)
        };
      })
      .filter((caravan): caravan is Exclude<typeof caravan, null> => caravan !== null);
  }
  if (api.layerIsOn("toggleGoods")) drawGoods(getDisplayedGoodIds());
  api.requestWebglRender();
}

export function init(api: ExtensionAPI): void {
  initEconomyContext(api);

  // Register the extension (default enabled: false)
  api.registerExtension(
    {
      id: ECONOMY_EXTENSION_ID,
      name: "Economy, Goods & Trade",
      description: "Adds economy system including goods production, markets, and trade routes.",
      dependencies: [{ id: "characters", required: true }]
    },
    false
  );

  api.registerEditorTab({
    id: "states-treasury",
    extensionId: ECONOMY_EXTENSION_ID,
    editorId: "statesEditor",
    label: "Treasury",
    component: StatesEditorTreasuryTab
  });

  // Register Economy Dialogs
  api.registerDialog({ id: "GoodsEditorDialog", extensionId: ECONOMY_EXTENSION_ID, component: GoodsEditorDialog });
  api.registerDialog({
    id: "GoodsDistributionEditorDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: GoodsDistributionEditorDialog
  });
  api.registerDialog({
    id: "GoodsProducersDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: GoodsProducersDialog
  });
  api.registerDialog({ id: "GoodsStockDialog", extensionId: ECONOMY_EXTENSION_ID, component: GoodsStockDialog });
  api.registerDialog({
    id: "GoodsTagsFilterDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: GoodsTagsFilterDialog
  });
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
    id: "MarketTradeOpportunitiesDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: MarketTradeOpportunitiesDialog
  });
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
    id: "ProductionOverviewDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: ProductionOverviewDialog
  });
  api.registerDialog({
    id: "TradeAnimationDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: TradeAnimationDialog
  });

  // Register Economy Style Config
  api.registerStyleConfig(economyStyleConfig);

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
        Taxes.defineTaxRates();
        FoodProduction.generateQuarterlyLedger(0);
        Production.produce();
        Taxes.collectTaxes();
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
      withRegenerateConfirmation("Production", "regenerateProduction", () => {
        FoodProduction.generateQuarterlyLedger(0);
        Production.produce();
        Taxes.collectTaxes();
      });
    }
  });

  api.registerAction({
    id: "economy-edit-goods",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    label: "Goods",
    dialogId: "goodsEditor",
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
    dialogId: "marketsOverview",
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
    dialogId: "tradeAnimationEditor",
    tooltip: "Click to open Trade Animation Editor",
    onClick: () => {
      document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "editTradeAnimationButton" } }));
    }
  });

  // Register tool action handlers so core tools.ts has no knowledge of extension dialogs.
  // The handler implements the same open/close + layer toggle pattern used for built-in editors.
  const toggleEditorDialog = (dialogId: string, layerId: string | null) => {
    if (api.isDialogOpen(dialogId)) {
      api.closeDialog(dialogId);
      if (layerId && api.layerIsOn(layerId)) api.toggleLayerById(layerId);
    } else {
      api.openDialog(dialogId);
    }
  };

  api.registerToolAction("editGoods", () => toggleEditorDialog("goodsEditor", "toggleGoods"));
  api.registerToolAction("overviewMarketsButton", () => toggleEditorDialog("marketsOverview", "toggleMarketsLayer"));
  api.registerToolAction("editTradeAnimationButton", () => toggleEditorDialog("tradeAnimationEditor", "toggleTrade"));
  api.registerToolAction("burgProductionOverview", detail => {
    const burgId = (detail as { burgId?: number } | undefined)?.burgId;
    if (!burgId) return;
    if (api.isDialogOpen("productionOverview")) api.closeDialog("productionOverview");
    else api.openDialog("productionOverview", { burgId });
  });

  // Subscribe to extension state changes to dynamically add/remove layers
  _unsubscribe = api.subscribeExtensionState((state, prevState) => {
    const isEnabled = state.enabledExtensions[ECONOMY_EXTENSION_ID];
    const wasEnabled = prevState.enabledExtensions[ECONOMY_EXTENSION_ID];
    const worldContext = getWorldContext(); // live reference, same object as host

    if (isEnabled && !wasEnabled) {
      api.addLayers(economyLayers);
      api.registerWebglLayers(ECONOMY_EXTENSION_ID, economyWebglLayerSpec);
      api.registerMapPickHandler(ECONOMY_EXTENSION_ID, economyMapPickHandler);
      attachSvgClickHandlers();
      for (const [id, { label, layers }] of Object.entries(ECONOMY_PRESETS)) {
        api.registerPreset(id, label, layers);
      }
      api.tooltipExtensions.showMapTooltip = showEconomyTooltip;
      api.tooltipExtensions.updateCellInfo = updateEconomyCellInfo;
      api.burgEconomyExtensions.getBurgEconomySummary = getBurgEconomySummary;
      registerOverviewColumns(api);
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
        Taxes.defineTaxRates();
        FoodProduction.generateQuarterlyLedger(0);
        Production.produce();
        Taxes.collectTaxes();
      } else if (worldContext.pack.markets?.length) {
        syncMarketManagers();
        syncBurgMarketLedgers();
      }
    } else if (!isEnabled && wasEnabled) {
      // Visually turn off layers before removing them
      economyLayers.forEach(l => {
        if (api.layerIsOn(l.id)) {
          api.toggleLayerById(l.id);
        }
      });
      api.removeLayers(economyLayers.map(l => l.id));
      api.unregisterWebglLayers(ECONOMY_EXTENSION_ID);
      api.unregisterMapPickHandler(ECONOMY_EXTENSION_ID);
      for (const id of Object.keys(ECONOMY_PRESETS)) {
        api.unregisterPreset(id);
      }

      // Close all economy-related dialogs
      api.closeDialog("goodsEditor");
      api.closeDialog("goodsDistributionEditor");
      api.closeDialog("marketsOverview");
      api.closeDialog("marketOverview");
      api.closeDialog("marketDeals");
      api.closeDialog("marketTradeOpportunities");
      api.closeDialog("marketsGoodCompare");
      api.closeDialog("tradeDetails");
      api.closeDialog("productionChains");
      api.closeDialog("productionOverview");
      api.closeDialog("tradeAnimationEditor");

      // Clear economy data from worldContext when disabled
      clearBurgMarketLedgers();
      clearMarketManagers();
      worldContext.pack.goods = [];
      worldContext.pack.markets = [];
      worldContext.pack.deals = [];
      worldContext.pack.burgMarketLedgers = [];
      clearMerchantOrganizations();
      api.tooltipExtensions.showMapTooltip = undefined;
      api.tooltipExtensions.updateCellInfo = undefined;
      api.burgEconomyExtensions.getBurgEconomySummary = undefined;
      unregisterOverviewColumns(api);
      if (worldContext.pack.cells?.i) {
        worldContext.pack.cells.good = new Uint16Array(worldContext.pack.cells.i.length);
        worldContext.pack.cells.market = new Uint16Array(worldContext.pack.cells.i.length);
      }
      clearForestDepletion();
      clearStrategicProcurementExpenses();
      StrategicProcurement.clear();
    }
  });

  // If already enabled at load time (e.g. persisted preference), add layers immediately
  if (api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
    api.addLayers(economyLayers);
    api.registerWebglLayers(ECONOMY_EXTENSION_ID, economyWebglLayerSpec);
    api.registerMapPickHandler(ECONOMY_EXTENSION_ID, economyMapPickHandler);
    attachSvgClickHandlers();
    for (const [id, { label, layers }] of Object.entries(ECONOMY_PRESETS)) {
      api.registerPreset(id, label, layers);
    }
    api.tooltipExtensions.showMapTooltip = showEconomyTooltip;
    api.tooltipExtensions.updateCellInfo = updateEconomyCellInfo;
    api.burgEconomyExtensions.getBurgEconomySummary = getBurgEconomySummary;
    registerOverviewColumns(api);
    if (getWorldContext().pack.markets?.length) {
      syncMarketManagers();
      syncBurgMarketLedgers();
    }
  }

  // Listen for core map generation to generate economy
  _generatePostCoreHandler = () => {
    if (api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
      // A new map reuses state ids from 0 — any voyage income buffered against the
      // previous map's states must not carry over.
      clearVoyageIncome();
      clearStrategicProcurementExpenses();
      StrategicProcurement.clear();
      Goods.generate();
      Markets.generate();
      Taxes.defineTaxRates();
      FoodProduction.generateQuarterlyLedger(0);
      Production.produce();
      Taxes.collectTaxes();
    }
  };
  document.addEventListener("fmg:generate-post-core", _generatePostCoreHandler);

  _gunpowderEraChangedHandler = () => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    refreshEconomyForGunpowderEra(api);
  };
  document.addEventListener("fmg:gunpowder-era-changed", _gunpowderEraChangedHandler);

  // Listen for Shipbuilding's logging ticks (optional dependency — harmless no-op if
  // Shipbuilding is never enabled) and reduce local Wood output over time.
  //
  // Shipbuilding dispatches one event per candidate burg from inside its own
  // registerTimeTickHook callback, synchronously, during the same advanceTime() call.
  // Rather than also registering an Economy tick hook (whose relative order vs.
  // Shipbuilding's would depend on extension init order in extensions/index.ts —
  // a fragile thing to rely on), schedule the produce() refresh on a microtask. That
  // runs after the whole synchronous advanceTime() call (all tick hooks) completes,
  // regardless of hook registration order, and coalesces multiple log-harvested
  // events from the same tick into a single Production.produce() call.
  let refreshScheduled = false;
  let forceRefresh = false;

  const scheduleProductionRefresh = (force = false) => {
    if (force) forceRefresh = true;
    if (refreshScheduled) return;
    refreshScheduled = true;
    queueMicrotask(() => {
      refreshScheduled = false;
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;

      const forestDirty = consumeDirtyFlag();
      if (!forestDirty && !forceRefresh) return;
      forceRefresh = false;

      Production.produce();
      Taxes.collectTaxes();
      if (api.layerIsOn("toggleGoods")) drawGoods(getDisplayedGoodIds());
    });
  };

  _logHarvestedHandler = e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const { cellId, amount } = (e as CustomEvent).detail as { cellId: number; amount: number };
    registerLogHarvest(cellId, amount);
    scheduleProductionRefresh(true);
  };
  document.addEventListener("fmg:shipbuilding-log-harvested", _logHarvestedHandler);

  // Shipbuilding asks synchronously so it can only advance construction work that this
  // market can fund with every required material. No direct Shipbuilding import: the
  // mutable CustomEvent detail is the extension boundary.
  _materialsRequestedHandler = e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (e as CustomEvent<unknown>).detail;
    if (!isShipbuildingMaterialRequest(detail)) return;
    detail.result = Markets.tryConsumeShipbuildingMaterials(detail.marketId, detail.materials);
  };
  document.addEventListener("fmg:shipbuilding-materials-requested", _materialsRequestedHandler);

  // Shipbuilding only signals demand. Economy owns policy, payment, Deal, Caravan,
  // and delivery lifecycle after this extension boundary.
  _strategicProcurementDemandHandler = e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (e as CustomEvent<unknown>).detail;
    if (!isShipbuildingStrategicProcurementDemand(detail)) return;
    StrategicProcurement.handleShipbuildingDemand(detail);
  };
  document.addEventListener("fmg:shipbuilding-strategic-procurement-demand", _strategicProcurementDemandHandler);

  _strategicProcurementStatusHandler = e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (e as CustomEvent<unknown>).detail;
    if (!isShipbuildingProcurementStatusRequest(detail)) return;
    detail.result = StrategicProcurement.getShipbuildingProcurementStatus(detail.stateId, detail.destinationMarketId);
  };
  document.addEventListener(
    "fmg:shipbuilding-strategic-procurement-status-request",
    _strategicProcurementStatusHandler
  );

  // Listen for Shipbuilding's trade-voyage income (optional dependency — harmless no-op
  // if Shipbuilding is never enabled). Buffered in taxes-generator.ts and folded into
  // treasury on the next collectTaxes() call rather than written directly, since
  // collectTaxes() recomputes treasury from scratch every time it runs.
  _voyageIncomeHandler = e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const { stateId, amount } = (e as CustomEvent).detail as { stateId: number; amount: number };
    if (!stateId || !(amount > 0)) return;
    registerVoyageIncome(stateId, amount);
    scheduleProductionRefresh(true);
  };
  document.addEventListener("fmg:shipbuilding-voyage-income", _voyageIncomeHandler);

  _mapPickCandidatesHandler = e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    if (!api.layerIsOn("toggleTrade")) return;

    const detail = (e as CustomEvent<unknown>).detail as Record<string, unknown>;
    if (!detail || typeof detail !== "object") return;

    const mapPoint = detail.mapPoint as Point | undefined;
    const candidates = detail.candidates as Array<Record<string, unknown>> | undefined;
    const padding = typeof detail.padding === "number" ? detail.padding : 0;

    if (!mapPoint || !candidates) return;

    const caravans = getCaravansAtPoint(mapPoint, padding);
    for (const caravan of caravans) {
      const pos = getCaravanPosition(caravan);
      candidates.push({
        kind: "extension",
        extensionId: ECONOMY_EXTENSION_ID,
        layerId: "trade-animation",
        id: `economy-caravan-${caravan.i}`,
        cellId: -1,
        index: caravan.i,
        coordinate: [pos.x, pos.y]
      });
    }
  };
  document.addEventListener("fmg:webgl-map-pick-candidates", _mapPickCandidatesHandler, { capture: true });

  // Depleted cells recover a little on every advanceTime() call, independent of
  // whether Shipbuilding (or logging on that cell) is still active — a logged-out
  // shipyard's forest should eventually recover even if the extension is disabled
  // afterward. Harmless no-op while nothing has ever been depleted.
  let daysSinceLastProduction = 0;
  let daysSinceLastQuarterlyUpdate = 0;
  let currentQuarterIndex = 0;
  api.registerTimeTickHook((deltaYears, deltaMonths, deltaDays) => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;

    const effectiveDays = deltaDays + deltaMonths * 30 + deltaYears * 365;

    const caravanTick = Caravans.tick(effectiveDays);
    StrategicProcurement.reconcileCaravans(caravanTick.arrived, caravanTick.lost);
    if (api.layerIsOn("toggleTrade")) {
      TradeAnimation.start();
    }

    daysSinceLastQuarterlyUpdate += effectiveDays;
    if (daysSinceLastQuarterlyUpdate >= 90) {
      const quartersPassed = Math.floor(daysSinceLastQuarterlyUpdate / 90);
      daysSinceLastQuarterlyUpdate %= 90;
      for (let i = 0; i < quartersPassed; i++) {
        currentQuarterIndex = (currentQuarterIndex + 1) % 4;
        FoodProduction.generateQuarterlyLedger(currentQuarterIndex);
      }
    }

    // Check which states are at war
    const states = getWorldContext().pack.states;
    const statesAtWar = new Set<number>();
    if (states) {
      for (const state of states) {
        if (!state.removed && state.diplomacy && (state.diplomacy as unknown[]).includes("Enemy")) {
          statesAtWar.add(state.i);
        }
      }
    }

    // Update war duration and intensity for burgs; roll up supplyStrain onto states for manpower draft
    const ledgers = getWorldContext().pack.burgMarketLedgers;
    const burgs = getWorldContext().pack.burgs;
    const supplyByState = new Map<number, { sum: number; n: number }>();
    if (ledgers && burgs) {
      for (const ledger of ledgers) {
        const burg = burgs[ledger.burgId];
        if (!burg || burg.removed) continue;

        if (burg.state && statesAtWar.has(burg.state)) {
          ledger.warIntensity = Math.min(2.5, (ledger.warIntensity || 0) + 0.1);
          ledger.warDurationTicks = (ledger.warDurationTicks || 0) + effectiveDays;
        } else if (ledger.warIntensity && ledger.warIntensity > 0) {
          ledger.warIntensity = Math.max(0, ledger.warIntensity - 0.1);
          if (ledger.warIntensity <= 0.001) {
            ledger.warIntensity = 0;
            ledger.warDurationTicks = 0;
          }
        }

        if (burg.state && ledger.warIntensity) {
          const entry = supplyByState.get(burg.state) ?? { sum: 0, n: 0 };
          entry.sum += ledger.warIntensity;
          entry.n += 1;
          supplyByState.set(burg.state, entry);
        }
      }
    }
    // Manpower Phase 5: 0..1 supply strain from average burg warIntensity (cap 2.5 → 1.0)
    if (states) {
      for (const state of states) {
        if (!state?.i || state.removed) continue;
        const entry = supplyByState.get(state.i);
        state.supplyStrain = entry && entry.n > 0 ? Math.min(1, entry.sum / entry.n / 2.5) : 0;
      }
    }

    daysSinceLastProduction += effectiveDays;

    const effectiveDeltaYears = deltaYears + deltaMonths / 12 + deltaDays / 365.2425;
    const forestChanged = tickForestRegrowth(effectiveDeltaYears);

    if (forestChanged || daysSinceLastProduction >= 30) {
      if (daysSinceLastProduction >= 30) daysSinceLastProduction %= 30;
      scheduleProductionRefresh(true);
    }
  });

  // Bind trade animation renderer (must happen before any toggle)
  TradeAnimation.bind({
    draw: drawTradeAnimation,
    clear: clearTradeAnimation,
    isLayerOn: () => api.layerIsOn("toggleTrade")
  });

  // Register DOM-element getters so the layer panel can reorder economy SVG groups.
  api.registerLayerElement("toggleGoods", () => document.getElementById("goods"));
  api.registerLayerElement("toggleMarketsLayer", () => document.getElementById("marketsLayer"));
  api.registerLayerElement("toggleTrade", () => document.getElementById("tradeAnimation"));

  // Attach click handlers to economy SVG groups. Called after SVG elements are created
  // (on first addLayers) and again after every map load (via registerMapReinitHook).
  function attachSvgClickHandlers() {
    api.getSvgLayer("goods")?.on("click.openEditor", (event: MouseEvent) => {
      const target = event.target as SVGElement;
      if (target.closest("#goodsIcons, #goodsBurgs")) {
        api.openDialog("goodsEditor");
      }
    });

    api.getSvgLayer("marketsLayer")?.on("click.openMarket", (event: MouseEvent) => {
      const target = event.target as SVGElement;
      const g = target.closest<SVGGElement>("g[data-id]");
      if (!g?.dataset.id) return;
      api.openDialog("marketOverview", { marketId: +g.dataset.id });
    });
  }

  api.registerMapReinitHook(() => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    attachSvgClickHandlers();
    if (getWorldContext().options.gunpowderEraEnabled === false) refreshEconomyForGunpowderEra(api);
    // Backfill sales/poll tax rates and recompute treasury for maps saved before this feature existed.
    // Both calls are idempotent/cheap, so re-running them on every load is safe.
    Taxes.defineTaxRates();
    Taxes.collectTaxes();
    if (getWorldContext().pack.markets?.length) syncBurgMarketLedgers();
  });

  // Register layer toggle handlers
  api.registerLayerToggle("toggleGoods", (_event?: MouseEvent) => {
    if (!api.layerIsOn("toggleGoods")) {
      api.turnLayerOn("toggleGoods");
      if (api.viewContext.renderMode === "webglHybrid") {
        api.getSvgLayer("goods")?.style("display", "none");
        api.requestWebglRender();
        return;
      }
      drawGoods(getDisplayedGoodIds());
    } else {
      api.getSvgLayer("goods")?.selectAll("#goodsCells,#goodsIcons,#goodsBurgs").html("");
      api.turnLayerOff("toggleGoods");
    }
  });

  api.registerLayerToggle("toggleMarketsLayer", (_event?: MouseEvent) => {
    if (!api.layerIsOn("toggleMarketsLayer")) {
      api.turnLayerOn("toggleMarketsLayer");
      if (api.viewContext.renderMode === "webglHybrid") {
        api.getSvgLayer("marketsLayerFill")?.style("display", "none");
        api.getSvgLayer("marketsLayer")?.style("display", "none");
        api.requestWebglRender();
        return;
      }
      drawMarketsLayer();
    } else {
      api.getSvgLayer("marketsLayerFill")?.html("").style("display", "none");
      api.getSvgLayer("marketsLayer")?.html("").style("display", "none");
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
    if (api.viewContext.renderMode === "webglHybrid") {
      api.getSvgLayer("goods")?.style("display", "none");
      api.getSvgLayer("marketsLayerFill")?.style("display", "none");
      api.getSvgLayer("marketsLayer")?.style("display", "none");
      api.requestWebglRender();
      if (api.layerIsOn("toggleTrade")) TradeAnimation.start();
      return;
    }
    if (api.layerIsOn("toggleGoods")) drawGoods(getDisplayedGoodIds());
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
  if (_logHarvestedHandler) {
    document.removeEventListener("fmg:shipbuilding-log-harvested", _logHarvestedHandler);
    _logHarvestedHandler = null;
  }
  if (_materialsRequestedHandler) {
    document.removeEventListener("fmg:shipbuilding-materials-requested", _materialsRequestedHandler);
    _materialsRequestedHandler = null;
  }
  if (_strategicProcurementDemandHandler) {
    document.removeEventListener("fmg:shipbuilding-strategic-procurement-demand", _strategicProcurementDemandHandler);
    _strategicProcurementDemandHandler = null;
  }
  if (_strategicProcurementStatusHandler) {
    document.removeEventListener(
      "fmg:shipbuilding-strategic-procurement-status-request",
      _strategicProcurementStatusHandler
    );
    _strategicProcurementStatusHandler = null;
  }
  if (_voyageIncomeHandler) {
    document.removeEventListener("fmg:shipbuilding-voyage-income", _voyageIncomeHandler);
    _voyageIncomeHandler = null;
  }
  if (_mapPickCandidatesHandler) {
    document.removeEventListener("fmg:webgl-map-pick-candidates", _mapPickCandidatesHandler, { capture: true });
    _mapPickCandidatesHandler = null;
  }
  if (_gunpowderEraChangedHandler) {
    document.removeEventListener("fmg:gunpowder-era-changed", _gunpowderEraChangedHandler);
    _gunpowderEraChangedHandler = null;
  }
  clearVoyageIncome();
  clearStrategicProcurementExpenses();
  clearForestDepletion();
  StrategicProcurement.clear();
  clearBurgMarketLedgers();
  clearMarketManagers();

  // Remove layers, presets and clear tooltip hooks
  api.removeLayers(economyLayers.map(l => l.id));
  api.unregisterWebglLayers(ECONOMY_EXTENSION_ID);
  api.unregisterMapPickHandler(ECONOMY_EXTENSION_ID);
  for (const id of Object.keys(ECONOMY_PRESETS)) {
    api.unregisterPreset(id);
  }
  api.tooltipExtensions.showMapTooltip = undefined;
  api.tooltipExtensions.updateCellInfo = undefined;
  api.burgEconomyExtensions.getBurgEconomySummary = undefined;
  unregisterOverviewColumns(api);

  // Unregister tool action handlers
  api.unregisterToolAction("editGoods");
  api.unregisterToolAction("overviewMarketsButton");
  api.unregisterToolAction("editTradeAnimationButton");
  api.unregisterToolAction("burgProductionOverview");

  api.unregisterExtension(ECONOMY_EXTENSION_ID);
  clearEconomyContext();
}
