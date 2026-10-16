import type { ExtensionAPI } from "../../types/extension-api";
import type { Point } from "../hostCore";
import {
  type LayerConfig,
  regenerateFeatureDialogStore,
  useTimeSimulationState,
  useUiPreferencesState
} from "../hostUi";
import { formatPrice, rn, si } from "../hostUtils";
import { getBurgEconomySummary } from "./burgEconomySummary";
import { recordAdvanceBalanceSnapshot, recordInitialBalanceSnapshot } from "./controllers/balance-history";
import { economyStyleConfig } from "./EconomyStyleConfig";
import { bindEconomyView } from "./economyContext";
import { getBurgEmploymentComposition } from "./generators/burgEmploymentComposition";
import { buildBurgSiteEconomy } from "./generators/burgSiteEconomy";
import { getBurgSettlementValue, getStateSettlementValue } from "./generators/settlementValuation";
import { TradeAnimation } from "./generators/trade-animation";
import { getUrbanWaterSystemForBurg, sanitationScoreFromSystem } from "./generators/urbanWaterSystem";
import { drawGoods } from "./renderers/draw-goods";
import { drawMarketsLayer } from "./renderers/draw-markets";
import {
  clear as clearTradeAnimation,
  draw as drawTradeAnimation,
  getCaravanInstanceKey,
  getCaravanPosition,
  getCaravansAtPoint
} from "./renderers/draw-trade-animation";
import { drawDams } from "./renderers/drawDams";
import { drawLevees } from "./renderers/drawLevees";
import { drawMineralDeposits } from "./renderers/drawMineralDeposits";
import { drawPowerGrid } from "./renderers/drawPowerGrid";
import { drawSewerage } from "./renderers/drawSewerage";
import { drawWaterSupply } from "./renderers/drawWaterSupply";
import { economyMapPickHandler } from "./renderers/economyMapPickHandler";
import { createEconomyWebglLayerSpec } from "./renderers/economyWebglLayers";
import {
  ECONOMY_EXTENSION_ID,
  ECONOMY_GOODS_CHANGED_EVENT,
  ECONOMY_INITIALIZED_EVENT,
  type EconomyRegenerationTarget,
  economySimulation
} from "./simulation";
import { getDisplayedGoodIds, resetDisplayedGoodSelection } from "./store/goodsDisplaySelection";
import { showEconomyTooltip, updateEconomyCellInfo } from "./tooltipHandler";
import { BurgEditorGoodsTab } from "./ui/components/BurgEditorGoodsTab";
import { BurgEditorGuildsTab } from "./ui/components/BurgEditorGuildsTab";
import { BurgEditorInnsTab } from "./ui/components/BurgEditorInnsTab";
import { BurgEditorWaterTab } from "./ui/components/BurgEditorWaterTab";
import { StateFiscalReportTab } from "./ui/components/StateFiscalReportTab";
import { StatesEditorTreasuryTab } from "./ui/components/StatesEditorTreasuryTab";
import { BalanceHistoryDialog } from "./ui/dialogs/BalanceHistoryDialog";
import { CalibrationOverviewDialog } from "./ui/dialogs/CalibrationOverviewDialog";
import { CharacterMarketDialog } from "./ui/dialogs/CharacterMarketDialog";
import { CouncilSessionDialog } from "./ui/dialogs/CouncilSessionDialog";
import { CropClimateDialog } from "./ui/dialogs/CropClimateDialog";
import { DebtNegotiationDialog } from "./ui/dialogs/DebtNegotiationDialog";
import { DomainPollDetailDialog } from "./ui/dialogs/DomainPollDetailDialog";
import { EmploymentOverviewDialog } from "./ui/dialogs/EmploymentOverviewDialog";
import { GoodsDistributionEditorDialog } from "./ui/dialogs/GoodsDistributionEditorDialog";
import { GoodsEditorDialog } from "./ui/dialogs/GoodsEditorDialog";
import { GoodsProducersDialog } from "./ui/dialogs/GoodsProducersDialog";
import { GoodsStockDialog } from "./ui/dialogs/GoodsStockDialog";
import { GoodsTagsFilterDialog } from "./ui/dialogs/GoodsTagsFilterDialog";
import { GreatLibraryOverviewDialog } from "./ui/dialogs/GreatLibraryOverviewDialog";
import { GuildOverviewDialog } from "./ui/dialogs/GuildOverviewDialog";
import { MarketDealsDialog } from "./ui/dialogs/MarketDealsDialog";
import { MarketOverviewDialog } from "./ui/dialogs/MarketOverviewDialog";
import { MarketsGoodCompareDialog } from "./ui/dialogs/MarketsGoodCompareDialog";
import { MarketsOverviewDialog } from "./ui/dialogs/MarketsOverviewDialog";
import { MarketTradeOpportunitiesDialog } from "./ui/dialogs/MarketTradeOpportunitiesDialog";
import { MetallurgWorkDialog } from "./ui/dialogs/MetallurgWorkDialog";
import { MilitarySuppliesOverviewDialog } from "./ui/dialogs/MilitarySuppliesOverviewDialog";
import { MineralOverviewDialog } from "./ui/dialogs/MineralOverviewDialog";
import { OverseasRelationsDialog } from "./ui/dialogs/OverseasRelationsDialog";
import { ProductionChainsDialog } from "./ui/dialogs/ProductionChainsDialog";
import { ProductionOverviewDialog } from "./ui/dialogs/ProductionOverviewDialog";
import { StateEmploymentOverviewDialog } from "./ui/dialogs/StateEmploymentOverviewDialog";
import { TradeAnimationDialog } from "./ui/dialogs/TradeAnimationDialog";
import { TradeCorridorsDialog } from "./ui/dialogs/TradeCorridorsDialog";
import { TradeDetailsDialog } from "./ui/dialogs/TradeDetailsDialog";
import { TreasuryOverviewDialog } from "./ui/dialogs/TreasuryOverviewDialog";

