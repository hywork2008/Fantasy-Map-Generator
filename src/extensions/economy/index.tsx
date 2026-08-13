import type { DataTopic } from "../../runtime/worldRuntime";
import type { ExtensionAPI } from "../../types/extension-api";
import type { Point } from "../hostCore";
import { isStateInActiveConflict, useOptionsState } from "../hostCore";
import {
  isShipbuildingInitialStockRequest,
  isShipbuildingMaterialRequest,
  isShipbuildingMerchantHullsSnapshot,
  isShipbuildingProcurementStatusRequest,
  isShipbuildingShipGoodStockRequest,
  isShipbuildingStrategicProcurementDemand,
  isShipbuildingSurplusShipRequest
} from "../hostTypes";
import {
  type LayerConfig,
  regenerateFeatureDialogStore,
  useTimeSimulationState,
  useUiPreferencesState
} from "../hostUi";
import { formatPrice, measureTickStep, measureTickStepAsync, rn, si, TIME } from "../hostUtils";
import { getBurgEconomySummary } from "./burgEconomySummary";
import { recordAdvanceBalanceSnapshot, recordInitialBalanceSnapshot } from "./controllers/balance-history";
import { economyStyleConfig } from "./EconomyStyleConfig";
import {
  clearEconomyContext,
  getBurgMarketLedgers,
  getCaravans,
  getGoodCellColumn,
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getMetallurgAssetLedgers,
  getMilitaryResourceLedgers,
  getMineOperations,
  getMintLedgers,
  getSmelterOperations,
  getTradeSecurityLedgers,
  getWorldContext,
  initEconomyContext,
  setBurgMarketLedgers,
  setCaravans,
  setDeals,
  setGoodCellColumn,
  setGoods,
  setGreatLibraryLastSettledYear,
  setGreatLibraryNextId,
  setGreatLibraryProjects,
  setGuildChapters,
  setGuildChaptersLastSettledYear,
  setIndividualSkills,
  setMarketCellColumn,
  setMarkets,
  setSmithingWorkshopLedgers
} from "./economyContext";
import { AcademyKnowledge } from "./generators/academyKnowledge";
import { AgTechInvestment } from "./generators/agTechInvestment";
import { reconcileAnnualBasicEmploymentWorkers } from "./generators/basicEmployment";
import { getBurgEmploymentComposition } from "./generators/burgEmploymentComposition";
import { clearBurgMarketLedgers, syncBurgMarketLedgers } from "./generators/burgMarketLedgers";
import { Caravans } from "./generators/caravans";
import { ConstructionOperations } from "./generators/constructionEmployment";
import {
  applyCharacterToConstructionJob,
  cancelConstructionApplication,
  clearConstructionHireState,
  resignConstructionJob,
  tickConstructionHiring
} from "./generators/constructionHire";
import { DevelopmentPotential } from "./generators/developmentPotential";
import {
  applyCharacterToEscortJob,
  cancelEscortApplication,
  clearEscortHiringSession,
  resignEscortJob,
  tickEscortHiring
} from "./generators/escortHire";
import { clearEscortHireState, rebuildEscortJobPostings, tickEscortJobBoard } from "./generators/escortJobPostings";
import { ExportStaging } from "./generators/exportStaging";
import {
  clearFaunaPopulation,
  recordQuarterlyNonFoodDemand,
  updateAnnualFaunaCohorts
} from "./generators/faunaPopulation";
import { resetEffectiveCapacities } from "./generators/foodImportNetwork";
import { settleMonthlyFoodConsumption } from "./generators/foodLedgerConsumption";
import { FoodProduction } from "./generators/foodProduction";
import { registerLogHarvest, tickForestRegrowth } from "./generators/forestStock";
import {
  type Good,
  Goods,
  getDefaultGoodTradeProfile,
  isGoodEnabled,
  migrateFoodProcessingLotContracts,
  migrateFreshFoodTags,
  migrateGrapesGood,
  migrateLegacyOreIngotGoods,
  migrateLiveAnimalTags,
  migrateLiveCatsGood,
  migrateLiveDogsGood,
  migratePerennialFruitGoods,
  migratePomaceDistillationGoods,
  migrateRaisinsGood,
  migrateSmeltingFuelAndAshGoods,
  migrateStapleCropGoods,
  migrateWineRecipe
} from "./generators/goods-generator";
import { GreatLibrary } from "./generators/greatLibrary";
import { GuildChapters } from "./generators/guildChapters";
import { GuildKnowledge } from "./generators/guildKnowledge";
import { GuildSuccession } from "./generators/guildSuccession";
import { GuildTreasury } from "./generators/guildTreasury";
import {
  getForestRegrowthMultiplier,
  settleAnnualColdClimateKnowledge,
  settleMonthlyHeating
} from "./generators/heating";
import type { IncrementalBatchOptions } from "./generators/incrementalBatching";
import { IndustrialTechInvestment } from "./generators/industrialTechInvestment";
import { InnFacilities } from "./generators/innFacilities";
import { InnStays } from "./generators/innStays";
import { clearLiveAnimalCatchAccumulators } from "./generators/liveAnimalCatch";
import { clearFlowDiagnostics } from "./generators/marketFlowDiagnostics";
import { clearMarketManagers, syncMarketManagers } from "./generators/marketManagers";
import { Markets } from "./generators/markets-generator";
import { MartialDisciplineKnowledge } from "./generators/martialDisciplineKnowledge";
import { MartialIndividualMastery } from "./generators/martialIndividualMastery";
import { clearMerchantOrganizations } from "./generators/merchantOrganizations";
import { clearMarketMerchantPortfolios, syncMarketMerchantPortfolios } from "./generators/merchantPortfolios";
import { MerchantTransportAssets } from "./generators/merchantTransportAssets";
import { MetallurgWork } from "./generators/metallurgWork";
import { MilitaryResources } from "./generators/militaryResources";
import { MineOperations } from "./generators/mineOperations";
import { MineralResources } from "./generators/mineralResources";
import { Minting } from "./generators/minting";
import { clearPlayerMarketCommerce, executePlayerMarketTrade } from "./generators/playerCommerce";
import { Production } from "./generators/production-generator";
import { QuarryOperations } from "./generators/quarryOperations";
import {
  clearRetailInventory,
  planRetailReplenishment,
  planRetailReplenishmentIncrementally,
  tickRetailInventory
} from "./generators/retailInventory";
import { releaseRuralLaborSurplus } from "./generators/ruralLaborRelease";
import { SaltLogistics } from "./generators/saltLogistics";
import { getBurgSettlementValue, getStateSettlementValue } from "./generators/settlementValuation";
import { seedShipbuildingInitialStock } from "./generators/shipbuildingInitialStock";
import { SmelterOperations } from "./generators/smelterOperations";
import { refreshStateEconomySummaries } from "./generators/stateEconomySummary";
import { clearStateFiscalReports } from "./generators/stateFiscalReport";
import { StateSecretKnowledge } from "./generators/stateSecretKnowledge";
import { StrategicProcurement } from "./generators/strategicProcurement";
import {
  clearStrategicProcurementExpenses,
  clearVoyageIncome,
  registerVoyageIncome,
  Taxes
} from "./generators/taxes-generator";
import {
  applyCharacterToCullJob,
  cancelCullApplication,
  clearCullHiringSession,
  resignCullJob,
  tickCullHiring
} from "./generators/threatCullHire";
import { clearCullHireState, rebuildCullJobPostings, tickCullJobBoard } from "./generators/threatCullJobPostings";
import { TradeAnimation } from "./generators/trade-animation";
import { TradeSecurity } from "./generators/tradeSecurity";
import { TransportAssetOrders } from "./generators/transportAssetOrders";
import { clearTreasuryAllocationSnapshots } from "./generators/treasuryAllocation";
import { UrbanLaborIntake } from "./generators/urbanLaborIntake";
import {
  clearUrbanPregnancy,
  clearUrbanPregnancyBirthFloorRegistration,
  registerUrbanPregnancyBirthFloor,
  tickUrbanPregnancy,
  unregisterUrbanPregnancyBirthFloor
} from "./generators/urbanPregnancy";
import { getUrbanWaterSystemForBurg, sanitationScoreFromSystem, UrbanWater } from "./generators/urbanWaterSystem";
import { clearViticultureAllocationShares } from "./generators/viticultureAllocation";
import { VolcanicOperations } from "./generators/volcanicOperations";
import { drawGoods } from "./renderers/draw-goods";
import { drawMarketsLayer } from "./renderers/draw-markets";
import {
  clear as clearTradeAnimation,
  draw as drawTradeAnimation,
  getCaravanPosition,
  getCaravansAtPoint
} from "./renderers/draw-trade-animation";
import { drawMineralDeposits } from "./renderers/drawMineralDeposits";
import { economyMapPickHandler } from "./renderers/economyMapPickHandler";
import { createEconomyWebglLayerSpec } from "./renderers/economyWebglLayers";
import { getDisplayedGoodIds } from "./store/goodsDisplaySelection";
import { showEconomyTooltip, updateEconomyCellInfo } from "./tooltipHandler";
import { BurgEditorGoodsTab } from "./ui/components/BurgEditorGoodsTab";
import { BurgEditorGuildsTab } from "./ui/components/BurgEditorGuildsTab";
import { BurgEditorInnsTab } from "./ui/components/BurgEditorInnsTab";
import { BurgEditorWaterTab } from "./ui/components/BurgEditorWaterTab";
import { StateFiscalReportTab } from "./ui/components/StateFiscalReportTab";
import { StatesEditorTreasuryTab } from "./ui/components/StatesEditorTreasuryTab";
import { BalanceHistoryDialog } from "./ui/dialogs/BalanceHistoryDialog";
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
import { ProductionChainsDialog } from "./ui/dialogs/ProductionChainsDialog";
import { ProductionOverviewDialog } from "./ui/dialogs/ProductionOverviewDialog";
import { TradeAnimationDialog } from "./ui/dialogs/TradeAnimationDialog";
import { TradeDetailsDialog } from "./ui/dialogs/TradeDetailsDialog";
import { TreasuryOverviewDialog } from "./ui/dialogs/TreasuryOverviewDialog";

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
let _unregisterMapReadyTask: (() => void) | null = null;
let _logHarvestedHandler: ((e: Event) => void) | null = null;
let _materialsRequestedHandler: ((e: Event) => void) | null = null;
let _strategicProcurementDemandHandler: ((e: Event) => void) | null = null;
let _strategicProcurementStatusHandler: ((e: Event) => void) | null = null;
let _shipbuildingInitialStockRequestHandler: ((e: Event) => void) | null = null;
let _shipbuildingShipGoodStockRequestHandler: ((e: Event) => void) | null = null;
let _shipbuildingSurplusShipRequestHandler: ((e: Event) => void) | null = null;
let _shipbuildingMerchantHullsSnapshotHandler: ((e: Event) => void) | null = null;
let _shipbuildingMerchantHullChangedHandler: ((e: Event) => void) | null = null;
let _shipbuildingMerchantHullsUnavailableHandler: (() => void) | null = null;
let _voyageIncomeHandler: ((e: Event) => void) | null = null;
let _mapPickCandidatesHandler: ((e: Event) => void) | null = null;
let _gunpowderEraChangedHandler: (() => void) | null = null;
let _worldLoadedHandler: (() => void) | null = null;
let _timeAdvanceCompletedHandler: (() => void) | null = null;
let _settlementPromotedHandler: ((e: Event) => void) | null = null;
let _unregisterGoodsAssignCellCommand: (() => void) | null = null;
let _unregisterGoodsUpdateCommand: (() => void) | null = null;
let _unregisterGoodsAddCommand: (() => void) | null = null;
let _unregisterGoodsRemoveCommand: (() => void) | null = null;
let _unregisterMarketAssignCellsCommand: (() => void) | null = null;
let _unregisterMarketAddCommand: (() => void) | null = null;
let _unregisterMarketRemoveCommand: (() => void) | null = null;
let _unregisterMarketColorCommand: (() => void) | null = null;
let _unregisterProductionSettlementCommand: (() => void) | null = null;
let _unregisterRegenerateCommand: (() => void) | null = null;
let _unregisterGunpowderRefreshCommand: (() => void) | null = null;
let _unregisterMineProspectingCommand: (() => void) | null = null;
let _unregisterClearCommand: (() => void) | null = null;
let _unregisterJobsApplyCommand: (() => void) | null = null;
let _unregisterJobsResignCommand: (() => void) | null = null;
let _unregisterJobsCancelCommand: (() => void) | null = null;
let _unregisterJobsApplyCullCommand: (() => void) | null = null;
let _unregisterJobsResignCullCommand: (() => void) | null = null;
let _unregisterJobsCancelCullCommand: (() => void) | null = null;
let _unregisterJobsApplyEscortCommand: (() => void) | null = null;
let _unregisterJobsResignEscortCommand: (() => void) | null = null;
let _unregisterJobsCancelEscortCommand: (() => void) | null = null;
let _unregisterCommerceTradeCommand: (() => void) | null = null;
let _unregisterTickSystem: (() => void) | null = null;

