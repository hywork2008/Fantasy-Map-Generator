import type { DataTopic } from "../../runtime/worldRuntime";
import type { ExtensionAPI } from "../../types/extension-api";
import type { Point } from "../hostCore";
import { isFastAdvanceActive, isStateInActiveConflict, resolveFastAdvanceRates, useOptionsState } from "../hostCore";
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
  ANNUAL_GATE,
  clearAnnualGateYear,
  clearEconomyContext,
  getBurgMarketLedgers,
  getCaravans,
  getDistantRealms,
  getGoodCellColumn,
  getGoods,
  getMarketCellColumn,
  getMarkets,
  getMerchantOrganizations,
  getMerchantVesselOwnerships,
  getMetallurgAssetLedgers,
  getMilitaryResourceLedgers,
  getMineOperations,
  getMintLedgers,
  getSmelterOperations,
  getTradeSecurityLedgers,
  getWorldContext,
  initEconomyContext,
  migrateLegacyAnnualGateYears,
  setBurgMarketLedgers,
  setCaravans,
  setDeals,
  setGoodCellColumn,
  setGoods,
  setGreatLibraryNextId,
  setGreatLibraryProjects,
  setGuildChapters,
  setIndividualSkills,
  setMarketCellColumn,
  setMarkets,
  setSmithingWorkshopLedgers
} from "./economyContext";
import { AcademyKnowledge } from "./generators/academyKnowledge";
import { AcidPlants } from "./generators/acidPlants";
import { AgTechInvestment } from "./generators/agTechInvestment";
import { ApothecaryWorkshops } from "./generators/apothecaryWorkshops";
import { reconcileAnnualBasicEmploymentWorkers } from "./generators/basicEmployment";
import { getBurgEmploymentComposition } from "./generators/burgEmploymentComposition";
import { clearBurgMarketLedgers, syncBurgMarketLedgers } from "./generators/burgMarketLedgers";
import { Caravans } from "./generators/caravans";
import { settleChemMedPracticeDecay } from "./generators/chemMedPractice";
import { ChlorAlkaliPlants } from "./generators/chlorAlkaliPlants";
import { ChlorinePlants } from "./generators/chlorinePlants";
import { ClimateDisasters } from "./generators/climateDisasters";
import { ColdStorageDepots } from "./generators/coldStorageDepots";
import { ConstructionOperations } from "./generators/constructionEmployment";
import {
  applyCharacterToConstructionJob,
  cancelConstructionApplication,
  clearConstructionHireState,
  resignConstructionJob,
  tickConstructionHiring
} from "./generators/constructionHire";
import { DamSites } from "./generators/damSites";
import { Dams } from "./generators/dams";
import { DevelopmentPotential } from "./generators/developmentPotential";
import { ElectrolysisPlants } from "./generators/electrolysisPlants";
import {
  applyCharacterToEscortJob,
  cancelEscortApplication,
  clearEscortHiringSession,
  resignEscortJob,
  tickEscortHiring
} from "./generators/escortHire";
import { clearEscortHireState, rebuildEscortJobPostings, tickEscortJobBoard } from "./generators/escortJobPostings";
import { ExperimentalWorkshops } from "./generators/experimentalWorkshops";
import { ExportStaging } from "./generators/exportStaging";
import { applyFastForwardEconomySettlement } from "./generators/fastAdvanceEconomy";
import { setFastForwardTickActive } from "./generators/fastAdvanceEconomyGuard";
import {
  clearFaunaPopulation,
  recordQuarterlyNonFoodDemand,
  updateAnnualFaunaCohorts
} from "./generators/faunaPopulation";
import { FertilizerInvestment } from "./generators/fertilizerInvestment";
import { resetEffectiveCapacities } from "./generators/foodImportNetwork";
import { settleMonthlyFoodConsumption } from "./generators/foodLedgerConsumption";
import { FoodProduction } from "./generators/foodProduction";
import { registerLogHarvest, tickForestRegrowth } from "./generators/forestStock";
import { GasPowerStations } from "./generators/gasPowerStations";
import {
  type Good,
  Goods,
  getDefaultGoodTradeProfile,
  isGoodEnabled,
  migrateAlloySteelGoods,
  migrateChemMedGoods,
  migrateElectricalGoods,
  migrateElectrolyticIndustryGoods,
  migrateFoodProcessingLotContracts,
  migrateFreshFoodTags,
  migrateGrapesGood,
  migrateIndustrialSteamGoods,
  migrateLegacyOreIngotGoods,
  migrateLiveAnimalTags,
  migrateLiveCatsGood,
  migrateLiveDogsGood,
  migrateMercuryChainGoods,
  migrateNaturalGasChainGoods,
  migratePerennialFruitGoods,
  migratePetroleumChainGoods,
  migratePhosphateGoods,
  migratePomaceDistillationGoods,
  migrateRaisinsGood,
  migrateSmeltingFuelAndAshGoods,
  migrateStapleCropGoods,
  migrateSyntheticAmmoniaGoods,
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
import { HospitalInstallations } from "./generators/hospitalInstallations";
import type { IncrementalBatchOptions } from "./generators/incrementalBatching";
import { IndustrialTechInvestment } from "./generators/industrialTechInvestment";
import { InnFacilities } from "./generators/innFacilities";
import { InnStays } from "./generators/innStays";
import { LeveeSites } from "./generators/leveeSites";
import { Levees } from "./generators/levees";
import { clearLiveAnimalCatchAccumulators } from "./generators/liveAnimalCatch";
import { LNGPlants } from "./generators/lngPlants";
import { clearFlowDiagnostics } from "./generators/marketFlowDiagnostics";
import { clearMarketManagers, syncMarketManagers } from "./generators/marketManagers";
import { Markets } from "./generators/markets-generator";
import { MartialDisciplineKnowledge } from "./generators/martialDisciplineKnowledge";
import { MartialIndividualMastery } from "./generators/martialIndividualMastery";
import { clearMerchantOrganizations } from "./generators/merchantOrganizations";
import { clearMarketMerchantPortfolios, syncMarketMerchantPortfolios } from "./generators/merchantPortfolios";
import { MerchantTransportAssets } from "./generators/merchantTransportAssets";
import { MercuryPlants } from "./generators/mercuryPlants";
import { MetallurgWork } from "./generators/metallurgWork";
import { MilitaryResources } from "./generators/militaryResources";
import { MineOperations } from "./generators/mineOperations";
import { MineralResources } from "./generators/mineralResources";
import { Minting } from "./generators/minting";
import { getStateMountedCapacity } from "./generators/mountAvailability";
import { NitrogenFertilizerInvestment } from "./generators/nitrogenFertilizerInvestment";
import { OilRefineryPlants } from "./generators/oilRefineryPlants";
import { OverseasRelations } from "./generators/overseasRelations";
import { PhosphateFertilizerPlants } from "./generators/phosphateFertilizerPlants";
import { clearPlayerMarketCommerce, executePlayerMarketTrade } from "./generators/playerCommerce";
import { PotashFertilizerInvestment } from "./generators/potashFertilizerInvestment";
import { PowerGridInvestment } from "./generators/powerGridInvestment";
import { PowerStations } from "./generators/powerStations";
import { Production } from "./generators/production-generator";
import { clearPublicWorksSettlements, PublicWorks } from "./generators/publicWorks";
import { QuarryOperations } from "./generators/quarryOperations";
import { RegionalWaterAuthority } from "./generators/regionalWaterAuthority";
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
import { SteamIndustry } from "./generators/steamIndustry";
import { SteelConverters } from "./generators/steelConverters";
import { StrategicProcurement } from "./generators/strategicProcurement";
import { SyntheticAmmoniaPlants } from "./generators/syntheticAmmoniaPlants";
import {
  clearStrategicProcurementExpenses,
  clearVoyageIncome,
  registerVoyageIncome,
  Taxes
} from "./generators/taxes-generator";
import {
  cancelInstructMission,
  decayInstructionResidues,
  dropExpiredHints,
  startCopyNotes,
  startInstructMission,
  tickInstructMissions
} from "./generators/technologyInstruct";
import { fuelTrial, fundWorkshop, hireResearchers } from "./generators/technologyPatronage";
import {
  applyCharacterToResearchJob,
  cancelResearchApplication,
  clearResearchHireState,
  type ResearchPlayerHireRole,
  resignResearchJob,
  tickResearchHiring
} from "./generators/technologyResearchHire";
import { TelegraphLines } from "./generators/telegraphLines";
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
import { reconcileUrbanCapacityFromFood } from "./generators/urbanFoodCapacity";
import { UrbanLaborIntake } from "./generators/urbanLaborIntake";
import {
  clearUrbanPregnancy,
  clearUrbanPregnancyBirthFloorRegistration,
  registerUrbanPregnancyBirthFloor,
  tickUrbanPregnancy,
  unregisterUrbanPregnancyBirthFloor
} from "./generators/urbanPregnancy";
import { getUrbanWaterSystemForBurg, sanitationScoreFromSystem, UrbanWater } from "./generators/urbanWaterSystem";
import { clearMerchantHullOwnerships, recordMerchantHullOwnership } from "./generators/vesselOwnership";
import { clearViticultureAllocationShares } from "./generators/viticultureAllocation";
import { VolcanicOperations } from "./generators/volcanicOperations";
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
import { getDisplayedGoodIds, resetDisplayedGoodSelection } from "./store/goodsDisplaySelection";
import { ECONOMY_TICK_SYSTEM_IDS, ECONOMY_TICK_TOPIC_CONTRACTS, type EconomyTickSystemId } from "./tickSystemIds";
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
import { TradeDetailsDialog } from "./ui/dialogs/TradeDetailsDialog";
import { TreasuryOverviewDialog } from "./ui/dialogs/TreasuryOverviewDialog";

function withRegenerateConfirmation(featureName: string, _id: string, onConfirm: () => void) {
  if (useUiPreferencesState.getState().dontAskRegenerateFeature) return onConfirm();

  regenerateFeatureDialogStore.getState().open({ featureName, onConfirm });
}

export const ECONOMY_EXTENSION_ID = "economy";
const economyWebglLayerSpec = createEconomyWebglLayerSpec();

/**
 * Goods-catalog migrations replayed on every map load, oldest first.
 *
 * Each entry returns true when it actually rewrote something; if any did, the caller re-syncs
 * Goods and re-prices markets once. They run unconditionally rather than against a saved schema
 * version because each is individually idempotent and cheap on an already-migrated map — a
 * version gate is the eventual improvement, but it needs a stored version these maps do not
 * carry yet. Order matters where one migration's output is another's input (the metals chain
 * before the smelting fuel/ash split, the crop goods before the fresh-food tags).
 *
 * Registry form is deliberate: the previous shape declared one `const migratedX` per migration
 * and OR-ed all of them in a 21-term condition, so adding a migration meant editing three places
 * and forgetting the third silently skipped the re-sync.
 * docs/plan/economy-coupling-audit.md T5.
 */
const GOODS_CATALOG_MIGRATIONS: readonly (() => boolean)[] = [
  migrateLegacyOreIngotGoods,
  migrateLiveCatsGood,
  migrateLiveDogsGood,
  migrateIndustrialSteamGoods,
  migrateChemMedGoods,
  migratePhosphateGoods,
  migrateSyntheticAmmoniaGoods,
  migrateElectricalGoods,
  migrateElectrolyticIndustryGoods,
  migrateAlloySteelGoods,
  migrateMercuryChainGoods,
  migratePetroleumChainGoods,
  migrateNaturalGasChainGoods,
  migrateGrapesGood,
  migratePerennialFruitGoods,
  migrateRaisinsGood,
  migrateStapleCropGoods,
  migrateWineRecipe,
  migrateSmeltingFuelAndAshGoods,
  migratePomaceDistillationGoods,
  migrateFoodProcessingLotContracts,
  migrateFreshFoodTags,
  migrateLiveAnimalTags
];

/**
 * Runs every goods-catalog migration in order and reports whether any changed the catalog.
 * Never short-circuits: a later migration may still have work to do after an earlier one
 * already returned true.
 */
function runGoodsCatalogMigrations(): boolean {
  let changed = false;
  for (const migrate of GOODS_CATALOG_MIGRATIONS) {
    if (migrate()) changed = true;
  }
  return changed;
}

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
let _mountedCapacityRequestHandler: ((e: Event) => void) | null = null;
let _merchantOperatorSnapshotRequestHandler: ((e: Event) => void) | null = null;
let _caravanCargoSnapshotRequestHandler: ((e: Event) => void) | null = null;
let _shipCompletedOwnershipHandler: ((e: Event) => void) | null = null;
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
let _unregisterProductionSettlementFastForwardCommand: (() => void) | null = null;
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
let _unregisterJobsApplyResearchCommand: (() => void) | null = null;
let _unregisterJobsResignResearchCommand: (() => void) | null = null;
let _unregisterJobsCancelResearchCommand: (() => void) | null = null;
let _unregisterJobsInstructCommand: (() => void) | null = null;
let _unregisterJobsCancelInstructCommand: (() => void) | null = null;
let _unregisterJobsCopyNotesCommand: (() => void) | null = null;
let _unregisterPatronageFundCommand: (() => void) | null = null;
let _unregisterPatronageHireCommand: (() => void) | null = null;
let _unregisterPatronageFuelCommand: (() => void) | null = null;
let _unregisterCommerceTradeCommand: (() => void) | null = null;
const _unregisterTickSystems: (() => void)[] = [];
let _unregisterMarketTerritorySystem: (() => void) | null = null;

function isMountedCapacityRequest(value: unknown): value is { stateId: number; capacity?: number; handled: boolean } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.stateId === "number" && typeof record.handled === "boolean";
}