function withRegenerateConfirmation(featureName: string, _id: string, onConfirm: () => void) {
  if (useUiPreferencesState.getState().dontAskRegenerateFeature) return onConfirm();

  regenerateFeatureDialogStore.getState().open({ featureName, onConfirm });
}

export { ECONOMY_EXTENSION_ID };

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
  },
  {
    id: "toggleMineralDeposits",
    name: "Mineral Deposits",
    shortcut: null,
    tooltip:
      "Mineral Deposits: discovered mines, colored and iconed by their primary commodity (dimmed once exhausted or idle). Click to toggle, drag to raise or lower the layer.",
    svgLayers: [{ id: "mineralDeposits", insertBefore: "icons", display: "none" }]
  },
  {
    id: "toggleDams",
    name: "Dams",
    shortcut: null,
    tooltip:
      "Dams: State-built river dams for flood control and (once electrified) hydroelectric power. Click to toggle, drag to raise or lower the layer.",
    svgLayers: [{ id: "dams", insertBefore: "icons", display: "none" }]
  },
  {
    id: "toggleLevees",
    name: "Levees",
    shortcut: null,
    tooltip:
      "Levees: State-built embankments protecting high-hazard river reaches from flooding. Click to toggle, drag to raise or lower the layer.",
    svgLayers: [{ id: "levees", insertBefore: "icons", display: "none" }]
  },
  {
    id: "toggleWaterSupply",
    name: "Water Supply",
    shortcut: null,
    tooltip:
      "Water Supply: Roman aqueducts serving Giant-settlement waterworks. Click to toggle, drag to raise or lower the layer.",
    svgLayers: [{ id: "waterSupply", insertAfter: "rivers", display: "none" }]
  },
  {
    id: "toggleSewerage",
    name: "Sewerage",
    shortcut: null,
    tooltip: "Sewerage: Giant-settlement trunk sewers and outfalls. Click to toggle, drag to raise or lower the layer.",
    svgLayers: [{ id: "sewerage", insertAfter: "waterSupply", display: "none" }]
  },
  {
    id: "togglePowerGrid",
    name: "Power Grid",
    shortcut: null,
    tooltip:
      "Power Grid: coal power stations and electrified dams, and (once a State's power grid is adopted) the transmission lines pooling their capacity at its capital. Click to toggle, drag to raise or lower the layer.",
    svgLayers: [{ id: "powerGrid", insertAfter: "sewerage", display: "none" }]
  }
];

/**
 * Formats an internal silver-piece amount as a compact numeric string (no coin emojis).
 * Display-only — CSV export uses getValue() raw numbers instead.
 *
 * si()'s own rounding (0 decimals below 1000) reads a genuinely small-but-nonzero Burg/State
 * treasury as literal "0" in Overview tables — a real gap in practice, since a struggling Burg
 * commonly sits in the sub-1 to low-single-digit sp range (confirmed by a live 711-burg check,
 * 2026-08-13: e.g. treasury 0.25, 0.36, 0.46 all round-displayed as "0"). Show real precision
 * below 100sp, where a whole-number silver piece is a coarse unit; keep si()'s K/M notation for
 * the large end where sub-sp precision is noise.
 */
function formatSilverAmount(value: number): string {
  const magnitude = Math.abs(value);
  if (magnitude < 10) return rn(value, 2).toString();
  if (magnitude < 100) return rn(value, 1).toString();
  return si(value);
}

/**
 * Registers/unregisters Burg Overview columns (Product, Treasury, labor residual, sanitation,
 * housing gap, settlement value), States Editor Treasury/Settlement value columns, and
 * Good/Market/Cell Production/Burg Production Cell Info rows. Called from the enable/disable
 * branches of subscribeExtensionState (and once at init() if already enabled) so these
 * appear/disappear live with the extension toggle, instead of always showing — unlike
 * registerDialog/registerAction/registerEditorTab, which are one-shot and only fully cleaned
 * up on unregisterExtension().
 */