interface AssignGoodToCellRequest {
  readonly cellId: number;
  readonly goodId: number;
}

interface GoodSettings {
  readonly name: string;
  readonly tags: readonly string[];
  readonly value: number;
  readonly unit: string;
  readonly icon: string;
  readonly color: string;
  readonly chance?: number;
  readonly distribution?: string;
}

interface GoodSettingsRequest extends GoodSettings {
  readonly goodId: number;
}

interface MarketCellAssignment {
  readonly cellId: number;
  readonly marketId: number;
}

interface AssignMarketCellsRequest {
  readonly assignments: readonly MarketCellAssignment[];
}

type EconomyRegenerationTarget = "economy" | "currency" | "goods" | "markets" | "minerals" | "production";

function isAssignGoodToCellRequest(value: unknown): value is AssignGoodToCellRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return Number.isInteger(candidate.cellId) && Number.isInteger(candidate.goodId);
}

function isGoodSettings(value: unknown): value is GoodSettings {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === "string" &&
    Array.isArray(candidate.tags) &&
    candidate.tags.every(tag => typeof tag === "string") &&
    typeof candidate.value === "number" &&
    typeof candidate.unit === "string" &&
    typeof candidate.icon === "string" &&
    typeof candidate.color === "string" &&
    (candidate.chance === undefined || typeof candidate.chance === "number") &&
    (candidate.distribution === undefined || typeof candidate.distribution === "string")
  );
}

function isGoodSettingsRequest(value: unknown): value is GoodSettingsRequest {
  return isGoodSettings(value) && Number.isInteger((value as { goodId?: unknown }).goodId);
}

function isGoodIdRequest(value: unknown): value is { readonly goodId: number } {
  return !!value && typeof value === "object" && Number.isInteger((value as { goodId?: unknown }).goodId);
}

function isAssignMarketCellsRequest(value: unknown): value is AssignMarketCellsRequest {
  if (!value || typeof value !== "object") return false;
  const assignments = (value as { assignments?: unknown }).assignments;
  return (
    Array.isArray(assignments) &&
    assignments.every(
      assignment =>
        !!assignment &&
        typeof assignment === "object" &&
        Number.isInteger((assignment as { cellId?: unknown }).cellId) &&
        Number.isInteger((assignment as { marketId?: unknown }).marketId)
    )
  );
}

function isMarketColorRequest(value: unknown): value is { readonly marketId: number; readonly color: string } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { marketId?: unknown; color?: unknown };
  return Number.isInteger(candidate.marketId) && typeof candidate.color === "string";
}

function isBurgIdRequest(value: unknown): value is { readonly burgId: number } {
  return !!value && typeof value === "object" && Number.isInteger((value as { burgId?: unknown }).burgId);
}

function isMarketIdRequest(value: unknown): value is { readonly marketId: number } {
  return !!value && typeof value === "object" && Number.isInteger((value as { marketId?: unknown }).marketId);
}

function isPlayerMarketTradeRequest(value: unknown): value is {
  readonly characterId: number;
  readonly goodId: number;
  readonly units: number;
  readonly direction: "buy" | "sell";
} {
  if (!value || typeof value !== "object") return false;
  const request = value as { characterId?: unknown; goodId?: unknown; units?: unknown; direction?: unknown };
  return (
    Number.isInteger(request.characterId) &&
    Number.isInteger(request.goodId) &&
    typeof request.units === "number" &&
    Number.isFinite(request.units) &&
    request.units > 0 &&
    (request.direction === "buy" || request.direction === "sell")
  );
}

function isEconomyRegenerationRequest(value: unknown): value is { readonly target: EconomyRegenerationTarget } {
  if (!value || typeof value !== "object") return false;
  const target = (value as { target?: unknown }).target;
  return (
    target === "economy" ||
    target === "currency" ||
    target === "goods" ||
    target === "markets" ||
    target === "minerals" ||
    target === "production"
  );
}

function isSettlementPromotionEvent(
  event: Event
): event is CustomEvent<{ cellId: number; burgId: number; stateId: number }> {
  const detail = (event as CustomEvent<unknown>).detail;
  if (!detail || typeof detail !== "object") return false;
  const value = detail as { cellId?: unknown; burgId?: unknown; stateId?: unknown };
  return Number.isInteger(value.cellId) && Number.isInteger(value.burgId) && Number.isInteger(value.stateId);
}

/** Refresh the player-commerce projection after a market topology or stock source changes. */
function synchronizePlayerCommerce(): void {
  measureTickStep("production:merchantPortfolios", () => syncMarketMerchantPortfolios());
  // planRetailReplenishment already reconciles once; do not call reconcile separately.
  measureTickStep("production:planRetail", () => planRetailReplenishment());
}

/**
 * Same refresh as synchronizePlayerCommerce() (identical output — planRetailReplenishment's
 * cost dwarfs syncMarketMerchantPortfolios' in every profiled run), but awaits
 * planRetailReplenishmentIncrementally() so the browser stays responsive between market
 * batches. Used only by the "Preparing economy" Map Ready task's initial pass — every other
 * caller (job board / market / goods edit handlers, "economy.production.settle") keeps calling
 * the synchronous synchronizePlayerCommerce(), since they need an immediately-consistent result.
 */
async function synchronizePlayerCommerceIncrementally(options: IncrementalBatchOptions): Promise<boolean> {
  measureTickStep("production:merchantPortfolios", () => syncMarketMerchantPortfolios());
  return measureTickStepAsync("production:planRetail", () =>
    planRetailReplenishmentIncrementally(undefined, undefined, options)
  );
}

function applyGoodSettings(good: Good, request: GoodSettingsRequest): boolean {
  const changed =
    good.name !== request.name ||
    good.value !== request.value ||
    good.unit !== request.unit ||
    good.icon !== request.icon ||
    good.color !== request.color ||
    good.chance !== request.chance ||
    good.distribution !== request.distribution ||
    good.tags.length !== request.tags.length ||
    good.tags.some((tag, index) => tag !== request.tags[index]);
  if (!changed) return false;

  good.name = request.name;
  good.tags = [...request.tags];
  good.value = request.value;
  good.unit = request.unit;
  good.icon = request.icon;
  good.color = request.color;
  good.chance = request.chance;
  good.distribution = request.distribution;
  return true;
}