function isMerchantOperatorSnapshotRequest(value: unknown): value is {
  hulls: { id: number; burgId: number }[];
  result?: Record<number, { ownerLabel: string; organizationName?: string; merchantNames: string[] }>;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.hulls) &&
    record.hulls.every(
      hull =>
        typeof hull === "object" &&
        hull !== null &&
        typeof (hull as Record<string, unknown>).id === "number" &&
        typeof (hull as Record<string, unknown>).burgId === "number"
    )
  );
}

function isShipCompletedEvent(value: unknown): value is { hullId: number; burgId: number; owner: "state" | "market" } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.hullId === "number" &&
    typeof record.burgId === "number" &&
    (record.owner === "state" || record.owner === "market")
  );
}

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

function isFastForwardSettlementPayload(value: unknown): value is { readonly monthsElapsed: number } {
  const monthsElapsed = (value as { monthsElapsed?: unknown } | null)?.monthsElapsed;
  return typeof monthsElapsed === "number" && Number.isFinite(monthsElapsed) && monthsElapsed > 0;
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
  // Fast-Forward's replacement for "production.settle" (docs/plan/advance-time-fast-forward.md
  // §4.3(b), §4.5) — dispatched instead of the real command by runOneFastForwardSettlement() above
  // when the due settlements being flushed were accrued during a Fast-Forward-eligible batch.
  // Deliberately does not call Production.produce()/MetallurgWork.*/Taxes.collectTaxes() etc. — it
  // replaces the whole pipeline with a flat annual rate (applyFastForwardEconomySettlement), not
  // just the tax step. refreshStateEconomySummaries()/synchronizePlayerCommerce() still run for
  // real so Overview dialogs reflect the new treasury/stock (§4.6).
  _unregisterProductionSettlementFastForwardCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "production.settleFastForward",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to fast-forward production");
      }
      const monthsElapsed = isFastForwardSettlementPayload(value) ? value.monthsElapsed : 1;
      measureTickStep("production:produce", () =>
        applyFastForwardEconomySettlement(monthsElapsed, resolveFastAdvanceRates(), api.appServices.rng)
      );
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
        // Same "one-time deterministic geography scan" shape as MineralResources; no dedicated
        // regenerate target exists for river siting, so it rides along with "minerals".
        // docs/plan/dam-flood-control-and-hydropower.md §3.
        DamSites.generate();
        Dams.clear(); // Discard Dams built on the old site ids before they're regenerated.
        // Same rationale as DamSites (docs/plan/river-levee-and-flood-damage.md §3.2).
        LeveeSites.generate();
        Levees.clear(); // Discard Levees built on the old site ids before they're regenerated.
      }
      if (value.target === "economy" || value.target === "markets") {
        Markets.generate(true);
        SaltLogistics.generate();
      }
      if (value.target === "economy") {
        InnFacilities.generate();
        InnStays.clear();
        UrbanWater.generate();
        // Phase 3 (docs/plan/modern-urban-water-treatment-and-governance.md §9, §14): no scheme
        // survives a regenerate, same as UrbanWater.generate() just above.
        RegionalWaterAuthority.generate();
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
      if (value.target === "economy") OverseasRelations.generate();
      if (value.target === "economy") Taxes.defineTaxRates();
      if (value.target === "economy" || value.target === "production") {
        FoodProduction.seedFoodLedgerBootstrap();
        Production.produce();
        reconcileAnnualBasicEmploymentWorkers({ initial: true });
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

      const reanchoredOperations = MineOperations.reanchorOperations();
      const result = MineOperations.prospect();
      if (result.discovered || reanchoredOperations) SmelterOperations.generate();
      return {
        changed: result.discovered > 0 || result.upgraded > 0 || reanchoredOperations > 0,
        result
      };
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
  _unregisterJobsApplyResearchCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "jobs.applyResearch",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to apply for research work");
      }
      const payload = value as
        | { characterId?: number; burgId?: number; role?: ResearchPlayerHireRole; mineOperationId?: number }
        | undefined;
      if (!payload?.characterId || !payload?.burgId || !payload?.role) {
        throw new Error("jobs.applyResearch requires { characterId, burgId, role }");
      }
      const result = applyCharacterToResearchJob({
        characterId: payload.characterId,
        burgId: payload.burgId,
        role: payload.role,
        mineOperationId: payload.mineOperationId
      });
      return { changed: result.ok, result };
    }
  });
  _unregisterJobsResignResearchCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "jobs.resignResearch",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to resign research work");
      }
      const payload = value as { characterId?: number } | undefined;
      if (!payload?.characterId) throw new Error("jobs.resignResearch requires { characterId }");
      const result = resignResearchJob(payload.characterId);
      return { changed: result.ok, result };
    }
  });
  _unregisterJobsCancelResearchCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "jobs.cancelResearchApplication",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to cancel a research application");
      }
      const payload = value as { characterId?: number } | undefined;
      if (!payload?.characterId) throw new Error("jobs.cancelResearchApplication requires { characterId }");
      const result = cancelResearchApplication(payload.characterId);
      return { changed: result.ok, result };
    }
  });
  _unregisterJobsInstructCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "jobs.instruct",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to teach");
      }
      const payload = value as { characterId?: number; burgId?: number; technologyIds?: string[] } | undefined;
      if (!payload?.characterId || !payload?.burgId || !payload.technologyIds) {
        throw new Error("jobs.instruct requires { characterId, burgId, technologyIds }");
      }
      const result = startInstructMission({
        characterId: payload.characterId,
        burgId: payload.burgId,
        technologyIds: payload.technologyIds
      });
      return { changed: result.ok, result };
    }
  });
  _unregisterJobsCancelInstructCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "jobs.cancelInstruct",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to cancel teaching");
      }
      const payload = value as { characterId?: number } | undefined;
      if (!payload?.characterId) throw new Error("jobs.cancelInstruct requires { characterId }");
      const result = cancelInstructMission(payload.characterId);
      return { changed: result.ok, result };
    }
  });
  _unregisterJobsCopyNotesCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "jobs.copyNotes",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to copy notes");
      }
      const payload = value as { characterId?: number; burgId?: number; technologyId?: string } | undefined;
      if (!payload?.characterId || !payload?.burgId || !payload.technologyId) {
        throw new Error("jobs.copyNotes requires { characterId, burgId, technologyId }");
      }
      const result = startCopyNotes({
        characterId: payload.characterId,
        burgId: payload.burgId,
        technologyId: payload.technologyId
      });
      return { changed: result.ok, result };
    }
  });
  _unregisterPatronageFundCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "patronage.fundWorkshop",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to fund a workshop");
      }
      const payload = value as { characterId?: number; burgId?: number; amount?: number } | undefined;
      if (!payload?.characterId || !payload?.burgId) {
        throw new Error("patronage.fundWorkshop requires { characterId, burgId }");
      }
      const result = fundWorkshop({
        characterId: payload.characterId,
        burgId: payload.burgId,
        amount: payload.amount
      });
      return { changed: result.ok, result };
    }
  });
  _unregisterPatronageHireCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "patronage.hireResearchers",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to hire researchers");
      }
      const payload = value as { characterId?: number; burgId?: number; count?: number } | undefined;
      if (!payload?.characterId || !payload?.burgId) {
        throw new Error("patronage.hireResearchers requires { characterId, burgId }");
      }
      const result = hireResearchers({
        characterId: payload.characterId,
        burgId: payload.burgId,
        count: payload.count
      });
      return { changed: result.ok, result };
    }
  });
  _unregisterPatronageFuelCommand = api.registerExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "patronage.fuelTrial",
    execute: value => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
        throw new Error("Economy must be enabled to fuel a trial");
      }
      const payload = value as { characterId?: number; mineOperationId?: number } | undefined;
      if (!payload?.characterId || !payload?.mineOperationId) {
        throw new Error("patronage.fuelTrial requires { characterId, mineOperationId }");
      }
      const result = fuelTrial({
        characterId: payload.characterId,
        mineOperationId: payload.mineOperationId
      });
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
      RegionalWaterAuthority.clear();
      clearConstructionHireState();
      clearCullHireState();
      clearCullHiringSession();
      clearEscortHireState();
      clearEscortHiringSession();
      clearResearchHireState();
      clearUrbanPregnancy();
      MineralResources.clear();
      DamSites.clear();
      Dams.clear();
      LeveeSites.clear();
      Levees.clear();
      Minting.clear();
      MilitaryResources.clear();
      TradeSecurity.clear();
      OverseasRelations.clear();
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
      clearMerchantHullOwnerships();
      if (world.pack.cells?.i) {
        setGoodCellColumn(new Uint16Array(world.pack.cells.i.length));
        setMarketCellColumn(new Uint16Array(world.pack.cells.i.length));
      }
      clearLiveAnimalCatchAccumulators();
      clearFaunaPopulation();
      clearViticultureAllocationShares();
      clearStrategicProcurementExpenses();
      clearTreasuryAllocationSnapshots();
      clearPublicWorksSettlements();
      StrategicProcurement.clear();
      setGuildChapters([]);
      clearAnnualGateYear(ANNUAL_GATE.guildChapters);
      setGreatLibraryProjects([]);
      clearAnnualGateYear(ANNUAL_GATE.greatLibrary);
      setGreatLibraryNextId(1);
      setIndividualSkills([]);
      setSmithingWorkshopLedgers([]);
      MetallurgWork.clear();
      return { changed: true };
    }
  });
}