function registerOverviewColumns(api: ExtensionAPI): void {
  // Header labels are deliberately short (3–4 chars) so dense Burgs Overview columns stay readable;
  // full names and units live in `tip` (hover) and in the footer average line's data-tip.
  api.registerBurgOverviewColumn({
    id: "product",
    extensionId: ECONOMY_EXTENSION_ID,
    label: "Prod",
    tip: "Product — gross product in silver pieces: local sale revenue minus purchased ingredient costs during production",
    getValue: burg => burg.product || 0,
    format: formatSilverAmount
  });
  api.registerBurgOverviewColumn({
    id: "treasury",
    extensionId: ECONOMY_EXTENSION_ID,
    label: "Tres",
    tip: "Treasury — balance in silver pieces",
    getValue: burg => burg.treasury || 0,
    format: formatSilverAmount
  });
  api.registerBurgOverviewColumn({
    id: "laborResidual",
    extensionId: ECONOMY_EXTENSION_ID,
    label: "Lab",
    tip: "Labor residual — market adults still unassigned after household care and sector employment. Positive means room for jobs; negative may indicate over-assignment.",
    getValue: burg => {
      if (!burg?.i) return 0;
      return getBurgEmploymentComposition(burg.i)?.residual ?? 0;
    },
    format: value => `${rn(value, 1)}`
  });
  api.registerBurgOverviewColumn({
    id: "sanitationScore",
    extensionId: ECONOMY_EXTENSION_ID,
    label: "San",
    tip: "Sanitation score — civic score 0–100 from the urban water model (written to burg.sanitation)",
    getValue: burg => {
      if (!burg?.i) return 0;
      const system = getUrbanWaterSystemForBurg(burg.i);
      if (system) return sanitationScoreFromSystem(system);
      return typeof burg.sanitation === "number" ? burg.sanitation : 0;
    },
    format: value => `${rn(value, 1)}`
  });
  api.registerBurgOverviewColumn({
    id: "housingGap",
    extensionId: ECONOMY_EXTENSION_ID,
    label: "Gap",
    tip: "Housing gap % — share of required dwellings still unbuilt. Drives construction jobs and material demand when Economy is enabled.",
    getValue: burg => {
      if (!burg?.i) return 0;
      const summary = getBurgEconomySummary(burg.i);
      if (!summary || summary.housingGap === "—") return 0;
      return Number.parseFloat(summary.housingGap) || 0;
    },
    format: value => `${rn(value, 1)}%`
  });
  api.registerBurgOverviewColumn({
    id: "settlementValue",
    extensionId: ECONOMY_EXTENSION_ID,
    label: "Val",
    tip: "Settlement value — housing replacement cost at the current culture recipe, × walls/citadel premium (silver pieces)",
    getValue: burg => (burg?.i ? (getBurgSettlementValue(burg.i)?.total ?? 0) : 0),
    format: formatSilverAmount
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
  api.registerStateOverviewColumn({
    id: "settlementValue",
    extensionId: ECONOMY_EXTENSION_ID,
    label: "Settlement value",
    tip: "Sum of burg housing settlement values in this state (culture recipe replacement cost × fortification).",
    getValue: state => (state?.i ? getStateSettlementValue(state.i) : 0),
    format: formatPrice
  });

  api.registerCellInfoRow({ id: "good", extensionId: ECONOMY_EXTENSION_ID, label: "Good" });
  api.registerCellInfoRow({ id: "market", extensionId: ECONOMY_EXTENSION_ID, label: "Market" });
  api.registerCellInfoRow({ id: "marketHolder", extensionId: ECONOMY_EXTENSION_ID, label: "Market Holder" });
  api.registerCellInfoRow({ id: "cellProduction", extensionId: ECONOMY_EXTENSION_ID, label: "Cell Production" });
  api.registerCellInfoRow({ id: "burgProduction", extensionId: ECONOMY_EXTENSION_ID, label: "Burg Production" });
  api.registerCellInfoRow({ id: "fauna", extensionId: ECONOMY_EXTENSION_ID, label: "Fauna" });
  api.registerCellInfoRow({ id: "irrigatedArea", extensionId: ECONOMY_EXTENSION_ID, label: "Irrigated area" });
  api.registerCellInfoRow({
    id: "irrigationSupplement",
    extensionId: ECONOMY_EXTENSION_ID,
    label: "Irrigation supplement"
  });
  api.registerCellInfoRow({
    id: "irrigationWaterStress",
    extensionId: ECONOMY_EXTENSION_ID,
    label: "Irrigation water stress"
  });
  api.registerCellInfoRow({ id: "riverResidualFlow", extensionId: ECONOMY_EXTENSION_ID, label: "River residual flow" });
  api.registerCellInfoRow({
    id: "cropClimate",
    extensionId: ECONOMY_EXTENSION_ID,
    label: "Crop climate",
    action: {
      label: "Open guide",
      tip: "Compare the pinned Cell Info temperature and precipitation with crop requirements",
      onClick: () => api.openDialog("cropClimate")
    }
  });
}

function unregisterOverviewColumns(api: ExtensionAPI): void {
  api.unregisterBurgOverviewColumn("product");
  // Legacy Product / 1k column id (removed); keep unregister so a hot-reload does not leave a stale header.
  api.unregisterBurgOverviewColumn("wealth");
  api.unregisterBurgOverviewColumn("treasury");
  api.unregisterBurgOverviewColumn("laborResidual");
  api.unregisterBurgOverviewColumn("sanitationScore");
  api.unregisterBurgOverviewColumn("housingGap");
  api.unregisterBurgOverviewColumn("settlementValue");
  api.unregisterStateOverviewColumn("treasury");
  api.unregisterStateOverviewColumn("settlementValue");
  api.unregisterCellInfoRow("good");
  api.unregisterCellInfoRow("market");
  api.unregisterCellInfoRow("marketHolder");
  api.unregisterCellInfoRow("cellProduction");
  api.unregisterCellInfoRow("burgProduction");
  api.unregisterCellInfoRow("fauna");
  api.unregisterCellInfoRow("irrigatedArea");
  api.unregisterCellInfoRow("irrigationSupplement");
  api.unregisterCellInfoRow("irrigationWaterStress");
  api.unregisterCellInfoRow("riverResidualFlow");
  api.unregisterCellInfoRow("cropClimate");
}

let _unsubscribe: (() => void) | null = null;
let _unregisterSimulation: (() => void) | null = null;
let _mapPickCandidatesHandler: ((e: Event) => void) | null = null;
let _timeAdvanceCompletedHandler: (() => void) | null = null;
let _worldLoadedHandler: (() => void) | null = null;
let _economyInitializedHandler: (() => void) | null = null;
let _goodsChangedHandler: ((e: Event) => void) | null = null;

export function init(api: ExtensionAPI): void {
  const regenerate = (target: EconomyRegenerationTarget) =>
    api.dispatchExtensionCommand({ extensionId: ECONOMY_EXTENSION_ID, name: "regenerate", payload: { target } });

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
  _unregisterSimulation = api.registerSimulationExtension(economySimulation);
  bindEconomyView(api);

  _goodsChangedHandler = event => {
    if (api.layerIsOn("toggleGoods")) drawGoods(getDisplayedGoodIds());
    if ((event as CustomEvent<{ webgl?: boolean } | undefined>).detail?.webgl) api.requestWebglRender();
  };
  document.addEventListener(ECONOMY_GOODS_CHANGED_EVENT, _goodsChangedHandler);

  // Balance History's first row for a freshly prepared map, then show the new data.
  _economyInitializedHandler = () => {
    // The previous map's Goods Editor checkbox selection must not carry over — the new
    // map may have picked a different historicalPeriod, which changes the default set.
    resetDisplayedGoodSelection();
    recordInitialBalanceSnapshot();
    api.requestWebglRender();
  };
  document.addEventListener(ECONOMY_INITIALIZED_EVENT, _economyInitializedHandler);

  // Balance History's first row for a just-loaded map (after the simulation entry's load upgrade).
  _worldLoadedHandler = () => {
    if (api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) recordInitialBalanceSnapshot();
  };
  document.addEventListener("fmg:world-loaded", _worldLoadedHandler);

  api.registerEditorTab({
    id: "states-treasury",
    extensionId: ECONOMY_EXTENSION_ID,
    editorId: "statesEditor",
    label: "Treasury",
    component: StatesEditorTreasuryTab
  });
  api.registerEditorTab({
    id: "state-fiscal-report",
    extensionId: ECONOMY_EXTENSION_ID,
    editorId: "stateEditor",
    label: "Fiscal report",
    component: StateFiscalReportTab
  });
  api.registerEditorTab({
    id: "burg-inns",
    extensionId: ECONOMY_EXTENSION_ID,
    editorId: "burgEditor",
    label: "Inns",
    component: BurgEditorInnsTab
  });
  api.registerEditorTab({
    id: "burg-goods",
    extensionId: ECONOMY_EXTENSION_ID,
    editorId: "burgEditor",
    label: "Goods",
    component: BurgEditorGoodsTab
  });
  api.registerEditorTab({
    id: "burg-water",
    extensionId: ECONOMY_EXTENSION_ID,
    editorId: "burgEditor",
    label: "Water",
    component: BurgEditorWaterTab
  });
  api.registerEditorTab({
    id: "burg-guilds",
    extensionId: ECONOMY_EXTENSION_ID,
    editorId: "burgEditor",
    label: "Guilds",
    component: BurgEditorGuildsTab
  });

  // Register Economy Dialogs
  api.registerDialog({ id: "GoodsEditorDialog", extensionId: ECONOMY_EXTENSION_ID, component: GoodsEditorDialog });
  api.registerDialog({ id: "cropClimate", extensionId: ECONOMY_EXTENSION_ID, component: CropClimateDialog });
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
  api.registerDialog({ id: "characterMarket", extensionId: ECONOMY_EXTENSION_ID, component: CharacterMarketDialog });
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
    id: "MilitarySuppliesOverviewDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: MilitarySuppliesOverviewDialog
  });
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
    id: "TradeCorridorsDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: TradeCorridorsDialog
  });
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
  api.registerDialog({
    id: "EmploymentOverviewDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: EmploymentOverviewDialog
  });
  api.registerDialog({
    id: "StateEmploymentOverviewDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: StateEmploymentOverviewDialog
  });
  api.registerDialog({
    id: "GuildOverviewDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: GuildOverviewDialog
  });
  api.registerDialog({
    id: "CalibrationOverviewDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: CalibrationOverviewDialog
  });
  api.registerDialog({
    id: "MetallurgWorkDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: MetallurgWorkDialog
  });
  api.registerDialog({
    id: "MineralOverviewDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: MineralOverviewDialog
  });
  api.registerDialog({
    id: "GreatLibraryOverviewDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: GreatLibraryOverviewDialog
  });
  api.registerDialog({
    id: "TreasuryOverviewDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: TreasuryOverviewDialog
  });
  api.registerDialog({
    id: "OverseasRelationsDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: OverseasRelationsDialog
  });
  api.registerDialog({
    id: "DebtNegotiationDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: DebtNegotiationDialog
  });
  api.registerDialog({
    id: "CouncilSessionDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: CouncilSessionDialog
  });
  api.registerDialog({
    id: "DomainPollDetailDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: DomainPollDetailDialog
  });
  api.registerDialog({
    id: "balanceHistory",
    extensionId: ECONOMY_EXTENSION_ID,
    component: BalanceHistoryDialog
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
      withRegenerateConfirmation("Economy", "regenerateEconomy", () => regenerate("economy"));
    }
  });

  api.registerAction({
    id: "economy-regenerate-currency",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "regenerate",
    label: "Currency",
    tooltip: "Rebuild state mint ledgers from current markets without changing mineral reserves",
    onClick: () => {
      withRegenerateConfirmation("Currency", "regenerateCurrency", () => regenerate("currency"));
    }
  });

  api.registerAction({
    id: "economy-regenerate-minerals",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "regenerate",
    label: "Mineral deposits",
    tooltip:
      "Regenerate geological provinces, deposits, and their accessible mine operations without changing goods placement",
    onClick: () => {
      withRegenerateConfirmation("Mineral deposits", "regenerateMinerals", () => regenerate("minerals"));
    }
  });

  api.registerAction({
    id: "economy-prospect-mines",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "regenerate",
    label: "Prospect mines",
    tooltip: "Re-evaluate road, river, and port access to discover deposits and improve deep-mine drainage",
    onClick: () => {
      api.dispatchExtensionCommand({ extensionId: ECONOMY_EXTENSION_ID, name: "mines.prospect", payload: undefined });
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
      withRegenerateConfirmation("Goods", "regenerateGoods", () => regenerate("goods"));
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
      withRegenerateConfirmation("Markets", "regenerateMarkets", () => regenerate("markets"));
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
      withRegenerateConfirmation("Production", "regenerateProduction", () => regenerate("production"));
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

  api.registerAction({
    id: "economy-edit-employment",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    label: "Employment",
    dialogId: "employmentOverview",
    tooltip: "Click to open Employment Overview — basic and service employment demand by Burg",
    onClick: () => {
      document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "employmentOverviewButton" } }));
    }
  });

  api.registerAction({
    id: "economy-edit-state-employment",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    label: "State employment",
    dialogId: "stateEmploymentOverview",
    tooltip:
      "Click to open State Employment Overview — rural and urban labor, guild-artisan employment, and surplus/unemployment by State",
    onClick: () => {
      document.dispatchEvent(
        new CustomEvent("react-tool-action", { detail: { action: "stateEmploymentOverviewButton" } })
      );
    }
  });

  api.registerAction({
    id: "economy-edit-guilds",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    label: "Guilds",
    dialogId: "guildOverview",
    tooltip: "Click to open Guild Overview — craft-domain guild technique and treasury by Burg",
    onClick: () => {
      document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "guildOverviewButton" } }));
    }
  });

  api.registerAction({
    id: "economy-craft-calibration",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    label: "Craft calibration",
    dialogId: "calibrationOverview",
    tooltip: "Compare authored historical craft demand with live employment (diagnostics; production is unchanged)",
    onClick: () => {
      document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "calibrationOverviewButton" } }));
    }
  });

  api.registerAction({
    id: "economy-metallurg-work",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    label: "Metallurg work",
    dialogId: "metallurgWorkOverview",
    tooltip: "Open the Metallurg work queue, material forecast, and procurement status",
    onClick: () => {
      document.dispatchEvent(
        new CustomEvent("react-tool-action", { detail: { action: "metallurgWorkOverviewButton" } })
      );
    }
  });

  api.registerAction({
    id: "economy-military-supplies-overview",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    label: "Military supplies",
    dialogId: "militarySuppliesOverview",
    tooltip: "Open military equipment and latest supply deliveries by state",
    onClick: () => {
      document.dispatchEvent(
        new CustomEvent("react-tool-action", { detail: { action: "militarySuppliesOverviewButton" } })
      );
    }
  });

  api.registerAction({
    id: "economy-minerals-overview",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    label: "Minerals",
    dialogId: "mineralOverview",
    tooltip: "Open Minerals Overview — deposits, mine status, reserves, capacity, and output by resource",
    onClick: () => {
      document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "mineralOverviewButton" } }));
    }
  });

  api.registerAction({
    id: "economy-edit-treasury",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    label: "Treasury",
    dialogId: "treasuryOverview",
    tooltip: "Click to open Treasury Overview — department budget allocation and military funding ratio by State",
    onClick: () => {
      document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "treasuryOverviewButton" } }));
    }
  });

  api.registerAction({
    id: "economy-overseas-relations",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    label: "Overseas Relations",
    dialogId: "overseasRelations",
    tooltip: "Open Overseas Relations — trade voyages to Distant Realms beyond the map, for States with a sea port",
    onClick: () => {
      document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "overseasRelationsButton" } }));
    }
  });

  api.registerAction({
    id: "economy-great-library",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    label: "Great Library",
    dialogId: "greatLibraryOverview",
    tooltip: "Open Great Library Overview — royal-patronage library projects and per-State start eligibility",
    onClick: () => {
      document.dispatchEvent(
        new CustomEvent("react-tool-action", { detail: { action: "greatLibraryOverviewButton" } })
      );
    }
  });

  api.registerAction({
    id: "economy-edit-balance-history",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    label: "Balance History",
    dialogId: "balanceHistory",
    tooltip:
      "Click to open Balance History — Population/Goods/Fauna over time, one row per generation and Advance Time action, downloadable as CSV for balance tuning",
    onClick: () => {
      document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "balanceHistoryButton" } }));
    }
  });

  api.registerAction({
    id: "economy-edit-debt-negotiation",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    label: "Debt terms",
    dialogId: "debtNegotiation",
    tooltip: "Click to open Debt Negotiation — named Banker syndicate, rates, and faction vote snapshot",
    onClick: () => {
      document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "debtNegotiationButton" } }));
    }
  });

  api.registerAction({
    id: "economy-edit-council-session",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    label: "Council log",
    dialogId: "councilSession",
    tooltip: "Click to open Council Session Log — assembly votes, vetoes, debt, and coup chronicle",
    onClick: () => {
      document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "councilSessionButton" } }));
    }
  });

  api.registerAction({
    id: "economy-edit-domain-poll",
    extensionId: ECONOMY_EXTENSION_ID,
    tab: "tools",
    section: "edit",
    label: "Domain poll",
    dialogId: "domainPollDetail",
    tooltip: "Click to open Domain Poll Detail — per-burg levy contribution to state poll tax",
    onClick: () => {
      document.dispatchEvent(new CustomEvent("react-tool-action", { detail: { action: "domainPollDetailButton" } }));
    }
  });

  // Register tool action handlers so core tools.ts has no knowledge of extension dialogs.
  // The handler implements the same open/close + layer toggle pattern used for built-in editors.
  const toggleEditorDialog = (dialogId: string, layerId: string | null) => {
    if (api.isDialogOpen(dialogId)) {
      api.closeDialog(dialogId);
    } else {
      const wasLayerOn = layerId ? api.layerIsOn(layerId) : false;
      api.openDialog(dialogId, {
        // Goods and Markets initialize themselves after their React dialog mounts and can
        // replace onClose. onAfterClose survives that update, so both the toolbar toggle
        // and the titlebar ✕/✕✕ restore only the layer this dialog turned on.
        onAfterClose: () => {
          if (layerId && !wasLayerOn && api.layerIsOn(layerId)) api.toggleLayerById(layerId);
        }
      });
    }
  };

  api.registerToolAction("editGoods", () => toggleEditorDialog("goodsEditor", "toggleGoods"));
  api.registerToolAction("overviewMarketsButton", () => toggleEditorDialog("marketsOverview", "toggleMarketsLayer"));
  api.registerToolAction("editTradeAnimationButton", () => toggleEditorDialog("tradeAnimationEditor", "toggleTrade"));
  api.registerToolAction("employmentOverviewButton", () => toggleEditorDialog("employmentOverview", null));
  api.registerToolAction("stateEmploymentOverviewButton", () => toggleEditorDialog("stateEmploymentOverview", null));
  api.registerToolAction("guildOverviewButton", () => toggleEditorDialog("guildOverview", null));
  api.registerToolAction("calibrationOverviewButton", () => toggleEditorDialog("calibrationOverview", null));
  api.registerToolAction("metallurgWorkOverviewButton", () => toggleEditorDialog("metallurgWorkOverview", null));
  api.registerToolAction("militarySuppliesOverviewButton", () => toggleEditorDialog("militarySuppliesOverview", null));
  api.registerToolAction("mineralOverviewButton", () => toggleEditorDialog("mineralOverview", null));
  api.registerToolAction("treasuryOverviewButton", () => toggleEditorDialog("treasuryOverview", null));
  api.registerToolAction("overseasRelationsButton", () => toggleEditorDialog("overseasRelations", null));
  api.registerToolAction("greatLibraryOverviewButton", () => toggleEditorDialog("greatLibraryOverview", null));
  api.registerToolAction("balanceHistoryButton", () => toggleEditorDialog("balanceHistory", null));
  api.registerToolAction("debtNegotiationButton", () => toggleEditorDialog("debtNegotiation", null));
  api.registerToolAction("councilSessionButton", () => toggleEditorDialog("councilSession", null));
  api.registerToolAction("domainPollDetailButton", () => toggleEditorDialog("domainPollDetail", null));
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
      api.burgEconomyExtensions.getBurgSiteEconomy = buildBurgSiteEconomy;
      registerOverviewColumns(api);
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
      api.closeDialog("tradeCorridors");
      api.closeDialog("productionChains");
      api.closeDialog("productionOverview");
      api.closeDialog("tradeAnimationEditor");
      api.closeDialog("employmentOverview");
      api.closeDialog("stateEmploymentOverview");
      api.closeDialog("guildOverview");
      api.closeDialog("calibrationOverview");
      api.closeDialog("metallurgWorkOverview");
      api.closeDialog("militarySuppliesOverview");
      api.closeDialog("treasuryOverview");
      api.closeDialog("overseasRelations");
      api.closeDialog("greatLibraryOverview");
      api.closeDialog("debtNegotiation");
      api.closeDialog("councilSession");
      api.closeDialog("domainPollDetail");
      api.closeDialog("characterMarket");

      api.tooltipExtensions.showMapTooltip = undefined;
      api.tooltipExtensions.updateCellInfo = undefined;
      api.burgEconomyExtensions.getBurgEconomySummary = undefined;
      api.burgEconomyExtensions.getBurgSiteEconomy = undefined;
      unregisterOverviewColumns(api);
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
    api.burgEconomyExtensions.getBurgSiteEconomy = buildBurgSiteEconomy;
    registerOverviewColumns(api);
  }

  // One Balance History row per completed Advance Day/Month/Year action — see
  // notifyAdvanceCompleted()'s doc-comment in src/generators/timeEngine.ts for why this event
  // (rather than the per-day `fmg:time-advanced`) is the right granularity.
  _timeAdvanceCompletedHandler = () => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    recordAdvanceBalanceSnapshot();
  };
  document.addEventListener("fmg:time-advance-completed", _timeAdvanceCompletedHandler);

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
        id: `economy-caravan-${getCaravanInstanceKey(caravan)}`,
        cellId: -1,
        index: caravan.i,
        coordinate: [pos.x, pos.y]
      });
    }
  };
  document.addEventListener("fmg:webgl-map-pick-candidates", _mapPickCandidatesHandler, { capture: true });

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
  api.registerLayerElement("toggleMineralDeposits", () => document.getElementById("mineralDeposits"));
  api.registerLayerElement("toggleDams", () => document.getElementById("dams"));
  api.registerLayerElement("toggleLevees", () => document.getElementById("levees"));
  api.registerLayerElement("toggleWaterSupply", () => document.getElementById("waterSupply"));
  api.registerLayerElement("toggleSewerage", () => document.getElementById("sewerage"));
  api.registerLayerElement("togglePowerGrid", () => document.getElementById("powerGrid"));

  // Attach click handlers to economy SVG groups. Called after SVG elements are created
  // (on first addLayers) and again after every map load (via registerMapReinitHook).
  function attachSvgClickHandlers() {
    api.getSvgLayer("goods")?.on("click.openEditor", (event: MouseEvent) => {
      const target = event.target as SVGElement;

      const burgPlate = target.closest<SVGGElement>("#goodsBurgs g[data-id]");
      if (burgPlate?.dataset.id) {
        api.openDialog("productionOverview", { burgId: +burgPlate.dataset.id });
        return;
      }

      if (target.closest("#goodsIcons")) {
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

  api.registerLayerToggle("toggleMineralDeposits", (_event?: MouseEvent) => {
    if (!api.layerIsOn("toggleMineralDeposits")) {
      api.turnLayerOn("toggleMineralDeposits");
      if (api.viewContext.renderMode === "webglHybrid") {
        api.getSvgLayer("mineralDeposits")?.style("display", "none");
        api.requestWebglRender();
        return;
      }
      drawMineralDeposits();
    } else {
      api.getSvgLayer("mineralDeposits")?.html("");
      api.turnLayerOff("toggleMineralDeposits");
    }
  });

  api.registerLayerToggle("toggleDams", (_event?: MouseEvent) => {
    if (!api.layerIsOn("toggleDams")) {
      api.turnLayerOn("toggleDams");
      if (api.viewContext.renderMode === "webglHybrid") {
        api.getSvgLayer("dams")?.style("display", "none");
        api.requestWebglRender();
        return;
      }
      drawDams();
    } else {
      api.getSvgLayer("dams")?.html("");
      api.turnLayerOff("toggleDams");
    }
  });

  api.registerLayerToggle("toggleLevees", (_event?: MouseEvent) => {
    if (!api.layerIsOn("toggleLevees")) {
      api.turnLayerOn("toggleLevees");
      if (api.viewContext.renderMode === "webglHybrid") {
        api.getSvgLayer("levees")?.style("display", "none");
        api.requestWebglRender();
        return;
      }
      drawLevees();
    } else {
      api.getSvgLayer("levees")?.html("");
      api.turnLayerOff("toggleLevees");
    }
  });

  api.registerLayerToggle("toggleWaterSupply", (_event?: MouseEvent) => {
    if (!api.layerIsOn("toggleWaterSupply")) {
      api.turnLayerOn("toggleWaterSupply");
      // The supply layer is SVG in both render modes: it is infrastructure geometry that has no
      // deck.gl equivalent yet, so hiding it in hybrid mode would make the feature disappear.
      drawWaterSupply();
    } else {
      api.getSvgLayer("waterSupply")?.html("");
      api.turnLayerOff("toggleWaterSupply");
    }
  });

  api.registerLayerToggle("toggleSewerage", (_event?: MouseEvent) => {
    if (!api.layerIsOn("toggleSewerage")) {
      api.turnLayerOn("toggleSewerage");
      // Like aqueducts, trunk sewers are an SVG overlay in both render modes until deck.gl owns
      // utility infrastructure geometry.
      drawSewerage();
    } else {
      api.getSvgLayer("sewerage")?.html("");
      api.turnLayerOff("toggleSewerage");
    }
  });

  api.registerLayerToggle("togglePowerGrid", (_event?: MouseEvent) => {
    if (!api.layerIsOn("togglePowerGrid")) {
      api.turnLayerOn("togglePowerGrid");
      // Same reasoning as toggleWaterSupply/toggleSewerage above: power stations and transmission
      // lines are schematic infrastructure geometry with no deck.gl equivalent yet, so this stays
      // SVG in both render modes rather than disappearing in hybrid mode.
      drawPowerGrid();
    } else {
      api.getSvgLayer("powerGrid")?.html("");
      api.turnLayerOff("togglePowerGrid");
    }
  });

  // Redraw economy layers whenever the host calls drawLayers()
  api.registerDrawLayerHook(() => {
    // The economy tick publishes extension.economy on every simulated day. A
    // bulk Advance Month/Year run therefore reaches this hook once per
    // asynchronous simulation chunk, but its intermediate SVG state is not observable before the run
    // ends. Redrawing goods, markets, deposits, or trade paths here can make
    // SVG mode spend most of its time rebuilding the same layers. Defer every
    // decorative economy redraw to the finish-time extension commit from
    // publishBulkRunFinishedRedraw(). Explicit layer toggles still draw
    // immediately through their own handlers above.
    const isBulkTimeAdvanceRunning = useTimeSimulationState.getState().isRunning;
    if (isBulkTimeAdvanceRunning) return;

    if (api.viewContext.renderMode === "webglHybrid") {
      api.getSvgLayer("goods")?.style("display", "none");
      api.getSvgLayer("marketsLayerFill")?.style("display", "none");
      api.getSvgLayer("marketsLayer")?.style("display", "none");
      api.getSvgLayer("mineralDeposits")?.style("display", "none");
      api.getSvgLayer("dams")?.style("display", "none");
      api.getSvgLayer("levees")?.style("display", "none");
      api.requestWebglRender();
      if (api.layerIsOn("toggleWaterSupply")) drawWaterSupply();
      if (api.layerIsOn("toggleSewerage")) drawSewerage();
      if (api.layerIsOn("togglePowerGrid")) drawPowerGrid();
      if (api.layerIsOn("toggleTrade")) TradeAnimation.start();
      return;
    }
    if (api.layerIsOn("toggleGoods")) drawGoods(getDisplayedGoodIds());
    if (api.layerIsOn("toggleMarketsLayer")) drawMarketsLayer();
    if (api.layerIsOn("toggleMineralDeposits")) drawMineralDeposits();
    if (api.layerIsOn("toggleDams")) drawDams();
    if (api.layerIsOn("toggleLevees")) drawLevees();
    if (api.layerIsOn("toggleWaterSupply")) drawWaterSupply();
    if (api.layerIsOn("toggleSewerage")) drawSewerage();
    if (api.layerIsOn("togglePowerGrid")) drawPowerGrid();
    if (api.layerIsOn("toggleTrade")) TradeAnimation.start();
  });
}

export function cleanup(api: ExtensionAPI): void {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  if (_mapPickCandidatesHandler) {
    document.removeEventListener("fmg:webgl-map-pick-candidates", _mapPickCandidatesHandler, { capture: true });
    _mapPickCandidatesHandler = null;
  }
  if (_timeAdvanceCompletedHandler) {
    document.removeEventListener("fmg:time-advance-completed", _timeAdvanceCompletedHandler);
    _timeAdvanceCompletedHandler = null;
  }
  if (_worldLoadedHandler) {
    document.removeEventListener("fmg:world-loaded", _worldLoadedHandler);
    _worldLoadedHandler = null;
  }
  if (_economyInitializedHandler) {
    document.removeEventListener(ECONOMY_INITIALIZED_EVENT, _economyInitializedHandler);
    _economyInitializedHandler = null;
  }
  if (_goodsChangedHandler) {
    document.removeEventListener(ECONOMY_GOODS_CHANGED_EVENT, _goodsChangedHandler);
    _goodsChangedHandler = null;
  }
  _unregisterSimulation?.();
  _unregisterSimulation = null;
  bindEconomyView(null);

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
  api.burgEconomyExtensions.getBurgSiteEconomy = undefined;
  unregisterOverviewColumns(api);

  // Unregister tool action handlers
  api.unregisterToolAction("editGoods");
  api.unregisterToolAction("overviewMarketsButton");
  api.unregisterToolAction("editTradeAnimationButton");
  api.unregisterToolAction("burgProductionOverview");
  api.unregisterToolAction("employmentOverviewButton");
  api.unregisterToolAction("stateEmploymentOverviewButton");
  api.unregisterToolAction("guildOverviewButton");
  api.unregisterToolAction("calibrationOverviewButton");
  api.unregisterToolAction("metallurgWorkOverviewButton");
  api.unregisterToolAction("militarySuppliesOverviewButton");
  api.unregisterToolAction("mineralOverviewButton");
  api.unregisterToolAction("treasuryOverviewButton");
  api.unregisterToolAction("overseasRelationsButton");
  api.unregisterToolAction("greatLibraryOverviewButton");
  api.unregisterToolAction("balanceHistoryButton");
  api.unregisterToolAction("debtNegotiationButton");
  api.unregisterToolAction("councilSessionButton");
  api.unregisterToolAction("domainPollDetailButton");

  api.unregisterExtension(ECONOMY_EXTENSION_ID);
}