function registerEconomyCommands(api: ExtensionAPI): void {
  _unregisterGoodsAssignCellCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "goods.assignCell",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to assign a good to a cell");
      }
      if (!isAssignGoodToCellRequest(value)) {
        throw new Error("economy.goods.assignCell requires integer cellId and goodId values");
      }

      const goodCellColumn = getGoodCellColumn();
      if (!goodCellColumn.length || value.cellId < 0 || value.cellId >= goodCellColumn.length) {
        throw new Error(`economy.goods.assignCell received invalid cell ${value.cellId}`);
      }

      const currentGoodId = goodCellColumn[value.cellId];
      const nextGoodId = currentGoodId ? 0 : value.goodId;
      if (nextGoodId && !Goods.get(nextGoodId)) {
        throw new Error(`economy.goods.assignCell could not find good ${nextGoodId}`);
      }
      if (currentGoodId === nextGoodId) return { changed: false };

      goodCellColumn[value.cellId] = nextGoodId;
      return { changed: true, result: { cellId: value.cellId, goodId: nextGoodId } };
    }
  });
  _unregisterGoodsUpdateCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "goods.update",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) throw new Error("Economy must be enabled to update a good");
      if (!isGoodSettingsRequest(value)) throw new Error("economy.goods.update received invalid settings");

      const good = Goods.get(value.goodId);
      if (!good) throw new Error(`economy.goods.update could not find good ${value.goodId}`);
      const changed = applyGoodSettings(good, value);
      if (changed) {
        Goods.sync();
        synchronizePlayerCommerce();
      }
      return { changed, result: { goodId: good.i } };
    }
  });
  _unregisterGoodsAddCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "goods.add",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) throw new Error("Economy must be enabled to add a good");
      if (!isGoodSettings(value)) throw new Error("economy.goods.add received invalid settings");

      const goods = getGoods();
      const nextId = goods.reduce((maxId, good) => Math.max(maxId, good.i), 0) + 1;
      const good: Good = {
        i: nextId,
        name: value.name,
        tags: [...value.tags],
        value: value.value,
        unit: value.unit,
        icon: value.icon,
        color: value.color,
        chance: value.chance,
        distribution: value.distribution,
        trade: getDefaultGoodTradeProfile({
          name: value.name,
          tags: [...value.tags],
          value: value.value,
          unit: value.unit
        })
      };
      goods.push(good);
      Goods.sync();
      synchronizePlayerCommerce();
      return { changed: true, result: { goodId: nextId } };
    }
  });
  _unregisterGoodsRemoveCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "goods.remove",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) throw new Error("Economy must be enabled to remove a good");
      if (!isGoodIdRequest(value)) throw new Error("economy.goods.remove requires an integer goodId");

      const world = getWorldContext();
      const goods = getGoods();
      const index = goods.findIndex(good => good.i === value.goodId);
      if (index === -1) throw new Error(`economy.goods.remove could not find good ${value.goodId}`);
      const goodCellColumn = getGoodCellColumn();
      for (const cellId of world.pack.cells.i) {
        if (goodCellColumn[cellId] === value.goodId) goodCellColumn[cellId] = 0;
      }
      goods.splice(index, 1);
      Goods.sync();
      synchronizePlayerCommerce();
      return { changed: true, result: { goodId: value.goodId } };
    }
  });
  _unregisterMarketAssignCellsCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "markets.assignCells",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to assign market territory");
      }
      if (!isAssignMarketCellsRequest(value)) {
        throw new Error("economy.markets.assignCells requires integer cell and market ids");
      }

      const world = getWorldContext();
      const cells = world.pack.cells;
      const marketCellColumn = getMarketCellColumn();
      const markets = new Set(getMarkets().map(market => market.i));
      const finalAssignments = new Map<number, number>();
      for (const { cellId, marketId } of value.assignments) {
        if (cellId < 0 || cellId >= marketCellColumn.length) {
          throw new Error(`economy.markets.assignCells received invalid cell ${cellId}`);
        }
        if (marketId < 0 || (marketId !== 0 && !markets.has(marketId))) {
          throw new Error(`economy.markets.assignCells could not find market ${marketId}`);
        }
        finalAssignments.set(cellId, marketId);
      }

      const changedCellIds: number[] = [];
      for (const [cellId, marketId] of finalAssignments) {
        if (marketCellColumn[cellId] === marketId) continue;
        marketCellColumn[cellId] = marketId;
        const burgId = cells.burg[cellId];
        if (burgId && world.pack.burgs[burgId]) world.pack.burgs[burgId].market = marketId;
        changedCellIds.push(cellId);
      }
      if (!changedCellIds.length) return { changed: false };

      Markets.invalidateRuralProductionCache();
      syncBurgMarketLedgers();
      synchronizePlayerCommerce();
      return { changed: true, result: { changedCellIds } };
    }
  });
  _unregisterMarketAddCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "markets.add",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) throw new Error("Economy must be enabled to add a market");
      if (!isBurgIdRequest(value)) throw new Error("economy.markets.add requires an integer burgId");

      const market = Markets.addMarket(value.burgId);
      if (market) synchronizePlayerCommerce();
      return market ? { changed: true, result: { marketId: market.i } } : { changed: false };
    }
  });
  _unregisterMarketRemoveCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "markets.remove",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) throw new Error("Economy must be enabled to remove a market");
      if (!isMarketIdRequest(value)) throw new Error("economy.markets.remove requires an integer marketId");

      const removed = Markets.removeMarket(value.marketId);
      if (removed) synchronizePlayerCommerce();
      return removed ? { changed: true, result: { marketId: value.marketId } } : { changed: false };
    }
  });
  _unregisterMarketColorCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "markets.setColor",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) throw new Error("Economy must be enabled to update a market");
      if (!isMarketColorRequest(value)) throw new Error("economy.markets.setColor requires a market id and color");

      const market = Markets.get(value.marketId);
      if (!market) throw new Error(`economy.markets.setColor could not find market ${value.marketId}`);
      if (market.color === value.color) return { changed: false };
      market.color = value.color;
      return { changed: true, result: { marketId: market.i, color: market.color } };
    }
  });
  _unregisterProductionSettlementCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "production.settle",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to settle production");
      }
      const skipFoodConsumption =
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value) &&
        Object.keys(value).length === 1 &&
        (value as Record<string, unknown>).skipFoodConsumption === true;
      if (value !== undefined && !skipFoodConsumption) {
        throw new Error("economy.production.settle does not accept a payload");
      }

      measureTickStep("production:produce", () => Production.produce());
      measureTickStep("production:householdHeating", () => settleMonthlyHeating());
      // Completed forge Goods are transferred from market stock to the queue before the next
      // planning pass refreshes maintenance and consumable demand.
      measureTickStep("production:metallurgFulfillment", () => MetallurgWork.fulfillFromMarkets());
      measureTickStep("production:metallurgWork", () => MetallurgWork.settleMonthly());
      measureTickStep("production:metallurgProcurement", requestMetallurgMaterials);
      measureTickStep("production:metallurgForecast", () => MetallurgWork.refreshMaterialForecasts());
      measureTickStep("production:innStays", () => InnStays.settleMonthly());
      if (!skipFoodConsumption) {
        measureTickStep("production:foodConsumption", () => settleMonthlyFoodConsumption());
      }
      measureTickStep("production:taxes", () => Taxes.collectTaxes());
      measureTickStep("production:stateSummaries", () => refreshStateEconomySummaries());
      measureTickStep("production:playerCommerce", () => synchronizePlayerCommerce());
      return { changed: true };
    }
  });
  _unregisterRegenerateCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "regenerate",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) throw new Error("Economy must be enabled to regenerate data");
      if (!isEconomyRegenerationRequest(value)) throw new Error("economy.regenerate received an invalid target");

      // Goods before DevelopmentPotential — see the matching comment at the main generation call
      // site (2026-08-07, docs/plan/fauna-biome-realism.md §3 Phase B follow-up): DevelopmentPotential
      // reads getGoods() (via calculateHusbandryDemand()/calculateViticultureDemand()) to find
      // Cattle/Sheep/.../Grapes, which is empty on the very first "economy" regenerate before Goods
      // has ever been generated.
      if (value.target === "economy" || value.target === "goods") Goods.generate();
      if (value.target === "economy" || value.target === "minerals") {
        MineralResources.generate();
        DevelopmentPotential.generate();
        // See the matching comment at the main generation call site — reseeds any cell whose fauna
        // stock hadn't been created yet instead of leaving it to appear lazily on first draw.
        updateAnnualFaunaCohorts();
      }
      if (value.target === "economy" || value.target === "markets") {
        Markets.generate(true);
        SaltLogistics.generate();
      }
      if (value.target === "economy") {
        InnFacilities.generate();
        InnStays.clear();
        UrbanWater.generate();
      }
      if (value.target === "economy" || value.target === "minerals") MineOperations.generate();
      if (value.target === "economy" || value.target === "minerals") SmelterOperations.generate();
      // Quarries are a separate site model from ore (docs/plan/urban-construction-industry.md
      // §3.2, decision D3) but regenerate together with the other physical extraction sites.
      if (value.target === "economy" || value.target === "minerals") QuarryOperations.generate();
      // Depends on MineralResources' "volcanic" GeologicalProvinceKind cells, regenerated just
      // above under the same target gate (docs/plan/urban-construction-industry.md §3.4,
      // docs/plan/volcanic-biome-goods.md §3.3).
      if (value.target === "economy" || value.target === "minerals") VolcanicOperations.generate();
      // Construction depends on QuarryOperations' hasQuarryAccess snapshot, so it regenerates
      // right after (docs/plan/urban-construction-industry.md §3.3).
      if (value.target === "economy" || value.target === "minerals") ConstructionOperations.generate();
      if (value.target === "economy" || value.target === "currency") Minting.generate();
      if (value.target === "economy") MilitaryResources.generate();
      if (value.target === "economy") TradeSecurity.generate();
      if (value.target === "economy") Taxes.defineTaxRates();
      if (value.target === "economy" || value.target === "production") {
        FoodProduction.seedFoodLedgerBootstrap();
        Production.produce();
        Taxes.collectTaxes();
        if (value.target === "economy") MetallurgWork.generate();
        else MetallurgWork.fulfillFromMarkets();
        MetallurgWork.settleMonthly();
        requestMetallurgMaterials();
        MetallurgWork.refreshMaterialForecasts();
      }
      if (value.target === "economy") GuildChapters.seedAfterGenerate();
      synchronizePlayerCommerce();
      return { changed: true, result: { target: value.target } };
    }
  });
  _unregisterGunpowderRefreshCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "refreshGunpowderEra",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to refresh gunpowder-era data");
      }
      if (value !== undefined) throw new Error("economy.refreshGunpowderEra does not accept a payload");

      refreshEconomyForGunpowderEraData();
      return { changed: true };
    }
  });
  _unregisterMineProspectingCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "mines.prospect",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) throw new Error("Economy must be enabled to prospect mines");
      if (value !== undefined) throw new Error("economy.mines.prospect does not accept a payload");

      const result = MineOperations.prospect();
      if (result.discovered) SmelterOperations.generate();
      return { changed: result.discovered > 0 || result.upgraded > 0, result };
    }
  });
  _unregisterJobsApplyCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "jobs.applyConstruction",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to apply for construction work");
      }
      const payload = value as { characterId?: number; burgId?: number; role?: "mason" | "carpenter" } | undefined;
      if (!payload?.characterId || !payload?.burgId) {
        throw new Error("jobs.applyConstruction requires { characterId, burgId }");
      }
      const result = applyCharacterToConstructionJob({
        characterId: payload.characterId,
        burgId: payload.burgId,
        role: payload.role
      });
      return { changed: result.ok, result };
    }
  });
  _unregisterJobsResignCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "jobs.resignConstruction",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to resign construction work");
      }
      const payload = value as { characterId?: number } | undefined;
      if (!payload?.characterId) throw new Error("jobs.resignConstruction requires { characterId }");
      const result = resignConstructionJob(payload.characterId);
      return { changed: result.ok, result };
    }
  });
  _unregisterJobsCancelCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "jobs.cancelConstructionApplication",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to cancel a construction application");
      }
      const payload = value as { characterId?: number } | undefined;
      if (!payload?.characterId) throw new Error("jobs.cancelConstructionApplication requires { characterId }");
      const result = cancelConstructionApplication(payload.characterId);
      return { changed: result.ok, result };
    }
  });
  _unregisterJobsApplyCullCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "jobs.applyCull",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to apply for cull work");
      }
      const payload = value as { characterId?: number; postingId?: number } | undefined;
      if (!payload?.characterId || !payload?.postingId) {
        throw new Error("jobs.applyCull requires { characterId, postingId }");
      }
      const result = applyCharacterToCullJob({
        characterId: payload.characterId,
        postingId: payload.postingId
      });
      return { changed: result.ok, result };
    }
  });
  _unregisterJobsResignCullCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "jobs.resignCull",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to resign cull work");
      }
      const payload = value as { characterId?: number } | undefined;
      if (!payload?.characterId) throw new Error("jobs.resignCull requires { characterId }");
      const result = resignCullJob(payload.characterId);
      return { changed: result.ok, result };
    }
  });
  _unregisterJobsCancelCullCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "jobs.cancelCullApplication",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to cancel a cull application");
      }
      const payload = value as { characterId?: number } | undefined;
      if (!payload?.characterId) throw new Error("jobs.cancelCullApplication requires { characterId }");
      const result = cancelCullApplication(payload.characterId);
      return { changed: result.ok, result };
    }
  });
  _unregisterJobsApplyEscortCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "jobs.applyEscort",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to apply for escort work");
      }
      const payload = value as { characterId?: number; postingId?: number } | undefined;
      if (!payload?.characterId || !payload?.postingId) {
        throw new Error("jobs.applyEscort requires { characterId, postingId }");
      }
      const result = applyCharacterToEscortJob({
        characterId: payload.characterId,
        postingId: payload.postingId
      });
      return { changed: result.ok, result };
    }
  });
  _unregisterJobsResignEscortCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "jobs.resignEscort",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to resign escort work");
      }
      const payload = value as { characterId?: number } | undefined;
      if (!payload?.characterId) throw new Error("jobs.resignEscort requires { characterId }");
      const result = resignEscortJob(payload.characterId);
      return { changed: result.ok, result };
    }
  });
  _unregisterJobsCancelEscortCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "jobs.cancelEscortApplication",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to cancel an escort application");
      }
      const payload = value as { characterId?: number } | undefined;
      if (!payload?.characterId) throw new Error("jobs.cancelEscortApplication requires { characterId }");
      const result = cancelEscortApplication(payload.characterId);
      return { changed: result.ok, result };
    }
  });
  _unregisterCommerceTradeCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "commerce.trade",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to trade goods");
      }
      if (!isPlayerMarketTradeRequest(value)) {
        throw new Error("commerce.trade requires { characterId, goodId, units, direction }");
      }
      const result = executePlayerMarketTrade(value);
      return { changed: result.ok, result };
    }
  });
  _unregisterClearCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "clear",
    execute: value => {
      if (value !== undefined) throw new Error("economy.clear does not accept a payload");

      const world = getWorldContext();
      resetEffectiveCapacities(world.pack.burgs);
      DevelopmentPotential.clear();
      UrbanLaborIntake.clear();
      clearBurgMarketLedgers();
      clearMarketManagers();
      clearMarketMerchantPortfolios();
      clearRetailInventory();
      clearPlayerMarketCommerce();
      MineOperations.clear();
      SmelterOperations.clear();
      QuarryOperations.clear();
      SaltLogistics.clear();
      VolcanicOperations.clear();
      ConstructionOperations.clear();
      InnFacilities.clear();
      InnStays.clear();
      UrbanWater.clear();
      clearConstructionHireState();
      clearCullHireState();
      clearCullHiringSession();
      clearEscortHireState();
      clearEscortHiringSession();
      clearUrbanPregnancy();
      MineralResources.clear();
      Minting.clear();
      MilitaryResources.clear();
      TradeSecurity.clear();
      setGoods([]);
      setMarkets([]);
      setDeals([]);
      ExportStaging.clear();
      clearFlowDiagnostics();
      setCaravans([]);
      MerchantTransportAssets.clear();
      TransportAssetOrders.clear();
      setBurgMarketLedgers([]);
      clearMerchantOrganizations();
      if (world.pack.cells?.i) {
        setGoodCellColumn(new Uint16Array(world.pack.cells.i.length));
        setMarketCellColumn(new Uint16Array(world.pack.cells.i.length));
      }
      clearLiveAnimalCatchAccumulators();
      clearFaunaPopulation();
      clearViticultureAllocationShares();
      clearStrategicProcurementExpenses();
      clearTreasuryAllocationSnapshots();
      StrategicProcurement.clear();
      setGuildChapters([]);
      setGuildChaptersLastSettledYear(null);
      setGreatLibraryProjects([]);
      setGreatLibraryLastSettledYear(null);
      setGreatLibraryNextId(1);
      setIndividualSkills([]);
      setSmithingWorkshopLedgers([]);
      MetallurgWork.clear();
      return { changed: true };
    }
  });
}