/**
 * Sends only State military Metallurg material gaps to public procurement. Burg tool shortages
 * remain local: they must not consume State funds or flood the procurement queue.
 */
function requestMetallurgMaterials(): void {
  const burgs = getWorldContext().pack.burgs;
  const marketsById = new Map(getMarkets().map(market => [market.i, market]));
  const materialDemands = MetallurgWork.getStateMaterialForecasts().flatMap(forecast => {
    if (!(forecast.projectedShortage > 0)) return [];
    const market = marketsById.get(forecast.marketId);
    const stateId = market ? burgs[market.centerBurgId]?.state : undefined;
    if (!stateId) return [];
    return [
      {
        stateId,
        destinationMarketId: forecast.marketId,
        goodId: forecast.goodId,
        requestedUnits: forecast.projectedShortage
      }
    ];
  });
  // Smelters run before Burg manufacturing in the next production cycle. Give their local markets
  // a Charcoal reserve now, so State military Ingot demand can pull Ore through the refinery rather
  // than waiting forever for a finished Ingot route from a fuel-starved mining district.
  const smelterFuelDemands = SmelterOperations.getStateMilitaryFuelDemands(
    materialDemands.map(demand => ({
      stateId: demand.stateId,
      ingotGoodId: demand.goodId,
      requestedIngotUnits: demand.requestedUnits
    }))
  );
  const demands = [...materialDemands, ...smelterFuelDemands];
  StrategicProcurement.pruneBlockedMetallurgOrders(demands);
  for (const demand of demands) {
    StrategicProcurement.handleMetallurgMaterialDemand(demand);
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

/**
 * The Economy extension owns the hidden deposit list. It exposes discoveries to
 * the host only as survey events, so Frontier can prefer the resulting route
 * without learning every undiscovered deposit on the map.
 */
function runStateProspecting(api: ExtensionAPI, random: () => number): number {
  const world = getWorldContext();
  const { states } = world.pack;
  const frontierMode = world.options.initialSettlementPattern === "frontier";
  const frontier = api.simulationContext.frontier;
  const statesById = new Map((states ?? []).filter(state => state?.i).map(state => [state.i, state]));
  let discoveries = 0;
  for (const state of states ?? []) {
    if (!state?.i || state.removed) continue;
    // In Frontier mode, surveying is an expedition's reconnaissance phase,
    // not an independent annual map reveal. One unresolved mineral objective
    // or one active colony absorbs the State's expeditionary capacity until it
    // is incorporated or abandoned.
    if (frontierMode && !canStateStartFrontierSurvey(frontier, state.i)) continue;
    const rulerId = getStateRulerId(state);
    const geography = rulerId === undefined ? 0 : api.getEffectiveSkill(rulerId, "geography");
    const engineering = rulerId === undefined ? 0 : api.getEffectiveSkill(rulerId, "engineering");
    const rivalExpertise = Math.max(
      0,
      ...(state.neighbors ?? []).map(neighborId => {
        const neighbor = statesById.get(neighborId);
        const neighborRulerId = neighbor ? getStateRulerId(neighbor) : undefined;
        if (neighborRulerId === undefined) return 0;
        return (
          (api.getEffectiveSkill(neighborRulerId, "geography") +
            api.getEffectiveSkill(neighborRulerId, "engineering")) /
          2
        );
      })
    );
    const result = MineOperations.prospectForState({
      stateId: state.i,
      geography,
      engineering,
      surveyAdvantage: (geography + engineering) / 2 - rivalExpertise,
      random
    });
    if (!result.discovered || result.cellId === undefined || result.commodity === undefined) continue;
    discoveries++;
    if (frontierMode) {
      document.dispatchEvent(
        new CustomEvent("fmg:frontier-resource-discovered", {
          detail: {
            stateId: state.i,
            cellId: result.cellId,
            commodity: result.commodity,
            discoveredYear: api.simulationContext.currentYear
          }
        })
      );
    }
  }
  return discoveries;
}

function canStateStartFrontierSurvey(
  frontier: ExtensionAPI["simulationContext"]["frontier"],
  stateId: number
): boolean {
  const hasActiveProject = Object.values(frontier.projects).some(project => project.stateId === stateId);
  if (hasActiveProject) return false;
  return !Object.values(frontier.resourceClaimsByCell).some(
    claim => claim.stateId === stateId && claim.status !== "secured"
  );
}

function getStateRulerId(state: unknown): number | undefined {
  if (!state || typeof state !== "object") return undefined;
  const rulerId = (state as Record<string, unknown>).rulerId;
  return typeof rulerId === "number" && Number.isInteger(rulerId) && rulerId > 0 ? rulerId : undefined;
}

export function init(api: ExtensionAPI): void {
  initEconomyContext(api);
  const economySlice = api.simulationContext?.extensions?.economy;
  if (economySlice) migrateLegacyAnnualGateYears(economySlice);
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

  _mountedCapacityRequestHandler = event => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (event as CustomEvent<unknown>).detail;
    if (!isMountedCapacityRequest(detail)) return;
    const capacity = getStateMountedCapacity(detail.stateId);
    if (capacity === undefined) return;
    detail.capacity = capacity;
    detail.handled = true;
  };
  document.addEventListener("fmg:economy-mounted-capacity-request", _mountedCapacityRequestHandler);

  _merchantOperatorSnapshotRequestHandler = event => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (event as CustomEvent<unknown>).detail;
    if (!isMerchantOperatorSnapshotRequest(detail)) return;
    const { pack } = getWorldContext();
    const marketByBurgId = new Map(getMarkets().map(market => [market.centerBurgId, market]));
    const organizationByMarketId = new Map(
      getMerchantOrganizations().map(organization => [organization.homeMarketId, organization])
    );
    const ledgerByBurgId = new Map(getBurgMarketLedgers().map(ledger => [ledger.burgId, ledger]));
    const charactersById = new Map((pack.characters ?? []).map(character => [character.i, character]));
    const ownershipByHullId = new Map(
      getMerchantVesselOwnerships().map(ownership => [ownership.shipHullId, ownership])
    );
    const result: Record<number, { ownerLabel: string; organizationName?: string; merchantNames: string[] }> = {};

    for (const hull of detail.hulls) {
      const burgId = hull.burgId;
      const market = marketByBurgId.get(burgId);
      const organization = market ? organizationByMarketId.get(market.i) : undefined;
      const merchantNames = (ledgerByBurgId.get(burgId)?.merchants ?? [])
        .toSorted((left, right) => right.share - left.share)
        .map(merchant => charactersById.get(merchant.characterId)?.name)
        .filter((name): name is string => Boolean(name));
      const ownership = ownershipByHullId.get(hull.id);
      const ownerLabel =
        ownership?.ownerKind === "merchantOrganization"
          ? (getMerchantOrganizations().find(candidate => candidate.i === ownership.ownerId)?.name ??
            "Unknown merchant organization")
          : ownership?.ownerKind === "merchant"
            ? (charactersById.get(ownership.ownerId)?.name ?? "Unknown merchant")
            : (pack.burgs[burgId]?.name ?? "Unnamed market");
      result[hull.id] = { ownerLabel, organizationName: organization?.name, merchantNames };
    }
    detail.result = result;
  };
  document.addEventListener("fmg:economy-merchant-operator-snapshot-request", _merchantOperatorSnapshotRequestHandler);

  // Shipbuilding Vessel assets asks for short cargo labels for bound caravan ids (P2).
  _caravanCargoSnapshotRequestHandler = event => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (event as CustomEvent<{ caravanIds?: unknown; result?: Record<number, { label: string }> }>).detail;
    if (!detail || !Array.isArray(detail.caravanIds)) return;
    const caravanById = new Map(getCaravans().map(caravan => [caravan.i, caravan]));
    const result: Record<number, { label: string }> = {};
    for (const rawId of detail.caravanIds) {
      if (typeof rawId !== "number" || !Number.isInteger(rawId)) continue;
      const caravan = caravanById.get(rawId);
      if (!caravan) {
        result[rawId] = { label: "not found" };
        continue;
      }
      const payload = caravan.payload ?? [];
      if (payload.length === 0) {
        result[rawId] = { label: caravan.state === "loading" ? "loading (empty)" : "empty" };
        continue;
      }
      if (payload.length === 1) {
        const good = Goods.get(payload[0].goodId);
        result[rawId] = { label: good?.name ?? `Good #${payload[0].goodId}` };
        continue;
      }
      const first = Goods.get(payload[0].goodId)?.name ?? `Good #${payload[0].goodId}`;
      result[rawId] = { label: `${first} +${payload.length - 1}` };
    }
    detail.result = result;
  };
  document.addEventListener("fmg:economy-caravan-cargo-snapshot-request", _caravanCargoSnapshotRequestHandler);

  _shipCompletedOwnershipHandler = event => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (event as CustomEvent<unknown>).detail;
    if (!isShipCompletedEvent(detail) || detail.owner !== "market") return;
    recordMerchantHullOwnership(detail.hullId, detail.burgId);
  };
  document.addEventListener("fmg:shipbuilding-ship-completed", _shipCompletedOwnershipHandler);

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
      if (!getDistantRealms().length) OverseasRelations.generate();
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
          clearPublicWorksSettlements();
          clearStateFiscalReports();
          StrategicProcurement.clear();
          TradeAnimation.clearRouteCache();
          // The previous map's Goods Editor checkbox selection must not carry over — the new
          // map may have picked a different historicalPeriod, which changes the default set.
          resetDisplayedGoodSelection();
          MineralResources.generate();
          // Deterministic river-siting scan (docs/plan/dam-flood-control-and-hydropower.md §3).
          DamSites.generate();
          Dams.clear();
          // Same rationale (docs/plan/river-levee-and-flood-damage.md §3.2).
          LeveeSites.generate();
          Levees.clear();
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
          OverseasRelations.generate();
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
          // Fresh maps have mines/craft already staffed, but administration, construction, and
          // the basic/service employment summary only exist after this reconcile. Use the
          // initial path so a settled starting world is not 75% urban-unemployed on day one.
          reconcileAnnualBasicEmploymentWorkers({ initial: true });
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
          RegionalWaterAuthority.generate();
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
    Goods.sync();
    Markets.sync();
    clearStateFiscalReports();
    const migratedGoodsCatalog = runGoodsCatalogMigrations();
    Caravans.discardFreshCargo();
    Caravans.refreshLoadingPolicies();
    if (migratedGoodsCatalog) {
      Goods.sync();
      Markets.initializeMarketPrices();
    }
    // Run after the crop migration so a loaded map immediately receives crop-specific climate,
    // soil, and field-output columns rather than waiting for its next annual tick.
    DevelopmentPotential.generate();
    if (MineOperations.reanchorOperations() || (!getSmelterOperations().length && getMineOperations().length)) {
      SmelterOperations.generate();
    }
    if (!getTradeSecurityLedgers().length) TradeSecurity.generate();
    if (!getDistantRealms().length) OverseasRelations.generate();
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
  // Fast-Forward (docs/plan/advance-time-fast-forward.md §4.3(b)): captures whether the due months
  // accumulated for the settlement this microtask is about to flush were accrued during a
  // Fast-Forward-eligible batch. Set from economy.foodCalendar's run(context, writer) — the only
  // place in this scheduling chain that still has the SimulationStepContext (and therefore
  // isBulkAdvance) needed to evaluate isFastAdvanceActive(); the microtask below runs after that
  // context has gone out of scope, so the decision has to be captured ahead of time. `||=` so a
  // mixed batch (partly Fast-Forward, partly not — shouldn't normally happen within one flush, but
  // isn't assumed) stays Fast-Forward once any contributing tick asked for it.
  let productionSettlementsFastForward = false;
  // Fast-Forward (docs/plan/advance-time-fast-forward.md §8 Phase 4): accumulated simulated days the
  // economy.dailyHiring body still owes. While a Fast-Forward bulk advance runs, that body (job-board
  // lag, cull/escort hiring, urban pregnancy — all driven by an `effectiveDays` argument, so
  // batching is exactly the code path an Advance Month step already exercises) runs once every
  // ~30 accumulated days instead of every simulated day, the same coarsening manpower.tick uses.
  // Left at 0 and unused outside Fast-Forward, where the gate below is 1 day (i.e. every tick, no
  // deferral — identical to the pre-Phase-4 behavior).
  let hiringDaysAccumulated = 0;
  const HIRING_FAST_ADVANCE_GATE_DAYS = 30;

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

  // Fast-Forward's replacement for runOneProductionSettlement() — one call per flush (not one per
  // due month; see fastAdvanceEconomy.ts's doc comment for why compounding makes that equivalent)
  // reusing the same "production:settle" profiler label so existing benchmark/analysis scripts
  // keep working unchanged.
  const runOneFastForwardSettlement = (monthsElapsed: number) => {
    measureTickStep("production:settle", () => {
      const commit = api.dispatchExtensionCommand({
        extensionId: ECONOMY_EXTENSION_ID,
        name: "production.settleFastForward",
        payload: { monthsElapsed }
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
      const fastForward = productionSettlementsFastForward;
      if (times === 0) return;
      productionSettlementsDue = 0;
      productionDirty = false;
      productionSettlementsFastForward = false;
      foodSettlementsAlreadyApplied -= settlementsWithFoodAlreadyApplied;

      if (fastForward) {
        runOneFastForwardSettlement(times);
      } else {
        for (let i = 0; i < times; i++) runOneProductionSettlement(i < settlementsWithFoodAlreadyApplied);
      }
    });
  };

  // Core owns burg creation; the extension only enriches the newly created
  // settlement after it announces the completed promotion transaction.
  _settlementPromotedHandler = event => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID) || !isSettlementPromotionEvent(event)) return;

    const { cellId, burgId } = event.detail;
    const assignedGoodId = Goods.assignBiomeProduct(cellId);
    const burg = getWorldContext().pack.burgs[burgId];
    // Frontier polities share one market with their founding merchants. A new
    // village joins that catchment; only a state that still has no market
    // (typically a seaborne beachhead that founded a new polity) opens one.
    const createdMarket = burg ? Markets.addMarket(burgId) : null;
    if (createdMarket || Markets.usesStateBoundedTerritories()) Markets.expandTerritories();
    if (burg) burg.market = getMarketCellColumn()[cellId] || 0;
    // A new catchment can cover an already-opened mine that was still paying labour
    // and delivering Ore to the old capital hinterland.
    if (MineOperations.reanchorOperations()) SmelterOperations.generate();

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
    for (const hull of detail.hulls) recordMerchantHullOwnership(hull.id, hull.ownerId);
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
        id: `economy-caravan-${getCaravanInstanceKey(caravan)}`,
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
  // Annual State-led surveys replace the former global, omniscient pass. A
  // discovered unclaimed site is reported to Frontier; it is not mined until
  // ordinary expansion has incorporated it into a market area.
  let daysSinceLastProspecting = 0;
  const PROSPECTING_INTERVAL_DAYS = 365;
  /**
   * The economy tick, as a chain of `after`-ordered simulation systems rather than one
   * `economy.tick` run() with ~50 hand-sequenced calls inside it.
   *
   * The host registry already resolves order from declared dependencies
   * (src/generators/simulationSystem.ts), so the sequencing that used to live only in prose
   * comments — "Must run before updateAnnualAgriculture()", "Must run after
   * reconcileAnnualBasicEmploymentWorkers()" — is now `after: [previousId]` the registry
   * enforces, and each step gets its own profiler row instead of hiding inside one
   * `economy:annualUrbanKnowledge` bucket that spanned chemistry plants through great libraries.
   *
   * Ordering constraints that still hold, and why the chain is strictly linear rather than a
   * sparser dependency graph: this is step 1 of docs/plan/economy-coupling-audit.md T1, whose
   * whole point is to freeze *today's* execution order in a machine-readable form before anyone
   * re-derives which of those orderings are real. Relaxing an edge is a deliberate follow-up,
   * not something to guess at during the extraction.
   *
   * Every id sorts lexically before `shipbuilding.tick`, which the registry's tie-break relies on
   * to keep forest regrowth (`economy.forestProspect`) ahead of Shipbuilding's logging in the same
   * phase — the constraint the old single-system comment recorded. Keep the `economy.` prefix.
   *
   * Each step's reads/writes contract lives beside this ordering list in tickSystemIds.ts. This
   * keeps the execution edge and the data edge independently reviewable.
   */
  type EconomyTickSystem = Parameters<typeof api.registerSimulationSystem>[0];

  let nextEconomyTickSystemIndex = 0;
  /**
   * Appends one step to the chain with its own topic contract, and depends on the step registered
   * before it. Unregister handles are collected so cleanup() can drop them in reverse — the
   * registry refuses to remove a system another one still declares `after`.
   *
   * The id must match ECONOMY_TICK_SYSTEM_IDS at this position: that list, not the order these
   * calls happen to appear in below, is the declared execution order, and a call inserted at the
   * wrong place in a 3,700-line file would otherwise silently reorder the tick.
   */
  const registerEconomyTickSystem = (id: EconomyTickSystemId, run: EconomyTickSystem["run"]): void => {
    const index = nextEconomyTickSystemIndex++;
    if (ECONOMY_TICK_SYSTEM_IDS[index] !== id) {
      throw new Error(
        `Economy tick system '${id}' registered at position ${index}, ` +
          `where tickSystemIds.ts declares '${ECONOMY_TICK_SYSTEM_IDS[index] ?? "(past the end)"}'`
      );
    }
    const previous = index > 0 ? ECONOMY_TICK_SYSTEM_IDS[index - 1] : null;
    const after = previous ? [previous] : undefined;
    const topics = ECONOMY_TICK_TOPIC_CONTRACTS[id];
    _unregisterTickSystems.push(
      api.registerSimulationSystem({
        id,
        phase: "economy",
        reads: topics.reads,
        writes: topics.writes,
        after,
        cadence: { every: 1 },
        profileLabel: id.replace("economy.", "economy:"),
        run: (context, writer) => {
          if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
          // Fast-Forward (docs/plan/advance-time-fast-forward.md §9.4 / Phase 3): while this tick
          // runs as part of an active Fast-Forward bulk advance, the systematic annual treasury
          // spenders inside it (chemMedCommon.debitTreasury() family, StateSecretKnowledge,
          // GreatLibrary) skip only their treasury mutation — applyFastForwardEconomySettlement()
          // owns the treasury trajectory in that mode. Reset in finally so a throwing system can't
          // leave the flag stuck on for the next (non-Fast-Forward) tick.
          setFastForwardTickActive(isFastAdvanceActive(context.isBulkAdvance));
          try {
            run(context, writer);
          } finally {
            setFastForwardTickActive(false);
          }
          // Compatibility mutations are still direct. Preserve the previous per-tick
          // Economy/State invalidation, but only for a system that declares that topic.
          const compatibilityWrites = topics.writes.filter(
            topic => topic === "extension.economy" || topic === "simulation.states"
          );
          if (compatibilityWrites.length) writer.markChanged(...compatibilityWrites);
        }
      })
    );
  };

  registerEconomyTickSystem("economy.marketTerritorySync", (_context, _writer) => {
    // Incorporate last tick's political claims before this cycle's rural
    // production. Same-tick claims are stamped in the finalize-phase sync.
    if (Markets.syncStateBoundedTerritories()) {
      syncBurgMarketLedgers();
      markProductionDirty();
    }
  });

  registerEconomyTickSystem("economy.annualAgTech", (context, writer) => {
    // Must run before updateAnnualAgriculture() so this year's Tools investment feeds
    // this year's yieldPerArea/farmLaborRequired recompute, not next year's
    // (docs/plan/rural-agtech-investment.md §3.5). Industrial tech runs right after so
    // mine/smelter investment claims each market's treasury only after farms have (§6.3).
    let agricultureRefreshed = false;
    AgTechInvestment.settleAnnual();
    // Phosphate Fertilizer purchase, same shared marketTreasury.balance as Tools above but a
    // separate stock/budget calculation — runs before industrial tech so farm investment
    // (Tools + Fertilizer) keeps priority over mine/smelter claims (docs/plan/
    // phosphate-fertilizer-vertical-slice.md §3.8; docs/plan/rural-agtech-investment.md §6.3).
    FertilizerInvestment.settleAnnual();
    // Nitrogen Fertilizer purchase, same shared marketTreasury.balance but a separate
    // stock/budget calculation — runs right after Phosphate Fertilizer so both farm-fertilizer
    // investments keep priority over mine/smelter claims together (docs/plan/
    // synthetic-ammonia-vertical-slice.md §3.7; docs/plan/rural-agtech-investment.md §6.3).
    NitrogenFertilizerInvestment.settleAnnual();
    // Potash purchase (existing wood-ash Good, otherwise sold for glass/soap), same shared
    // marketTreasury.balance but a separate stock/budget calculation — runs right after the
    // other two farm-fertilizer investments so all three keep priority over mine/smelter
    // claims together (docs/plan/fallow-reduction-fertilizer-rotation.md §4.5; docs/plan/
    // rural-agtech-investment.md §6.3).
    PotashFertilizerInvestment.settleAnnual();
    IndustrialTechInvestment.settleAnnual();
    // Allocates last year's PowerStations/GasPowerStations generation capacity (era-6/7 plant
    // block below) to markets by population. Does not touch marketTreasury — PowerStations/
    // GasPowerStations already paid the capital/operating cost
    // (docs/plan/electric-power-and-telegraph.md §3.10, docs/plan/natural-gas-lng-power-
    // generation.md §3.10).
    PowerGridInvestment.settleAnnual();
    // Rolls this year's per-State drought/heatwave severity and writes climateFoodStress —
    // must run before updateAnnualAgriculture() so this year's dryness feeds this year's
    // harvest, not next year's (unlike Dam/Levee's floodProtectionByCell, which the comment on
    // Dams.settleAnnual() below explains is allowed to lag a year).
    // docs/plan/climate-disaster-drought.md §3.1.
    ClimateDisasters.settleAnnual(context.rng);
    // Must run before the quarter's food ledger so annual demographic changes
    // alter cultivated area and farm labour without waiting an extra quarter.
    agricultureRefreshed = DevelopmentPotential.updateAnnualAgriculture();
    // Urban counterpart of reconcileSubsistenceCapacityFromFood: hinterland surplus +
    // last-quarter imports rewrite burg.demographics.capacity around seedCapacity.
    // Must run on the same annual refresh so this year's AgTech / drought / fertilizer
    // already sit in ruralFoodCapacity. docs/plan/economy-coupling-audit.md L4.
    if (agricultureRefreshed && reconcileUrbanCapacityFromFood()) {
      writer.markChanged("simulation.burgs");
    }
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

  registerEconomyTickSystem("economy.caravans", (context, _writer) => {
    const { years: deltaYears, months: deltaMonths, days: deltaDays } = context.delta;
    const effectiveDays = deltaDays + deltaMonths * 30 + deltaYears * 365;
    const caravanTick = measureTickStep("economy:caravanMovement", () => Caravans.tick(effectiveDays));
    measureTickStep("economy:retailInventory", () => tickRetailInventory());
    measureTickStep("economy:strategicProcurement", () =>
      StrategicProcurement.reconcileCaravans(caravanTick.arrived, caravanTick.lost)
    );
    // Trade animation redraw is owned by registerDrawLayerHook after extension.economy
    // commits through RenderCoordinator (P2-12) — do not call draw* from the tick.
  });

  registerEconomyTickSystem("economy.warIntensity", (context, _writer) => {
    const { years: deltaYears, months: deltaMonths, days: deltaDays } = context.delta;
    const effectiveDays = deltaDays + deltaMonths * 30 + deltaYears * 365;
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

  registerEconomyTickSystem("economy.dailyHiring", (context, writer) => {
    const { years: deltaYears, months: deltaMonths, days: deltaDays } = context.delta;
    const tickDays = deltaDays + deltaMonths * 30 + deltaYears * 365;
    // Fast-Forward Phase 4 (docs/plan/advance-time-fast-forward.md §8): defer the hire-board body to
    // a ~monthly cadence during a Fast-Forward bulk advance. Outside Fast-Forward nothing changes —
    // `effectiveDays`/`effectiveDeltaYears` keep their exact previous expressions and the body runs
    // every tick. Everything below is scaled by `effectiveDays`, so one batched call is the same
    // shape an Advance Month step already produces.
    const ffActive = isFastAdvanceActive(context.isBulkAdvance);
    if (ffActive) {
      hiringDaysAccumulated += tickDays;
      if (hiringDaysAccumulated < HIRING_FAST_ADVANCE_GATE_DAYS) return;
    }
    const effectiveDays = ffActive ? hiringDaysAccumulated : tickDays;
    const effectiveDeltaYears = ffActive
      ? hiringDaysAccumulated / 365.2425
      : deltaYears + deltaMonths / 12 + deltaDays / 365.2425;
    if (ffActive) hiringDaysAccumulated = 0;
    // Pregnancy observability (PR-P1): age/conceive after demography in the same advanceTime.
    // When PR-P2 registers a birth-floor provider, tickUrbanPregnancy is a no-op (provider owns mutation).
    tickUrbanPregnancy(effectiveDeltaYears);
    // Construction hire-board lag + slow anonymous fills (job postings Phase 2).
    tickConstructionHiring(effectiveDays);
    // Research workshop / mine-labor hire lag (technology-bias PR-3).
    tickResearchHiring(effectiveDays);
    tickInstructMissions(effectiveDays, { spreadNeighborhood: true });
    // Threat cull / pest job board expiry + monthly top-up (PR-2).
    tickCullJobBoard(effectiveDays);
    // Cull hire lag / accept / combat resolve + ecology (PR-3b).
    const cullTopics: readonly DataTopic[] = tickCullHiring(effectiveDays, context.rng).topics;
    // Escort (護衛) board + hire resolve — all culture sets.
    tickEscortJobBoard(effectiveDays);
    const escortTopics: readonly string[] = tickEscortHiring(effectiveDays, context.rng).topics;

    // Cull ecology topics (cells/annotations) — only when resolve actually mutated host data.
    if (cullTopics.length) {
      const hostTopics = cullTopics.filter(t => t === "simulation.cells" || t === "map.annotations");
      if (hostTopics.length) writer.markChanged(...hostTopics);
    }
    // Escort resolve already mutates extension.economy + simulation.states (marked above).
    void escortTopics;
  });

  registerEconomyTickSystem("economy.annualUrbanLabor", (context, writer) => {
    // Fast-Forward (docs/plan/advance-time-fast-forward.md §4.6): UrbanLaborIntake bases its
    // rural<->burg migration decisions on this year's craft/employment records, which
    // Production.produce() normally refreshes every month. Skipping produce() during Fast-Forward
    // leaves those records stale (frozen at whatever they were when Fast-Forward engaged), and
    // running the real migration logic against stale demand caused runaway population
    // reallocation between burgs in live testing — some burgs collapsing over 99%, others growing
    // several-fold, within a single Advance Year, nothing like the intended flat preset growth
    // applyFastForwardPopulation() already wrote. Skip it entirely instead; reconcileAnnual
    // BasicEmploymentWorkers()/ConstructionOperations.constrainEffectiveCapacity() below are
    // naturally skipped too since they're gated on `urbanMobility` being non-null.
    const urbanMobility = isFastAdvanceActive(context.isBulkAdvance)
      ? null
      : UrbanLaborIntake.updateAnnualState(getWorldContext(), context.rng);
    const settledAdultsFromMobility = urbanMobility?.settledAdults ?? 0;
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

    if (settledAdultsFromMobility > 0) writer.markChanged("simulation.burgs", "map.settlements");
  });

  registerEconomyTickSystem("economy.annualPlants", (_context, _writer) => {
    // Chemistry / medicine workshops and hospitals must publish headcount and
    // burg.medicalCare before Guild/Academy EWMA and UrbanWater sanitation writes.
    // docs/plan/chemistry-medicine-knowledge-accumulation.md §9
    dropExpiredHints();
    decayInstructionResidues();
    ApothecaryWorkshops.settleAnnual();
    ExperimentalWorkshops.settleAnnual();
    HospitalInstallations.settleAnnual();
    AcidPlants.settleAnnual();
    // Depends on AcidPlants's Sulfuric Acid output for its own recipe
    // (docs/plan/phosphate-fertilizer-vertical-slice.md §3.7); runs right after.
    PhosphateFertilizerPlants.settleAnnual();
    // Also depends on AcidPlants's Sulfuric Acid output (catalytic Deacon-process oxidation
    // with Salt); runs alongside PhosphateFertilizerPlants for the same reason.
    // docs/plan/chlorine-production-vertical-slice.md §3.6.
    ChlorinePlants.settleAnnual();
    // Bessemer-converter Steel supply — independent of the chemistry plants above; the
    // second supply route for the existing Steel Good (docs/plan/modern-steelmaking-and-
    // high-pressure-apparatus.md §3.2).
    SteelConverters.settleAnnual();
    // Consumes only Coke (hydrogen source + process-energy proxy), independent of the plants
    // above — grouped here as the era 6 plant block (docs/plan/synthetic-ammonia-vertical-
    // slice.md §3.6).
    SyntheticAmmoniaPlants.settleAnnual();
    // Coal/Copper Wire/Machine Parts only, independent of the other era-6 plants above.
    // PowerGridInvestment (annualAgTech block above) reads this year's output starting next
    // year (docs/plan/electric-power-and-telegraph.md §3.9).
    PowerStations.settleAnnual();
    // LNG/Copper Wire/Machine Parts only — the second fuel source joining the same
    // generationCapacity pool via PowerGridInvestment. docs/plan/natural-gas-lng-power-
    // generation.md §3.9.
    GasPowerStations.settleAnnual();
    // Copper Wire/Machine Parts only, no fuel — grouped here as part of the era-6 plant block.
    TelegraphLines.settleAnnual();
    // Stone/Timber founding/upkeep, plus Copper Wire/Machine Parts once electrified (no Coal —
    // water is the fuel). Runs after AgTechInvestment (annualAgTech block above, earlier in
    // this same tick) so its floodProtectionByCell floor is applied on top of, not overwritten
    // by, that block's own EWMA write. PowerGridInvestment reads this year's generationCapacity
    // starting next year, the same one-year lag PowerStations already has.
    // docs/plan/dam-flood-control-and-hydropower.md §3.
    Dams.settleAnnual();
    // Stone/Timber founding/upkeep, no electrification stage. Runs right after Dams so its
    // floodProtectionByCell floor is applied on top of both Dams' and AgTechInvestment's
    // writes earlier in this same tick. docs/plan/river-levee-and-flood-damage.md §3.
    Levees.settleAnnual();
    // Reads this year's Market.electricityStock, already written by PowerGridInvestment
    // earlier in this same annual tick (investment block runs before this production block).
    // Alumina/Coke/Firebrick consumption is independent of the other era-6 plants above.
    // docs/plan/electrolytic-industry-vertical-slice.md §3.7.
    ElectrolysisPlants.settleAnnual();
    // Chlor-alkali brine electrolysis — a THIRD supply route for Chlorine/Caustic Soda
    // (craft-worker recipes + ChlorinePlants' Deacon-process route already exist). Consumes
    // Salt/Firebrick/Market.electricityStock only — no Coal, no Sulfuric Acid, no AcidPlants
    // dependency — independent of every other era-6 plant above. Competes with ChlorinePlants
    // and the craft-worker Chlorine recipe for the same Salt Good (a modeling nuance, not a
    // blocker). docs/plan/chlor-alkali-electrolysis-vertical-slice.md §3.1.
    ChlorAlkaliPlants.settleAnnual();
    // Cinnabar/Coal/Firebrick only, independent of every other era-6 plant above — a small,
    // deliberately minor-scale chemistry plant (§9.5's "少量生産"), not a bulk industrial
    // process. docs/plan/cinnabar-mercury-vertical-slice.md §3.7.
    MercuryPlants.settleAnnual();
    // Crude Oil/Coal/Firebrick only, independent of every other plant above — the era-7
    // refining step. docs/plan/petroleum-and-internal-combustion-vertical-slice.md §3.7.
    OilRefineryPlants.settleAnnual();
    // Natural Gas/Coal/Machine Parts only, independent of every other plant above — the
    // era-7 liquefaction step. docs/plan/natural-gas-lng-power-generation.md §3.8.
    LNGPlants.settleAnnual();
    // LNG/Machine Parts only, independent of every other plant above. storageCapacity is a
    // State-wide pool (no powerGrid-style two-stage abstraction) that settleCellFreshFood()
    // (markets-generator.ts) reads directly. docs/plan/mechanical-refrigeration-and-cold-
    // chain.md §3.5.
    ColdStorageDepots.settleAnnual();
    settleChemMedPracticeDecay();
  });

  registerEconomyTickSystem("economy.annualInfrastructure", (_context, writer) => {
    // Urban water / sanitation: recompute demand vs capacity and write burg.sanitation.
    // Self-gates once per simulation year (docs/plan/urban-water-and-sanitation-system.md Phase 1).
    const urbanWaterChanged = UrbanWater.settleAnnual();
    // Regional water schemes: advance each scheme's proposed→...→operating lifecycle and
    // propose new ones for eligible, not-yet-covered burgs. Runs right after UrbanWater above so
    // it can read this year's freshly-settled hasUpstreamIntake per burg; an operating scheme's
    // benefit is folded back into hasUpstreamIntake/etc. starting NEXT year's UrbanWater
    // settleAnnual() call — same one-year lag as PowerGridInvestment reading last year's Dam/
    // PowerStation output. docs/plan/modern-urban-water-treatment-and-governance.md §9, §14.
    RegionalWaterAuthority.settleAnnual();
    // Returns true only when new "railways" route track was laid this call
    // (docs/plan/steam-industrial-implementation.md §7) — drives map.networks below.
    const railwayNetworkChanged = SteamIndustry.settleAnnual();
    // Spends state.departmentBalances.publicWorks on road promotions, harbour works and public
    // granaries; true only when a trail was promoted to "roads" this call
    // (docs/plan/economy-coupling-audit.md L8 stage 2). Self-gates once per simulation year.
    const publicWorks = PublicWorks.settleAnnual();

    if (urbanWaterChanged) writer.markChanged("simulation.burgs", "map.settlements");
    // New railway track was laid into pack.routes/pack.cells.routes this tick
    // (steamIndustry.ts's settleRailways), or a trail changed group to "roads"
    // (publicWorks.ts) — redraw routes and invalidate the WebGL cache.
    if (railwayNetworkChanged || publicWorks.networkChanged) writer.markChanged("map.networks");
    // Public works also move Burg.publicWorks levels, which feed food reserves and port throughput,
    // and draw this year's spend out of state.departmentBalances.publicWorks.
    if (publicWorks.worksChanged) writer.markChanged("simulation.burgs");
    if (publicWorks.settled) writer.markChanged("simulation.states");
  });

  registerEconomyTickSystem("economy.annualKnowledge", (context, _writer) => {
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
  });

  registerEconomyTickSystem("economy.annualBurgGroups", (_context, writer) => {
    const burgGroupsChanged = DevelopmentPotential.updateAnnualBurgGroups();

    if (burgGroupsChanged) writer.markChanged("simulation.burgs", "map.settlements");
  });

  registerEconomyTickSystem("economy.forestProspect", (context, _writer) => {
    const { years: deltaYears, months: deltaMonths, days: deltaDays } = context.delta;
    const effectiveDays = deltaDays + deltaMonths * 30 + deltaYears * 365;
    const effectiveDeltaYears = deltaYears + deltaMonths / 12 + deltaDays / 365.2425;
    const forestChanged = tickForestRegrowth(effectiveDeltaYears, getForestRegrowthMultiplier);
    if (forestChanged) markProductionDirty();

    daysSinceLastProspecting += effectiveDays;
    if (daysSinceLastProspecting >= PROSPECTING_INTERVAL_DAYS) {
      daysSinceLastProspecting %= PROSPECTING_INTERVAL_DAYS;
      const discoveries = runStateProspecting(api, () => context.rng.rand());
      const reanchoredOperations = MineOperations.reanchorOperations();
      const openedOperations = MineOperations.openDiscoveredAccessibleOperations();
      if (discoveries || openedOperations || reanchoredOperations) SmelterOperations.generate();
    }
  });

  registerEconomyTickSystem("economy.foodCalendar", (context, _writer) => {
    const { years: deltaYears, months: deltaMonths, days: deltaDays } = context.delta;
    const effectiveDays = deltaDays + deltaMonths * 30 + deltaYears * 365;
    const monthsDue = Math.floor((daysSinceLastProduction + effectiveDays) / 30);
    const firstSettlementMonth = (((api.simulationContext.currentMonth - monthsDue) % 12) + 12) % 12;
    let elapsedDays = 0;
    let settledMonths = 0;
    let foodSettlementsThisTick = 0;
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

    if (settledMonths > 0) {
      productionSettlementsDue += settledMonths;
      foodSettlementsAlreadyApplied += foodSettlementsThisTick;
      // Fast-Forward (docs/plan/advance-time-fast-forward.md §4.3(b)): captured here, the one place
      // in this chain that still has `context` (and therefore isBulkAdvance), for
      // scheduleProductionSettlement()'s microtask to read once it flushes. Food consumption
      // above is unaffected either way — it already ran for real, per due month, regardless of
      // Fast-Forward.
      productionSettlementsFastForward ||= isFastAdvanceActive(context.isBulkAdvance);
      // Queue after all synchronous simulation systems have run, so logging events from
      // Shipbuilding (same tick, economy phase after this system by lexical id) are included.
      scheduleProductionSettlement();
    }
  });

  _unregisterMarketTerritorySystem = api.registerSimulationSystem({
    id: "economy.marketTerritories",
    phase: "finalize",
    reads: ["map.politics", "simulation.cells", "extension.economy"],
    writes: ["extension.economy", "simulation.burgs"],
    cadence: { every: 1 },
    profileLabel: "economyMarketTerritories",
    run: (_context, writer) => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
      if (!Markets.syncStateBoundedTerritories()) return;
      syncBurgMarketLedgers();
      markProductionDirty();
      writer.markChanged("extension.economy", "simulation.burgs");
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
    Goods.sync();
    Markets.sync();
    attachSvgClickHandlers();
    const migratedGoodsCatalog = runGoodsCatalogMigrations();
    Caravans.discardFreshCargo();
    Caravans.refreshLoadingPolicies();
    if (migratedGoodsCatalog) {
      Goods.sync();
      Markets.initializeMarketPrices();
    }
    if (MineOperations.reanchorOperations() || (!getSmelterOperations().length && getMineOperations().length)) {
      SmelterOperations.generate();
    }
    if (getWorldContext().options.gunpowderEraEnabled === false) refreshEconomyForGunpowderEra(api);
    // Backfill sales/poll tax rates and recompute treasury for maps saved before this feature existed.
    // Both calls are idempotent/cheap, so re-running them on every load is safe.
    Taxes.defineTaxRates();
    Taxes.collectTaxes();
    if (!getMintLedgers().length && getMarkets().length) Minting.generate();
    if (!getMilitaryResourceLedgers().length && getMarkets().length) MilitaryResources.generate();
    if (!getTradeSecurityLedgers().length) TradeSecurity.generate();
    if (!getDistantRealms().length) OverseasRelations.generate();
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
  _unregisterProductionSettlementFastForwardCommand?.();
  _unregisterProductionSettlementFastForwardCommand = null;
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
  _unregisterJobsApplyResearchCommand?.();
  _unregisterJobsApplyResearchCommand = null;
  _unregisterJobsResignResearchCommand?.();
  _unregisterJobsResignResearchCommand = null;
  _unregisterJobsCancelResearchCommand?.();
  _unregisterJobsCancelResearchCommand = null;
  _unregisterJobsInstructCommand?.();
  _unregisterJobsInstructCommand = null;
  _unregisterJobsCancelInstructCommand?.();
  _unregisterJobsCancelInstructCommand = null;
  _unregisterJobsCopyNotesCommand?.();
  _unregisterJobsCopyNotesCommand = null;
  _unregisterPatronageFundCommand?.();
  _unregisterPatronageFundCommand = null;
  _unregisterPatronageHireCommand?.();
  _unregisterPatronageHireCommand = null;
  _unregisterPatronageFuelCommand?.();
  _unregisterPatronageFuelCommand = null;
  _unregisterCommerceTradeCommand?.();
  _unregisterCommerceTradeCommand = null;
  _unregisterClearCommand?.();
  _unregisterClearCommand = null;
  // Reverse order: the registry refuses to remove a system while another still declares it in
  // `after`, and the tick systems form a linear chain (see registerEconomyTickSystem).
  for (const unregister of _unregisterTickSystems.reverse()) unregister();
  _unregisterTickSystems.length = 0;
  _unregisterMarketTerritorySystem?.();
  _unregisterMarketTerritorySystem = null;
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
  if (_mountedCapacityRequestHandler) {
    document.removeEventListener("fmg:economy-mounted-capacity-request", _mountedCapacityRequestHandler);
    _mountedCapacityRequestHandler = null;
  }
  if (_merchantOperatorSnapshotRequestHandler) {
    document.removeEventListener(
      "fmg:economy-merchant-operator-snapshot-request",
      _merchantOperatorSnapshotRequestHandler
    );
    _merchantOperatorSnapshotRequestHandler = null;
  }
  if (_caravanCargoSnapshotRequestHandler) {
    document.removeEventListener("fmg:economy-caravan-cargo-snapshot-request", _caravanCargoSnapshotRequestHandler);
    _caravanCargoSnapshotRequestHandler = null;
  }
  if (_shipCompletedOwnershipHandler) {
    document.removeEventListener("fmg:shipbuilding-ship-completed", _shipCompletedOwnershipHandler);
    _shipCompletedOwnershipHandler = null;
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
  clearPublicWorksSettlements();
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
  clearEconomyContext();
}