/**
 * Sends only the remaining material gap to public procurement. The destination market's State
 * pays the price; independent Burgs remain visible as shortages until they join a State market.
 */
function requestMetallurgMaterials(): void {
  const burgs = getWorldContext().pack.burgs;
  const marketsById = new Map(getMarkets().map(market => [market.i, market]));
  for (const forecast of MetallurgWork.getMaterialForecasts()) {
    if (!(forecast.projectedShortage > 0)) continue;
    const market = marketsById.get(forecast.marketId);
    const stateId = market ? burgs[market.centerBurgId]?.state : undefined;
    if (!stateId) continue;
    StrategicProcurement.handleMetallurgMaterialDemand({
      stateId,
      destinationMarketId: forecast.marketId,
      goodId: forecast.goodId,
      requestedUnits: forecast.projectedShortage
    });
  }
}

function refreshEconomyForGunpowderEraData(): void {
  Goods.generate();
  Markets.generate(true);
  SaltLogistics.generate();
  MilitaryResources.generate();
  Production.produce();
  MetallurgWork.generate();
  MetallurgWork.settleMonthly();
  requestMetallurgMaterials();
  MetallurgWork.refreshMaterialForecasts();
  synchronizePlayerCommerce();
  const caravans = getCaravans();
  if (caravans.length) {
    setCaravans(
      caravans
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
        .filter((caravan): caravan is Exclude<typeof caravan, null> => caravan !== null)
    );
  }
}

function refreshEconomyForGunpowderEra(api: ExtensionAPI): void {
  const commit = api.dispatchExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "refreshGunpowderEra",
    payload: undefined
  });
  if (!commit) return;
  if (api.layerIsOn("toggleGoods")) drawGoods(getDisplayedGoodIds());
  api.requestWebglRender();
}

export function init(api: ExtensionAPI): void {
  initEconomyContext(api);
  registerEconomyCommands(api);
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
    id: "GuildOverviewDialog",
    extensionId: ECONOMY_EXTENSION_ID,
    component: GuildOverviewDialog
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
  api.registerToolAction("guildOverviewButton", () => toggleEditorDialog("guildOverview", null));
  api.registerToolAction("metallurgWorkOverviewButton", () => toggleEditorDialog("metallurgWorkOverview", null));
  api.registerToolAction("militarySuppliesOverviewButton", () => toggleEditorDialog("militarySuppliesOverview", null));
  api.registerToolAction("mineralOverviewButton", () => toggleEditorDialog("mineralOverview", null));
  api.registerToolAction("treasuryOverviewButton", () => toggleEditorDialog("treasuryOverview", null));
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
      registerOverviewColumns(api);
      // Demography birth floor: pregnancy due sets a lower bound on urban births (PR-P2).
      registerUrbanPregnancyBirthFloor();
      // Data generation is deliberately deferred. During core map generation the
      // coordinator will run this task after the map is complete; for a live map
      // it runs only Economy's task, without resetting unrelated extensions.
      api.requestMapReadyTask("economy.initialization");
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
      api.closeDialog("employmentOverview");
      api.closeDialog("guildOverview");
      api.closeDialog("metallurgWorkOverview");
      api.closeDialog("militarySuppliesOverview");
      api.closeDialog("treasuryOverview");
      api.closeDialog("greatLibraryOverview");
      api.closeDialog("debtNegotiation");
      api.closeDialog("councilSession");
      api.closeDialog("domainPollDetail");
      api.closeDialog("characterMarket");

      // Clear economy data through the extension-owned command after disabling.
      api.dispatchExtensionCommand({ extensionId: ECONOMY_EXTENSION_ID, name: "clear", payload: undefined });
      unregisterUrbanPregnancyBirthFloor();
      api.tooltipExtensions.showMapTooltip = undefined;
      api.tooltipExtensions.updateCellInfo = undefined;
      api.burgEconomyExtensions.getBurgEconomySummary = undefined;
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
    registerOverviewColumns(api);
    registerUrbanPregnancyBirthFloor();
    // A persisted preference is restored before the first map has generated.
    // Defer state-dependent data work until fmg:generate-post-core in that case.
    if (getWorldContext().pack.states?.length) {
      DevelopmentPotential.generate();
      if (!getTradeSecurityLedgers().length) TradeSecurity.generate();
      if (getMarkets().length) {
        syncMarketManagers();
        syncBurgMarketLedgers();
        synchronizePlayerCommerce();
        FoodProduction.seedFoodLedgerBootstrap();
        const migratedMetallurgTools = MetallurgWork.migrateLegacyToolsUnitScale();
        if (!getMetallurgAssetLedgers().length) {
          MetallurgWork.generate();
          MetallurgWork.settleMonthly();
        } else if (migratedMetallurgTools) {
          MetallurgWork.settleMonthly();
        }
      }
    }
  }

  _unregisterMapReadyTask = api.registerMapReadyTask({
    id: "economy.initialization",
    label: "Preparing economy",
    run: async context => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID) || !context.isCurrent()) return;
      if (api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        TIME && console.time("generateEconomy");
        try {
          // A new map reuses state ids from 0 — any voyage income buffered against the
          // previous map's states must not carry over.
          clearVoyageIncome();
          clearStrategicProcurementExpenses();
          clearTreasuryAllocationSnapshots();
          clearStateFiscalReports();
          StrategicProcurement.clear();
          TradeAnimation.clearRouteCache();
          MineralResources.generate();
          // Goods before DevelopmentPotential (2026-08-07, docs/plan/fauna-biome-realism.md §3 Phase
          // B follow-up): DevelopmentPotential.generate() -> storeAgriculture() ->
          // allocateRuralOccupations() calls calculateHusbandryDemand()/calculateViticultureDemand(),
          // both of which read getGoods() to find Cattle/Sheep/.../Grapes. Running DevelopmentPotential
          // first meant getGoods() was still empty on every fresh generation, so husbandryRequiredWorkers/
          // viticultureRequiredWorkers (and so every grazed-species fauna stock and Grapes/Wine output)
          // were silently 0 for the map's entire first year, self-correcting only once
          // updateAnnualAgriculture() re-ran on the first "Advance Time" tick (found via live-map
          // verification while diagnosing "Cattle/Sheep never appear").
          Goods.generate();
          DevelopmentPotential.generate();
          Markets.generate();
          SaltLogistics.generate();
          // Seed every eligible cell's fauna stock now rather than waiting for the first annual
          // tick (2026-08-07, docs/plan/fauna-biome-realism.md §3 Phase G): without this, a stock
          // entry only gets created lazily on that cell's first hunting/husbandry draw, so cells
          // that hadn't been assigned a hunter yet showed "Wild: 0" in CellInfo next to same-biome
          // neighbors already in the thousands — an artifact of allocation order, not ecology. This
          // call unconditionally seeds every land cell at ~60% of its actual carrying capacity
          // (initializeStock(), same as the annual update does), matching what the first Advance
          // Time tick would have produced anyway.
          updateAnnualFaunaCohorts();
          MerchantTransportAssets.requestMerchantHullSnapshot();
          MineOperations.generate();
          SmelterOperations.generate();
          QuarryOperations.generate();
          VolcanicOperations.generate();
          ConstructionOperations.generate();
          Minting.generate();
          MilitaryResources.generate();
          TradeSecurity.generate();
          Taxes.defineTaxRates();
          FoodProduction.seedFoodLedgerBootstrap();
          const isCancelled = () => !context.isCurrent() || !api.isExtensionEnabled(ECONOMY_EXTENSION_ID);
          // A user-controlled preference (Options > Generation, "Skip trade route generation")
          // defers Markets.runGlobalTrade()/Caravans.spawnFromDeals() — the data the Trade
          // layer/animation draws from — until requested via Tools > Economy > Regenerate >
          // Production (registered below as "economy-regenerate-production", which always calls
          // the synchronous Production.produce() regardless of this preference). Everything else
          // generates as usual; only the trade-matching pass is deferred, since profiling showed
          // it's the one chunk of this task that's purely about Trade-layer output a fresh map
          // rarely needs to see immediately.
          const skipGlobalTrade = useUiPreferencesState.getState().economySkipTradeOnGenerate;
          const completed = await Production.produceIncrementally({
            isCancelled,
            onProgress: (done, total) => context.reportProgress(total ? done / total : 1),
            skipGlobalTrade
          });
          if (!completed || isCancelled()) return;
          settleMonthlyHeating();
          Taxes.collectTaxes();
          MetallurgWork.generate();
          MetallurgWork.settleMonthly();
          // Production has now observed this map's real metallurgy practitioners. Bootstrap the
          // first guild masters immediately rather than waiting for the player's first Advance
          // Time action; GuildTreasury then gives every new master both workshop capital and a
          // personal starting purse in this same generation transaction.
          GuildKnowledge.settleAnnual();
          for (const { burgId, domain } of GuildSuccession.settleAnnual()) {
            GuildTreasury.seedNewGuildWorkingCapital(burgId, domain);
          }
          const commerceSynced = await synchronizePlayerCommerceIncrementally({ isCancelled });
          if (!commerceSynced || isCancelled()) return;
          GuildChapters.seedAfterGenerate();
          InnFacilities.generate();
          InnStays.clear();
          UrbanWater.generate();
          // Threat cull / pest job board (docs/plan/player-threat-cull-jobs.md PR-2).
          rebuildCullJobPostings({ clearAll: true });
          // Escort (護衛) job board — all culture sets.
          rebuildEscortJobPostings({ clearAll: true });
          // Balance History's first row for this map — everything above has settled by now.
          recordInitialBalanceSnapshot();
          api.requestWebglRender();
        } finally {
          TIME && console.timeEnd("generateEconomy");
        }
      }
    }
  });

  _gunpowderEraChangedHandler = () => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    refreshEconomyForGunpowderEra(api);
  };
  document.addEventListener("fmg:gunpowder-era-changed", _gunpowderEraChangedHandler);

  // Archives from before the Ore/Ingot split retain their old Good ids. Upgrade the
  // catalog after a full world replacement so market stock becomes Ore in place and
  // newly added Ingots/Cats begin at zero stock (no duplicated wealth).
  _worldLoadedHandler = () => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    clearStateFiscalReports();
    const migratedLegacyMetals = migrateLegacyOreIngotGoods();
    const migratedLiveCats = migrateLiveCatsGood();
    const migratedLiveDogs = migrateLiveDogsGood();
    const migratedGrapes = migrateGrapesGood();
    const migratedPerennialFruits = migratePerennialFruitGoods();
    const migratedRaisins = migrateRaisinsGood();
    const migratedStapleCrops = migrateStapleCropGoods();
    const migratedWineRecipe = migrateWineRecipe();
    const migratedSmeltingFuelAndAsh = migrateSmeltingFuelAndAshGoods();
    const migratedPomaceDistillation = migratePomaceDistillationGoods();
    const migratedFoodLots = migrateFoodProcessingLotContracts();
    const migratedFreshFoodTags = migrateFreshFoodTags();
    const migratedLiveAnimalTags = migrateLiveAnimalTags();
    Caravans.discardFreshCargo();
    Caravans.refreshLoadingPolicies();
    if (
      migratedLegacyMetals ||
      migratedLiveCats ||
      migratedLiveDogs ||
      migratedGrapes ||
      migratedPerennialFruits ||
      migratedRaisins ||
      migratedStapleCrops ||
      migratedWineRecipe ||
      migratedSmeltingFuelAndAsh ||
      migratedPomaceDistillation ||
      migratedFoodLots ||
      migratedFreshFoodTags ||
      migratedLiveAnimalTags
    ) {
      Goods.sync();
      Markets.initializeMarketPrices();
    }
    // Run after the crop migration so a loaded map immediately receives crop-specific climate,
    // soil, and field-output columns rather than waiting for its next annual tick.
    DevelopmentPotential.generate();
    if (!getSmelterOperations().length && getMineOperations().length) SmelterOperations.generate();
    if (!getTradeSecurityLedgers().length) TradeSecurity.generate();
    const migratedMetallurgTools = MetallurgWork.migrateLegacyToolsUnitScale();
    if (!getMetallurgAssetLedgers().length) {
      MetallurgWork.generate();
      MetallurgWork.settleMonthly();
    } else if (migratedMetallurgTools) {
      MetallurgWork.settleMonthly();
    }
    // Rebuild cull / escort boards when empty or only invalid targets remain after load.
    rebuildCullJobPostings();
    rebuildEscortJobPostings();
    // Balance History's first row for the just-loaded map (fresh-generation's counterpart lives
    // at the end of the "economy.initialization" map-ready task above).
    recordInitialBalanceSnapshot();
  };
  document.addEventListener("fmg:world-loaded", _worldLoadedHandler);

  // One Balance History row per completed Advance Day/Month/Year action — see
  // notifyAdvanceCompleted()'s doc-comment in src/generators/timeEngine.ts for why this event
  // (rather than the per-day `fmg:time-advanced`) is the right granularity.
  _timeAdvanceCompletedHandler = () => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    recordAdvanceBalanceSnapshot();
  };
  document.addEventListener("fmg:time-advance-completed", _timeAdvanceCompletedHandler);

  // Production-affecting changes are accumulated between monthly settlements. In
  // particular, Shipbuilding can emit a logging event every simulated day; making
  // each event run the full production/trade cycle turned Advance Year into up to
  // 365 complete economy recalculations. The flag is intentionally independent of
  // the settlement scheduler: a future tick hook may mark production dirty without
  // needing to know when the current cycle closes.
  //
  // Multi-day batches (Advance Year / rAF frame budget) can step many calendar
  // days before the scheduled microtask runs. Count how many monthly settlements
  // are owed so a single coalesced microtask still runs one produce/tax cycle per
  // due month instead of collapsing a whole year into one settle.
  let productionDirty = false;
  let productionSettlementsDue = 0;
  let productionSettlementScheduled = false;
  let foodSettlementsAlreadyApplied = 0;

  const markProductionDirty = () => {
    productionDirty = true;
  };

  const runOneProductionSettlement = (skipFoodConsumption = false) => {
    measureTickStep("production:settle", () => {
      const commit = api.dispatchExtensionCommand({
        extensionId: ECONOMY_EXTENSION_ID,
        name: "production.settle",
        payload: skipFoodConsumption ? { skipFoodConsumption: true } : undefined
      });
      if (!commit) return;
      if (api.layerIsOn("toggleGoods")) drawGoods(getDisplayedGoodIds());
    });
  };

  const scheduleProductionSettlement = () => {
    if (productionSettlementScheduled) return;
    productionSettlementScheduled = true;
    queueMicrotask(() => {
      productionSettlementScheduled = false;
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;

      // A periodic settlement must run even when no external producer marked the
      // economy dirty: it is what accrues ordinary rural/urban output and demand.
      // When only dirty (no monthly due), one settle is enough to absorb producer
      // changes; when N months are due, run N full produce/tax cycles.
      const dueSettlements = productionSettlementsDue;
      const times = Math.max(dueSettlements, productionDirty ? 1 : 0);
      const settlementsWithFoodAlreadyApplied = Math.min(dueSettlements, foodSettlementsAlreadyApplied);
      if (times === 0) return;
      productionSettlementsDue = 0;
      productionDirty = false;
      foodSettlementsAlreadyApplied -= settlementsWithFoodAlreadyApplied;

      for (let i = 0; i < times; i++) runOneProductionSettlement(i < settlementsWithFoodAlreadyApplied);
    });
  };

  // Core owns burg creation; the extension only enriches the newly created
  // settlement after it announces the completed promotion transaction.
  _settlementPromotedHandler = event => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID) || !isSettlementPromotionEvent(event)) return;

    const { cellId, burgId } = event.detail;
    const assignedGoodId = Goods.assignBiomeProduct(cellId);
    const burg = getWorldContext().pack.burgs[burgId];
    if (burg) burg.market = getMarketCellColumn()[cellId] || 0;

    // A changed bonus product and a new urban worker both affect the next
    // production cycle. One microtask coalesces every same-tick promotion.
    if (assignedGoodId !== null) Markets.invalidateRuralProductionCache();
    syncBurgMarketLedgers();
    synchronizePlayerCommerce();
    markProductionDirty();
    scheduleProductionSettlement();
  };
  document.addEventListener("fmg:settlement-promoted", _settlementPromotedHandler);

  _logHarvestedHandler = e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const { cellId, amount } = (e as CustomEvent).detail as { cellId: number; amount: number };
    if (registerLogHarvest(cellId, amount)) markProductionDirty();
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

  _shipbuildingShipGoodStockRequestHandler = e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (e as CustomEvent<unknown>).detail;
    if (!isShipbuildingShipGoodStockRequest(detail)) return;
    detail.result = Markets.getShipGoodStock(detail.marketId);
  };
  document.addEventListener("fmg:shipbuilding-ship-good-stock-request", _shipbuildingShipGoodStockRequestHandler);

  _shipbuildingSurplusShipRequestHandler = e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (e as CustomEvent<unknown>).detail;
    if (!isShipbuildingSurplusShipRequest(detail)) return;
    detail.result = Markets.addSurplusShipStock(detail.marketId, detail.shipClassId);
  };
  document.addEventListener("fmg:shipbuilding-surplus-ship-completed", _shipbuildingSurplusShipRequestHandler);

  _shipbuildingMerchantHullsSnapshotHandler = e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (e as CustomEvent<unknown>).detail;
    if (!isShipbuildingMerchantHullsSnapshot(detail)) return;
    MerchantTransportAssets.reconcileMerchantHulls(detail.hulls);
  };
  document.addEventListener("fmg:shipbuilding-merchant-hulls-snapshot", _shipbuildingMerchantHullsSnapshotHandler);

  _shipbuildingMerchantHullChangedHandler = e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (e as CustomEvent<unknown>).detail;
    if (!isShipbuildingMerchantHullsSnapshot({ hulls: [detail] })) return;
    MerchantTransportAssets.requestMerchantHullSnapshot();
  };
  document.addEventListener("fmg:shipbuilding-merchant-hull-changed", _shipbuildingMerchantHullChangedHandler);

  _shipbuildingMerchantHullsUnavailableHandler = () => MerchantTransportAssets.setWaterAssetModeActive(false);
  document.addEventListener(
    "fmg:shipbuilding-merchant-hulls-unavailable",
    _shipbuildingMerchantHullsUnavailableHandler
  );
  MerchantTransportAssets.requestMerchantHullSnapshot();

  // Shipbuilding only signals demand. Economy owns policy, payment, Deal, Caravan,
  // and delivery lifecycle after this extension boundary.
  _strategicProcurementDemandHandler = e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (e as CustomEvent<unknown>).detail;
    if (!isShipbuildingStrategicProcurementDemand(detail)) return;
    StrategicProcurement.handleShipbuildingDemand(detail);
  };
  document.addEventListener("fmg:shipbuilding-strategic-procurement-demand", _strategicProcurementDemandHandler);

  // New-map initial-stock warm-up only (§4.6). Unlike the reactive demand handler above, this
  // never spends treasury or spawns Caravans — it seeds market stock directly, once, from a
  // microtask Shipbuilding schedules right after this same fmg:generate-post-core pass generates
  // Goods/Markets/Production.
  _shipbuildingInitialStockRequestHandler = e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (e as CustomEvent<unknown>).detail;
    if (!isShipbuildingInitialStockRequest(detail)) return;
    seedShipbuildingInitialStock(detail.demands);
  };
  document.addEventListener("fmg:shipbuilding-initial-stock-request", _shipbuildingInitialStockRequestHandler);

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
  // if Shipbuilding is never enabled). Buffered in taxes-generator.ts and folded into treasury
  // via foldBufferedStateIncome() rather than written directly, since it must compose with
  // strategic-procurement expenses buffered the same way. This event fires once per ship hull
  // per tick (runVoyageTick in shipVoyages.ts), so a state with several hulls can queue several
  // of these microtasks for the same tick — foldBufferedStateIncome() only touches the buffered
  // voyage-income/procurement-expense maps and is safe to call repeatedly. Taxes.collectTaxes()
  // itself must NOT be called here: it also re-sums the current cycle's deal taxes and re-applies
  // poll tax / military upkeep in full, neither of which is idempotent between production cycles,
  // so calling it once per hull would double- (or N-times-) count those every tick.
  _voyageIncomeHandler = e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const { stateId, amount } = (e as CustomEvent).detail as { stateId: number; amount: number };
    if (!stateId || !(amount > 0)) return;
    registerVoyageIncome(stateId, amount);
    // Voyage income changes tax accounting, not production, so do not force an
    // expensive production/trade settlement just to expose it to the treasury.
    queueMicrotask(() => {
      if (api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) Taxes.foldBufferedStateIncome();
    });
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
  let currentQuarterIndex = 0;
  // Without this, mine reserves only ever go down (docs/plan/mineral-resource-circulation-fixes.md
  // Fix 2): roads/ports built during Advance Time never translate into newly accessible deposits
  // unless a user manually clicks the "Prospect mines" Tools action.
  let daysSinceLastProspecting = 0;
  const PROSPECTING_INTERVAL_DAYS = 365;
  // Phase: economy. Lexical id `economy.tick` runs before `shipbuilding.tick` in the
  // same phase so forest regrowth is ordered before logging within one tick.
  _unregisterTickSystem = api.registerSimulationSystem({
    id: "economy.tick",
    phase: "economy",
    // map.annotations / simulation.cells: cull resolve may mutate monsters, markers, danger
    // (docs/plan/player-threat-cull-jobs.md K18 / PR-3b).
    reads: [
      "map.politics",
      "map.annotations",
      "extension.economy",
      "simulation.burgs",
      "simulation.states",
      "simulation.cells"
    ],
    writes: [
      "extension.economy",
      "simulation.burgs",
      "simulation.states",
      "map.settlements",
      "simulation.cells",
      "map.annotations"
    ],
    cadence: { every: 1 },
    profileLabel: "economy",
    run: (context, writer) => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;

      const { years: deltaYears, months: deltaMonths, days: deltaDays } = context.delta;
      const effectiveDays = deltaDays + deltaMonths * 30 + deltaYears * 365;
      // Must run before updateAnnualAgriculture() so this year's Tools investment feeds
      // this year's yieldPerArea/farmLaborRequired recompute, not next year's
      // (docs/plan/rural-agtech-investment.md §3.5). Industrial tech runs right after so
      // mine/smelter investment claims each market's treasury only after farms have (§6.3).
      let agricultureRefreshed = false;
      measureTickStep("economy:annualAgTech", () => {
        AgTechInvestment.settleAnnual();
        IndustrialTechInvestment.settleAnnual();
        // Must run before the quarter's food ledger so annual demographic changes
        // alter cultivated area and farm labour without waiting an extra quarter.
        agricultureRefreshed = DevelopmentPotential.updateAnnualAgriculture();
        // Fauna population cohort update (docs/plan/biome-goods-producer-ecosystem.md §4, Phase 2):
        // its own once-per-year guard, independent of agriculture's — no-ops entirely when
        // options.ruralEcosystemDetail === "simplified" (§11.3).
        updateAnnualFaunaCohorts();
        // Only release this year's freshly recomputed migratableAdults surplus — running on a
        // tick where agriculture wasn't refreshed would re-read last year's (already-extracted) figures.
        // Options -> Simulation "Settlement growth" gate: "independent" keeps the classic
        // births-only-toward-own-capacity behavior with no deliberate rural→urban movement.
        if (agricultureRefreshed && useOptionsState.getState().ruralUrbanMigration === "megacity") {
          releaseRuralLaborSurplus(getWorldContext());
        }
      });

      measureTickStep("economy:caravans", () => {
        const caravanTick = measureTickStep("economy:caravanMovement", () => Caravans.tick(effectiveDays));
        measureTickStep("economy:retailInventory", () => tickRetailInventory());
        measureTickStep("economy:strategicProcurement", () =>
          StrategicProcurement.reconcileCaravans(caravanTick.arrived, caravanTick.lost)
        );
      });
      // Trade animation redraw is owned by registerDrawLayerHook after extension.economy
      // commits through RenderCoordinator (P2-12) — do not call draw* from the tick.

      measureTickStep("economy:warIntensity", () => {
        // Only conflicts that are currently progressing affect the wartime economy.
        const states = getWorldContext().pack.states;
        const statesAtWar = new Set<number>();
        if (states) {
          for (const state of states) {
            if (!state.removed && isStateInActiveConflict(state.i)) {
              statesAtWar.add(state.i);
            }
          }
        }

        // Update war duration and intensity for burgs; roll up supplyStrain onto states for manpower draft
        const ledgers = getBurgMarketLedgers();
        const burgs = getWorldContext().pack.burgs;
        const supplyByState = new Map<number, { sum: number; n: number }>();
        if (ledgers.length && burgs) {
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
      });

      const effectiveDeltaYears = deltaYears + deltaMonths / 12 + deltaDays / 365.2425;
      let settledAdultsFromMobility = 0;
      let urbanWaterChanged = false;
      let burgGroupsChanged = false;
      let cullTopics: readonly DataTopic[] = [];
      let escortTopics: readonly string[] = [];
      measureTickStep("economy:dailyHiringPregnancy", () => {
        // Pregnancy observability (PR-P1): age/conceive after demography in the same advanceTime.
        // When PR-P2 registers a birth-floor provider, tickUrbanPregnancy is a no-op (provider owns mutation).
        tickUrbanPregnancy(effectiveDeltaYears);
        // Construction hire-board lag + slow anonymous fills (job postings Phase 2).
        tickConstructionHiring(effectiveDays);
        // Threat cull / pest job board expiry + monthly top-up (PR-2).
        tickCullJobBoard(effectiveDays);
        // Cull hire lag / accept / combat resolve + ecology (PR-3b).
        cullTopics = tickCullHiring(effectiveDays, context.rng).topics;
        // Escort (護衛) board + hire resolve — all culture sets.
        tickEscortJobBoard(effectiveDays);
        escortTopics = tickEscortHiring(effectiveDays, context.rng).topics;
      });
      measureTickStep("economy:annualUrbanKnowledge", () => {
        const urbanMobility = UrbanLaborIntake.updateAnnualState(getWorldContext(), context.rng);
        settledAdultsFromMobility = urbanMobility?.settledAdults ?? 0;
        // Reuses UrbanLaborIntake's once-per-simulation-year gate (non-null only on the year
        // transition) so administration/mining/smelting employment reconciles annually, not
        // every economy tick.
        if (urbanMobility) {
          reconcileAnnualBasicEmploymentWorkers();
          // Must run after reconciliation, not before: it clamps effectiveCapacity from this
          // year's buildingStock (docs/plan/urban-construction-industry.md §3.3, decision §7.1-2b).
          ConstructionOperations.constrainEffectiveCapacity();
        }
        // Inn facilities use the same local builders and Wood/Stone/Brick market stock as
        // construction, but settle through their own non-dwelling work orders.
        InnFacilities.settleAnnual();
        // Cold-climate knowledge advances from accumulated local heating exposure before
        // health is recalculated, so new insulation/hearth techniques affect future fuel use
        // while this year's coal smoke remains visible in the civic health score.
        settleAnnualColdClimateKnowledge();
        // Urban water / sanitation: recompute demand vs capacity and write burg.sanitation.
        // Self-gates once per simulation year (docs/plan/urban-water-and-sanitation-system.md Phase 1).
        urbanWaterChanged = UrbanWater.settleAnnual();
        // Must run after reconcileAnnualBasicEmploymentWorkers(), not before: it reads this year's
        // freshly-reconciled SmelterOperation.workers headcount as the Metallurgy guild's
        // practitioner coverage (docs/plan/knowledge-guild-system.md §9 Phase 1). Self-gates to
        // once per simulation year regardless of how often this tick runs.
        GuildKnowledge.settleAnnual();
        GuildChapters.settleAnnual(context.rng);
        // Must run after GuildKnowledge above: reads this year's freshly-settled metallurgy
        // GuildKnowledgeStock for apprentice growth-rate/eligibility checks (docs/plan/
        // knowledge-guild-system.md §9 Phase 6). Self-gates to once per simulation year.
        // One-time working-capital + starter-material seed for every guild that got its first-ever
        // master this pass — otherwise a brand-new guild has no funding source but its own finished
        // goods clearing the market at a margin, which can stay permanently at 0 (unlike a Province
        // Lord, who always draws from their seated Burg regardless of any other pool).
        for (const { burgId, domain } of GuildSuccession.settleAnnual(probability => context.rng.P(probability))) {
          GuildTreasury.seedNewGuildWorkingCapital(burgId, domain);
        }
        // Same ordering requirement as GuildKnowledge above: reads this year's freshly-reconciled
        // AdministrationEmploymentRecord headcount as the law/administration academy's practitioner
        // coverage (docs/plan/knowledge-guild-system.md §9 Phase 3). Self-gates to once per
        // simulation year.
        AcademyKnowledge.settleAnnual();
        // Spends state.treasury before StateSecretKnowledge below sees it, deliberately
        // (docs/plan/great-library.md 年次フロー: "威信を火薬より先に請求"). No ordering dependency on
        // reconcileAnnualBasicEmploymentWorkers() — reads state.treasury/diplomacy/ruler directly.
        GreatLibrary.settleAnnual(context.rng);
        // No ordering dependency on reconcileAnnualBasicEmploymentWorkers() (unlike Guild/Academy
        // above) — it reads MilitaryResourceLedger and state.treasury, not a headcount reconciliation
        // output. Self-gates to once per simulation year (docs/plan/knowledge-guild-system.md §9 Phase 4).
        StateSecretKnowledge.settleAnnual();
        // Reads state.military directly (not a reconciled employment record), so no ordering
        // dependency either — self-gates to once per simulation year (docs/plan/
        // knowledge-guild-system.md §9 Phase 5).
        MartialDisciplineKnowledge.settleAnnual();
        // Builds on the freshly-settled State training stock, but only creates records for
        // named commanders; ordinary regiment members remain aggregate headcount.
        MartialIndividualMastery.settleAnnual();
        // No ordering dependency on the guild/academy settles above — sweeps burg.treasury surplus
        // into market/state treasury regardless of guild presence. Self-gates to once per simulation
        // year (docs/plan/burg-treasury-equilibrium.md §3.3).
        GuildTreasury.settleAnnual();
        burgGroupsChanged = DevelopmentPotential.updateAnnualBurgGroups();
      });

      measureTickStep("economy:forestProspect", () => {
        const forestChanged = tickForestRegrowth(effectiveDeltaYears, getForestRegrowthMultiplier);
        if (forestChanged) markProductionDirty();

        daysSinceLastProspecting += effectiveDays;
        if (daysSinceLastProspecting >= PROSPECTING_INTERVAL_DAYS) {
          daysSinceLastProspecting %= PROSPECTING_INTERVAL_DAYS;
          const result = MineOperations.prospect();
          if (result.discovered) SmelterOperations.generate();
        }
      });

      const monthsDue = Math.floor((daysSinceLastProduction + effectiveDays) / 30);
      const firstSettlementMonth = (((api.simulationContext.currentMonth - monthsDue) % 12) + 12) % 12;
      let elapsedDays = 0;
      let settledMonths = 0;
      let foodSettlementsThisTick = 0;
      measureTickStep("economy:foodCalendar", () => {
        while (elapsedDays < effectiveDays) {
          const daysUntilMonthlySettlement = 30 - daysSinceLastProduction;
          const step = Math.min(effectiveDays - elapsedDays, daysUntilMonthlySettlement);
          daysSinceLastProduction += step;
          elapsedDays += step;

          // On a shared boundary, households finish the month before the new
          // quarter's harvest arrives. This preserves the same order for Advance
          // Day, Month, and Year rather than overfilling storage first.
          if (daysSinceLastProduction >= 30) {
            daysSinceLastProduction -= 30;
            const settlementMonth = (firstSettlementMonth + settledMonths) % 12 || 12;
            settleMonthlyFoodConsumption(settlementMonth);
            FoodProduction.generateMonthlyLedger(settlementMonth);
            settledMonths++;
            foodSettlementsThisTick++;
            if (settlementMonth % 3 === 0) {
              currentQuarterIndex = (currentQuarterIndex + 1) % 4;
              // A quarterly import update may raise capacity above a construction
              // ceiling, so retain the existing post-harvest re-clamp.
              ConstructionOperations.constrainEffectiveCapacity();
              UrbanLaborIntake.raidBanditFood(getWorldContext(), context.rng);
              recordQuarterlyNonFoodDemand();
            }
          }
        }
      });

      if (settledMonths > 0) {
        productionSettlementsDue += settledMonths;
        foodSettlementsAlreadyApplied += foodSettlementsThisTick;
        // Queue after all synchronous simulation systems have run, so logging events from
        // Shipbuilding (same tick, economy phase after this system by lexical id) are included.
        scheduleProductionSettlement();
      }

      writer.markChanged("extension.economy", "simulation.states");
      if (burgGroupsChanged || settledAdultsFromMobility > 0 || urbanWaterChanged) {
        writer.markChanged("simulation.burgs", "map.settlements");
      }
      // Cull ecology topics (cells/annotations) — only when resolve actually mutated host data.
      if (cullTopics.length) {
        const hostTopics = cullTopics.filter(t => t === "simulation.cells" || t === "map.annotations");
        if (hostTopics.length) writer.markChanged(...hostTopics);
      }
      // Escort resolve already mutates extension.economy + simulation.states (marked above).
      void escortTopics;
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
  api.registerLayerElement("toggleMineralDeposits", () => document.getElementById("mineralDeposits"));

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
    const migratedLegacyMetals = migrateLegacyOreIngotGoods();
    const migratedLiveCats = migrateLiveCatsGood();
    const migratedLiveDogs = migrateLiveDogsGood();
    const migratedGrapes = migrateGrapesGood();
    const migratedPerennialFruits = migratePerennialFruitGoods();
    const migratedRaisins = migrateRaisinsGood();
    const migratedStapleCrops = migrateStapleCropGoods();
    const migratedWineRecipe = migrateWineRecipe();
    const migratedSmeltingFuelAndAsh = migrateSmeltingFuelAndAshGoods();
    const migratedPomaceDistillation = migratePomaceDistillationGoods();
    const migratedFoodLots = migrateFoodProcessingLotContracts();
    const migratedFreshFoodTags = migrateFreshFoodTags();
    const migratedLiveAnimalTags = migrateLiveAnimalTags();
    Caravans.discardFreshCargo();
    Caravans.refreshLoadingPolicies();
    if (
      migratedLegacyMetals ||
      migratedLiveCats ||
      migratedLiveDogs ||
      migratedGrapes ||
      migratedPerennialFruits ||
      migratedRaisins ||
      migratedStapleCrops ||
      migratedWineRecipe ||
      migratedSmeltingFuelAndAsh ||
      migratedPomaceDistillation ||
      migratedFoodLots ||
      migratedFreshFoodTags ||
      migratedLiveAnimalTags
    ) {
      Goods.sync();
      Markets.initializeMarketPrices();
    }
    if (!getSmelterOperations().length && getMineOperations().length) SmelterOperations.generate();
    if (getWorldContext().options.gunpowderEraEnabled === false) refreshEconomyForGunpowderEra(api);
    // Backfill sales/poll tax rates and recompute treasury for maps saved before this feature existed.
    // Both calls are idempotent/cheap, so re-running them on every load is safe.
    Taxes.defineTaxRates();
    Taxes.collectTaxes();
    if (!getMintLedgers().length && getMarkets().length) Minting.generate();
    if (!getMilitaryResourceLedgers().length && getMarkets().length) MilitaryResources.generate();
    if (!getTradeSecurityLedgers().length) TradeSecurity.generate();
    if (getMarkets().length) syncBurgMarketLedgers();
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

  // Redraw economy layers whenever the host calls drawLayers()
  api.registerDrawLayerHook(() => {
    // Trade animation restarts (route pathfinding + SVG/animation setup) on every
    // draw-layer pass, but during a bulk Advance Month/Year run that pass fires
    // once per rAF chunk (many simulated days), and the result is invisible
    // until the run ends anyway. Skip it mid-run; runTimeSimulation forces one
    // more draw-layer pass after the run stops/finishes so it resumes then
    // (see publishBulkRunFinishedRedraw in timeEngine.ts). Explicit user
    // toggles (registerLayerToggle above) always animate immediately.
    const isBulkTimeAdvanceRunning = useTimeSimulationState.getState().isRunning;

    if (api.viewContext.renderMode === "webglHybrid") {
      api.getSvgLayer("goods")?.style("display", "none");
      api.getSvgLayer("marketsLayerFill")?.style("display", "none");
      api.getSvgLayer("marketsLayer")?.style("display", "none");
      api.getSvgLayer("mineralDeposits")?.style("display", "none");
      api.requestWebglRender();
      if (api.layerIsOn("toggleTrade") && !isBulkTimeAdvanceRunning) TradeAnimation.start();
      return;
    }
    if (api.layerIsOn("toggleGoods")) drawGoods(getDisplayedGoodIds());
    if (api.layerIsOn("toggleMarketsLayer")) drawMarketsLayer();
    if (api.layerIsOn("toggleMineralDeposits")) drawMineralDeposits();
    if (api.layerIsOn("toggleTrade") && !isBulkTimeAdvanceRunning) TradeAnimation.start();
  });
}

export function cleanup(api: ExtensionAPI): void {
  _unregisterGoodsAssignCellCommand?.();
  _unregisterGoodsAssignCellCommand = null;
  _unregisterGoodsUpdateCommand?.();
  _unregisterGoodsUpdateCommand = null;
  _unregisterGoodsAddCommand?.();
  _unregisterGoodsAddCommand = null;
  _unregisterGoodsRemoveCommand?.();
  _unregisterGoodsRemoveCommand = null;
  _unregisterMarketAssignCellsCommand?.();
  _unregisterMarketAssignCellsCommand = null;
  _unregisterMarketAddCommand?.();
  _unregisterMarketAddCommand = null;
  _unregisterMarketRemoveCommand?.();
  _unregisterMarketRemoveCommand = null;
  _unregisterMarketColorCommand?.();
  _unregisterMarketColorCommand = null;
  _unregisterProductionSettlementCommand?.();
  _unregisterProductionSettlementCommand = null;
  _unregisterRegenerateCommand?.();
  _unregisterRegenerateCommand = null;
  _unregisterGunpowderRefreshCommand?.();
  _unregisterGunpowderRefreshCommand = null;
  _unregisterMineProspectingCommand?.();
  _unregisterMineProspectingCommand = null;
  _unregisterJobsApplyCommand?.();
  _unregisterJobsApplyCommand = null;
  _unregisterJobsResignCommand?.();
  _unregisterJobsResignCommand = null;
  _unregisterJobsCancelCommand?.();
  _unregisterJobsCancelCommand = null;
  _unregisterJobsApplyCullCommand?.();
  _unregisterJobsApplyCullCommand = null;
  _unregisterJobsResignCullCommand?.();
  _unregisterJobsResignCullCommand = null;
  _unregisterJobsCancelCullCommand?.();
  _unregisterJobsCancelCullCommand = null;
  _unregisterJobsApplyEscortCommand?.();
  _unregisterJobsApplyEscortCommand = null;
  _unregisterJobsResignEscortCommand?.();
  _unregisterJobsResignEscortCommand = null;
  _unregisterJobsCancelEscortCommand?.();
  _unregisterJobsCancelEscortCommand = null;
  _unregisterCommerceTradeCommand?.();
  _unregisterCommerceTradeCommand = null;
  _unregisterClearCommand?.();
  _unregisterClearCommand = null;
  _unregisterTickSystem?.();
  _unregisterTickSystem = null;
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  _unregisterMapReadyTask?.();
  _unregisterMapReadyTask = null;
  if (_logHarvestedHandler) {
    document.removeEventListener("fmg:shipbuilding-log-harvested", _logHarvestedHandler);
    _logHarvestedHandler = null;
  }
  if (_materialsRequestedHandler) {
    document.removeEventListener("fmg:shipbuilding-materials-requested", _materialsRequestedHandler);
    _materialsRequestedHandler = null;
  }
  if (_shipbuildingShipGoodStockRequestHandler) {
    document.removeEventListener("fmg:shipbuilding-ship-good-stock-request", _shipbuildingShipGoodStockRequestHandler);
    _shipbuildingShipGoodStockRequestHandler = null;
  }
  if (_shipbuildingSurplusShipRequestHandler) {
    document.removeEventListener("fmg:shipbuilding-surplus-ship-completed", _shipbuildingSurplusShipRequestHandler);
    _shipbuildingSurplusShipRequestHandler = null;
  }
  if (_shipbuildingMerchantHullsSnapshotHandler) {
    document.removeEventListener("fmg:shipbuilding-merchant-hulls-snapshot", _shipbuildingMerchantHullsSnapshotHandler);
    _shipbuildingMerchantHullsSnapshotHandler = null;
  }
  if (_shipbuildingMerchantHullChangedHandler) {
    document.removeEventListener("fmg:shipbuilding-merchant-hull-changed", _shipbuildingMerchantHullChangedHandler);
    _shipbuildingMerchantHullChangedHandler = null;
  }
  if (_shipbuildingMerchantHullsUnavailableHandler) {
    document.removeEventListener(
      "fmg:shipbuilding-merchant-hulls-unavailable",
      _shipbuildingMerchantHullsUnavailableHandler
    );
    _shipbuildingMerchantHullsUnavailableHandler = null;
  }
  if (_strategicProcurementDemandHandler) {
    document.removeEventListener("fmg:shipbuilding-strategic-procurement-demand", _strategicProcurementDemandHandler);
    _strategicProcurementDemandHandler = null;
  }
  if (_shipbuildingInitialStockRequestHandler) {
    document.removeEventListener("fmg:shipbuilding-initial-stock-request", _shipbuildingInitialStockRequestHandler);
    _shipbuildingInitialStockRequestHandler = null;
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
  if (_worldLoadedHandler) {
    document.removeEventListener("fmg:world-loaded", _worldLoadedHandler);
    _worldLoadedHandler = null;
  }
  if (_timeAdvanceCompletedHandler) {
    document.removeEventListener("fmg:time-advance-completed", _timeAdvanceCompletedHandler);
    _timeAdvanceCompletedHandler = null;
  }
  if (_settlementPromotedHandler) {
    document.removeEventListener("fmg:settlement-promoted", _settlementPromotedHandler);
    _settlementPromotedHandler = null;
  }
  clearVoyageIncome();
  clearStrategicProcurementExpenses();
  clearTreasuryAllocationSnapshots();
  clearLiveAnimalCatchAccumulators();
  clearFaunaPopulation();
  clearViticultureAllocationShares();
  resetEffectiveCapacities(getWorldContext().pack.burgs);
  StrategicProcurement.clear();
  clearBurgMarketLedgers();
  clearMarketManagers();
  clearMarketMerchantPortfolios();
  clearRetailInventory();
  clearPlayerMarketCommerce();

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
  clearUrbanPregnancyBirthFloorRegistration();

  // Unregister tool action handlers
  api.unregisterToolAction("editGoods");
  api.unregisterToolAction("overviewMarketsButton");
  api.unregisterToolAction("editTradeAnimationButton");
  api.unregisterToolAction("burgProductionOverview");
  api.unregisterToolAction("employmentOverviewButton");
  api.unregisterToolAction("guildOverviewButton");
  api.unregisterToolAction("metallurgWorkOverviewButton");
  api.unregisterToolAction("militarySuppliesOverviewButton");
  api.unregisterToolAction("mineralOverviewButton");
  api.unregisterToolAction("treasuryOverviewButton");
  api.unregisterToolAction("greatLibraryOverviewButton");
  api.unregisterToolAction("balanceHistoryButton");
  api.unregisterToolAction("debtNegotiationButton");
  api.unregisterToolAction("councilSessionButton");
  api.unregisterToolAction("domainPollDetailButton");

  api.unregisterExtension(ECONOMY_EXTENSION_ID);
  clearEconomyContext();
}
