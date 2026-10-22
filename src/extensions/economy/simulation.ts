import { MEAN_DAYS_PER_MONTH, MEAN_DAYS_PER_YEAR } from "../../runtime/calendarDuration";
import type { DataTopic } from "../../runtime/worldRuntime";
import { simEvents } from "../../simulation/events";
import { isRepairAtVersion } from "../../simulation/loadRepairs";
import { prepareMasterReference } from "../../simulation/masterReference";
import { uiPreferencesStore } from "../../state/uiPreferencesStore";
import type { SimulationExtension, SimulationExtensionAPI } from "../../types/extension-api";
import { getSimulationCharacters, hasCharactersContext } from "../characters/charactersContext";
import { buildWorldRoster } from "../characters/roster/build";
import {
  FAST_ADVANCE_COARSE_GATE_DAYS,
  FUNERAL_DEMAND_EVENT,
  isStateInActiveConflict,
  optionsStore,
  resolveFastAdvanceRates,
  runWithSimulationRandom,
  setFrontierSpendingPayee
} from "../hostCore";
import {
  isShipbuildingInitialStockRequest,
  isShipbuildingMaterialRequest,
  isShipbuildingMerchantHullsSnapshot,
  isShipbuildingProcurementStatusRequest,
  isShipbuildingShipGoodStockRequest,
  isShipbuildingStrategicProcurementDemand,
  isShipbuildingSurplusShipRequest
} from "../hostTypes";
import { measureTickStep, measureTickStepAsync, rn, TIME } from "../hostUtils";
import { getCadencePhase, setCadencePhase } from "./context/cadencePhases";
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
import {
  DEVELOPMENT_POTENTIAL_LOAD_REPAIR,
  DEVELOPMENT_POTENTIAL_LOAD_REPAIR_VERSION,
  DevelopmentPotential
} from "./generators/developmentPotential";
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
import {
  clearFaunaPopulation,
  recordQuarterlyNonFoodDemand,
  updateAnnualFaunaCohorts
} from "./generators/faunaPopulation";
import { FertilizerInvestment } from "./generators/fertilizerInvestment";
import { resetEffectiveCapacities } from "./generators/foodImportNetwork";
import { settleMonthlyFoodConsumption } from "./generators/foodLedgerConsumption";
import { FoodProduction } from "./generators/foodProduction";
import { tickForestRegrowth } from "./generators/forestStock";
import { FortificationMastery } from "./generators/fortificationMastery";
import { consumeFuneralMaterialsFromPending } from "./generators/funeralGoodsConsumption";
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
  migrateLinenBale,
  migrateLiveAnimalTags,
  migrateLiveCatsGood,
  migrateLiveDogsGood,
  migrateMeasuredCargoSlots,
  migrateMercuryChainGoods,
  migrateNaturalGasChainGoods,
  migratePerennialFruitGoods,
  migratePetroleumChainGoods,
  migratePhosphateGoods,
  migratePomaceDistillationGoods,
  migrateRaisinsGood,
  migrateSmeltedMetalValues,
  migrateSmeltingFuelAndAshGoods,
  migrateStapleCropGoods,
  migrateSyntheticAmmoniaGoods,
  migrateWeightRepricing,
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
import {
  payOutMarketSurplus,
  payStateHouseholds,
  spendRuralHouseholdsInTowns,
  spendUrbanHouseholdSurplus
} from "./generators/householdWealth";
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
import { MerchantTradeCapital } from "./generators/merchantTradeCapital";
import { MerchantTransportAssets } from "./generators/merchantTransportAssets";
import { MercuryPlants } from "./generators/mercuryPlants";
import { MetallurgWork } from "./generators/metallurgWork";
import { MilitaryResources } from "./generators/militaryResources";
import { MineOperations } from "./generators/mineOperations";
import { MineralResources } from "./generators/mineralResources";
import { Minting } from "./generators/minting";
import { getStateMountedCapacity } from "./generators/mountAvailability";
import { payNavyCrew, settleNavyVoyageTrade } from "./generators/navyTrade";
import { NitrogenFertilizerInvestment } from "./generators/nitrogenFertilizerInvestment";
import { OilRefineryPlants } from "./generators/oilRefineryPlants";
import { OverseasRelations } from "./generators/overseasRelations";
import { initializeRosterCash, registerPersonalCash } from "./generators/personalCash";
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
import { seedShipbuildingInitialStock } from "./generators/shipbuildingInitialStock";
import { SmelterOperations } from "./generators/smelterOperations";
import { refreshStateEconomySummaries } from "./generators/stateEconomySummary";
import { clearStateFiscalReports } from "./generators/stateFiscalReport";
import { StateSecretKnowledge } from "./generators/stateSecretKnowledge";
import { SteamIndustry } from "./generators/steamIndustry";
import { SteelConverters } from "./generators/steelConverters";
import { StrategicProcurement } from "./generators/strategicProcurement";
import { SyntheticAmmoniaPlants } from "./generators/syntheticAmmoniaPlants";
import { clearStrategicProcurementExpenses, clearVoyageIncome, Taxes } from "./generators/taxes-generator";
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
import { payTownWorks } from "./generators/townWorks";
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
import { UrbanWater } from "./generators/urbanWaterSystem";
import { clearMerchantHullOwnerships, recordMerchantHullOwnership } from "./generators/vesselOwnership";
import { clearViticultureAllocationShares } from "./generators/viticultureAllocation";
import { VolcanicOperations } from "./generators/volcanicOperations";
import { ECONOMY_TICK_SYSTEM_IDS, ECONOMY_TICK_TOPIC_CONTRACTS, type EconomyTickSystemId } from "./tickSystemIds";

export const ECONOMY_EXTENSION_ID = "economy";

/**
 * Economy simulation entry (docs/plan/simulation-core-separation.md §7, S5): commands, the tick
 * chain, the map-ready task, the production settlement scheduler and the cross-extension events.
 * Layers, dialogs, tooltips and Balance History stay in `index.tsx`; they follow the data through
 * ECONOMY_GOODS_CHANGED_EVENT and ECONOMY_INITIALIZED_EVENT.
 */

/** Goods placement or production changed; `detail.webgl` also asks for a WebGL redraw. */
export const ECONOMY_GOODS_CHANGED_EVENT = "fmg:economy-goods-changed";
/** The "Preparing economy" map-ready task finished for a new map. */
export const ECONOMY_INITIALIZED_EVENT = "fmg:economy-initialized";

function notifyEconomyGoodsChanged(webgl: boolean): void {
  simEvents.dispatchEvent(new CustomEvent(ECONOMY_GOODS_CHANGED_EVENT, { detail: { webgl } }));
}

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
  migrateSmeltedMetalValues,
  migratePomaceDistillationGoods,
  migrateFoodProcessingLotContracts,
  migrateFreshFoodTags,
  migrateLiveAnimalTags,
  migrateLinenBale,
  migrateMeasuredCargoSlots,
  migrateWeightRepricing
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

export type EconomyRegenerationTarget = "economy" | "currency" | "goods" | "markets" | "minerals" | "production";

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

function isSkipFoodConsumptionPayload(value: unknown): value is { readonly skipFoodConsumption: true } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    (value as Record<string, unknown>).skipFoodConsumption === true
  );
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

function registerEconomyCommands(api: SimulationExtensionAPI): void {
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
      // Fast-Forward path (docs/plan/advance-time-fast-forward.md §4.3(b), §4.5): one payload
      // shape on the same command, rather than a parallel `production.settleFastForward`.
      // Replaces Production.produce()/MetallurgWork.*/Taxes.collectTaxes() with a flat annual
      // rate. refreshStateEconomySummaries()/synchronizePlayerCommerce() still run for real so
      // Overview dialogs reflect the new treasury/stock (§4.6).
      if (isFastForwardSettlementPayload(value)) {
        measureTickStep("production:fastForward", () =>
          applyFastForwardEconomySettlement(value.monthsElapsed, resolveFastAdvanceRates(), api.appServices.rng)
        );
        measureTickStep("production:stateSummaries", () => refreshStateEconomySummaries());
        measureTickStep("production:playerCommerce", () => synchronizePlayerCommerce());
        return { changed: true };
      }
      const skipFoodConsumption = isSkipFoodConsumptionPayload(value);
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
      measureTickStep("production:householdSpending", () => spendUrbanHouseholdSurplus());
      measureTickStep("production:ruralSpending", () => spendRuralHouseholdsInTowns());
      const creditCharacter = (characterId: number, amount: number) => {
        const merchant = hasCharactersContext()
          ? getSimulationCharacters().find(c => c.i === characterId && !c.dead)
          : undefined;
        if (!merchant) return false;
        merchant.wealth = rn((merchant.wealth || 0) + amount, 2);
        return true;
      };
      // Houses ask investors for what they lacked, and give idle capital back
      // (long-distance-merchant-reach-capital.md §5.2). Only on a month's settlement (its food was
      // settled by the food calendar), not on one a producer change asked for between months.
      if (skipFoodConsumption)
        measureTickStep("production:tradeCapital", () => MerchantTradeCapital.settleCapitalAccounts(creditCharacter));
      measureTickStep("production:marketPayout", () => payOutMarketSurplus(creditCharacter));
      measureTickStep("production:townWorks", () => payTownWorks());
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
      if (value.target === "economy") FortificationMastery.generate();
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

function refreshEconomyForGunpowderEra(api: SimulationExtensionAPI): void {
  const commit = api.dispatchExtensionCommand({
    extensionId: ECONOMY_EXTENSION_ID,
    name: "refreshGunpowderEra",
    payload: undefined
  });
  if (!commit) return;
  notifyEconomyGoodsChanged(true);
}

/**
 * The Economy extension owns the hidden deposit list. It exposes discoveries to
 * the host only as survey events, so Frontier can prefer the resulting route
 * without learning every undiscovered deposit on the map.
 */
function runStateProspecting(api: SimulationExtensionAPI, random: () => number): number {
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
    const geography = rulerId === undefined ? 0 : api.getEffectiveSkill(rulerId, "geography.physical");
    const engineering = rulerId === undefined ? 0 : api.getEffectiveSkill(rulerId, "engineering.mining");
    const rivalExpertise = Math.max(
      0,
      ...(state.neighbors ?? []).map(neighborId => {
        const neighbor = statesById.get(neighborId);
        const neighborRulerId = neighbor ? getStateRulerId(neighbor) : undefined;
        if (neighborRulerId === undefined) return 0;
        return (
          (api.getEffectiveSkill(neighborRulerId, "geography.physical") +
            api.getEffectiveSkill(neighborRulerId, "engineering.mining")) /
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
      simEvents.dispatchEvent(
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
  frontier: SimulationExtensionAPI["simulationContext"]["frontier"],
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

function register(api: SimulationExtensionAPI): () => void {
  const listeners: [string, (event: Event) => void][] = [];
  const on = (type: string, listener: (event: Event) => void) => {
    api.events.addEventListener(type, listener);
    listeners.push([type, listener]);
  };
  const _unregisterTickSystems: (() => void)[] = [];

  initEconomyContext(api);
  const unregisterPersonalCash = registerPersonalCash(api);
  // Frontier works and settlement are paid to the State's people (docs/plan/money-supply-mint.md §4.2).
  setFrontierSpendingPayee((stateId, amount) =>
    api.isExtensionEnabled(ECONOMY_EXTENSION_ID) ? payStateHouseholds(stateId, amount) : 0
  );
  const economySlice = api.simulationContext?.extensions?.economy;
  if (economySlice) migrateLegacyAnnualGateYears(economySlice);
  registerEconomyCommands(api);
  on("fmg:economy-mounted-capacity-request", event => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (event as CustomEvent<unknown>).detail;
    if (!isMountedCapacityRequest(detail)) return;
    const capacity = getStateMountedCapacity(detail.stateId);
    if (capacity === undefined) return;
    detail.capacity = capacity;
    detail.handled = true;
  });

  on("fmg:economy-merchant-operator-snapshot-request", event => {
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
  });

  // Shipbuilding Vessel assets asks for short cargo labels for bound caravan ids (P2).
  on("fmg:economy-caravan-cargo-snapshot-request", event => {
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
  });

  on("fmg:shipbuilding-ship-completed", event => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (event as CustomEvent<unknown>).detail;
    if (!isShipCompletedEvent(detail) || detail.owner !== "market") return;
    recordMerchantHullOwnership(detail.hullId, detail.burgId);
  });

  const unsubscribe = api.subscribeExtensionState((state, prevState) => {
    const isEnabled = state.enabledExtensions[ECONOMY_EXTENSION_ID];
    const wasEnabled = prevState.enabledExtensions[ECONOMY_EXTENSION_ID];
    if (isEnabled && !wasEnabled) {
      // Demography birth floor: pregnancy due sets a lower bound on urban births (PR-P2).
      registerUrbanPregnancyBirthFloor();
      // Data generation is deliberately deferred. During core map generation the
      // coordinator will run this task after the map is complete; for a live map
      // it runs only Economy's task, without resetting unrelated extensions.
      if (getMarkets().length) {
        // Reconcile geography and caches after edits made while paused, retaining wallets
        // and stocks. Full initialization would reset the existing economy.
        Markets.sync();
        Markets.expandTerritories();
        for (const ledger of getBurgMarketLedgers()) {
          const burg = getWorldContext().pack.burgs[ledger.burgId];
          if (burg && !burg.removed) ledger.marketId = burg.market || ledger.marketId;
        }
        if (api.isExtensionEnabled("characters")) initializeRosterCash(buildWorldRoster());
      } else api.requestMapReadyTask("economy.initialization");
    } else if (!isEnabled && wasEnabled) {
      // Pausing an extension must not destroy private wallets or reissue bootstrap money on resume.
      unregisterUrbanPregnancyBirthFloor();
    }
  });

  // Already enabled at registration (e.g. persisted preference).
  if (api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) {
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
        const migratedMetallurgHarnesses = MetallurgWork.migrateLegacyHarnessUnitScale();
        const migratedMetallurg = MetallurgWork.migrateLegacyToolsUnitScale() || migratedMetallurgHarnesses;
        if (!getMetallurgAssetLedgers().length) {
          MetallurgWork.generate();
          MetallurgWork.settleMonthly();
        } else if (migratedMetallurg) {
          MetallurgWork.settleMonthly();
        }
      }
    }
  }

  const unregisterMapReadyTask = api.registerMapReadyTask({
    id: "economy.initialization",
    label: "Preparing economy",
    run: async context => {
      if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID) || !context.isCurrent()) return;
      if (await prepareMasterReference(api, context)) {
        Goods.sync();
        Markets.sync();
        api.events.dispatchEvent(new CustomEvent(ECONOMY_INITIALIZED_EVENT));
        return;
      }
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
          const skipGlobalTrade = uiPreferencesStore.getState().economySkipTradeOnGenerate;
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
          FortificationMastery.generate();
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
          // Balance History's first row and the redraw happen in the view (ECONOMY_INITIALIZED_EVENT).
          api.events.dispatchEvent(new CustomEvent(ECONOMY_INITIALIZED_EVENT));
        } finally {
          TIME && console.timeEnd("generateEconomy");
        }
      }
    }
  });

  on("fmg:gunpowder-era-changed", () => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    refreshEconomyForGunpowderEra(api);
  });

  // Archives from before the Ore/Ingot split retain their old Good ids. Upgrade the
  // catalog after a full world replacement so market stock becomes Ore in place and
  // newly added Ingots/Cats begin at zero stock (no duplicated wealth).
  on("fmg:world-loaded", () => {
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
    // soil, and field-output columns rather than waiting for its next annual tick — once per
    // formula version, so a save/load continues the saved columns (§23).
    if (
      migratedGoodsCatalog ||
      !isRepairAtVersion(
        getWorldContext().options,
        DEVELOPMENT_POTENTIAL_LOAD_REPAIR,
        DEVELOPMENT_POTENTIAL_LOAD_REPAIR_VERSION
      )
    )
      DevelopmentPotential.generate();
    if (MineOperations.reanchorOperations() || (!getSmelterOperations().length && getMineOperations().length)) {
      SmelterOperations.generate();
    }
    if (!getTradeSecurityLedgers().length) TradeSecurity.generate();
    if (!getDistantRealms().length) OverseasRelations.generate();
    const migratedMetallurgHarnesses = MetallurgWork.migrateLegacyHarnessUnitScale();
    const migratedMetallurg = MetallurgWork.migrateLegacyToolsUnitScale() || migratedMetallurgHarnesses;
    if (!getMetallurgAssetLedgers().length) {
      MetallurgWork.generate();
      MetallurgWork.settleMonthly();
    } else if (migratedMetallurg) {
      MetallurgWork.settleMonthly();
    }
    // Rebuild cull / escort boards when empty or only invalid targets remain after load.
    rebuildCullJobPostings();
    rebuildEscortJobPostings();
  });

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
  // Fast-Forward-eligible batch. Set from economy.foodCalendar's run(context, writer) — the
  // microtask below runs after that context has gone out of scope, so `context.fastAdvanceRates`
  // has to be captured ahead of time. `||=` so a mixed batch stays Fast-Forward once any
  // contributing tick asked for it.
  let productionSettlementsFastForward = false;
  // Fast-Forward (docs/plan/advance-time-fast-forward.md §8 Phase 4): accumulated simulated days the
  // economy.dailyHiring body still owes. While a Fast-Forward bulk advance runs, that body (job-board
  // lag, cull/escort hiring, urban pregnancy — all driven by an `effectiveDays` argument, so
  // batching is exactly the code path an Advance Month step already exercises) runs once every
  // FAST_ADVANCE_COARSE_GATE_DAYS instead of every simulated day, the same coarsening
  // manpower.tick and applyFastForwardPopulation use.
  // Left at 0 and unused outside Fast-Forward, where the gate below is 1 day (i.e. every tick, no
  // deferral — identical to the pre-Phase-4 behavior).

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
      notifyEconomyGoodsChanged(false);
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
        name: "production.settle",
        payload: { monthsElapsed }
      });
      if (!commit) return;
      notifyEconomyGoodsChanged(false);
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

      // Runs after the advance has returned, so it gets its own reproducible stream (track R).
      runWithSimulationRandom("economy.productionSettlement", () => {
        if (fastForward) {
          runOneFastForwardSettlement(times);
        } else {
          for (let i = 0; i < times; i++) runOneProductionSettlement(i < settlementsWithFoodAlreadyApplied);
        }
      });
    });
  };

  // Core owns burg creation; the extension only enriches the newly created
  // settlement after it announces the completed promotion transaction.
  on("fmg:settlement-promoted", event => {
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
  });

  on(FUNERAL_DEMAND_EVENT, () => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    consumeFuneralMaterialsFromPending();
  });

  // Shipbuilding asks synchronously so it can only advance construction work that this
  // market can fund with every required material. No direct Shipbuilding import: the
  // mutable CustomEvent detail is the extension boundary.
  on("fmg:shipbuilding-materials-requested", e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (e as CustomEvent<unknown>).detail;
    if (!isShipbuildingMaterialRequest(detail)) return;
    detail.result = Markets.tryConsumeShipbuildingMaterials(detail.marketId, detail.materials, detail.timberCellId);
  });

  on("fmg:shipbuilding-ship-good-stock-request", e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (e as CustomEvent<unknown>).detail;
    if (!isShipbuildingShipGoodStockRequest(detail)) return;
    detail.result = Markets.getShipGoodStock(detail.marketId);
  });

  on("fmg:shipbuilding-surplus-ship-completed", e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (e as CustomEvent<unknown>).detail;
    if (!isShipbuildingSurplusShipRequest(detail)) return;
    detail.result = Markets.addSurplusShipStock(detail.marketId, detail.shipClassId);
  });

  on("fmg:shipbuilding-merchant-hulls-snapshot", e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (e as CustomEvent<unknown>).detail;
    if (!isShipbuildingMerchantHullsSnapshot(detail)) return;
    MerchantTransportAssets.reconcileMerchantHulls(detail.hulls);
    for (const hull of detail.hulls) recordMerchantHullOwnership(hull.id, hull.ownerId);
  });

  on("fmg:shipbuilding-merchant-hull-changed", e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (e as CustomEvent<unknown>).detail;
    if (!isShipbuildingMerchantHullsSnapshot({ hulls: [detail] })) return;
    MerchantTransportAssets.requestMerchantHullSnapshot();
  });

  on("fmg:shipbuilding-merchant-hulls-unavailable", () => MerchantTransportAssets.setWaterAssetModeActive(false));
  MerchantTransportAssets.requestMerchantHullSnapshot();

  // Shipbuilding only signals demand. Economy owns policy, payment, Deal, Caravan,
  // and delivery lifecycle after this extension boundary.
  on("fmg:shipbuilding-strategic-procurement-demand", e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (e as CustomEvent<unknown>).detail;
    if (!isShipbuildingStrategicProcurementDemand(detail)) return;
    StrategicProcurement.handleShipbuildingDemand(detail);
  });

  // New-map initial-stock warm-up only (§4.6). Unlike the reactive demand handler above, this
  // never spends treasury or spawns Caravans — it seeds market stock directly, once, from a
  // microtask Shipbuilding schedules right after this same fmg:generate-post-core pass generates
  // Goods/Markets/Production.
  on("fmg:shipbuilding-initial-stock-request", e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (e as CustomEvent<unknown>).detail;
    if (!isShipbuildingInitialStockRequest(detail)) return;
    seedShipbuildingInitialStock(detail.demands);
  });

  on("fmg:shipbuilding-strategic-procurement-status-request", e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const detail = (e as CustomEvent<unknown>).detail;
    if (!isShipbuildingProcurementStatusRequest(detail)) return;
    detail.result = StrategicProcurement.getShipbuildingProcurementStatus(detail.stateId, detail.destinationMarketId);
  });

  // Shipbuilding reports state ships trading on patrol and their crews; the goods and money move
  // here (navyTrade.ts, docs/plan/initial-wealth-calibration.md §8). Both run inside Shipbuilding's
  // tick, synchronously, so the money flows are attributed to that step.
  on("fmg:shipbuilding-voyage-trade", e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const { stateId, homeBurgId, buildPoints, deltaYears } = (e as CustomEvent).detail as {
      stateId: number;
      homeBurgId: number;
      buildPoints: number;
      deltaYears: number;
    };
    if (stateId) settleNavyVoyageTrade(stateId, homeBurgId, buildPoints, deltaYears);
  });
  on("fmg:shipbuilding-navy-payroll", e => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    const { stateId, homeBurgId, crew, deltaYears } = (e as CustomEvent).detail as {
      stateId: number;
      homeBurgId: number;
      crew: number;
      deltaYears: number;
    };
    if (stateId) payNavyCrew(stateId, homeBurgId, crew, deltaYears);
  });

  // Depleted cells recover a little on every advanceTime() call, independent of
  // whether Shipbuilding (or logging on that cell) is still active — a logged-out
  // shipyard's forest should eventually recover even if the extension is disabled
  // afterward. Harmless no-op while nothing has ever been depleted.
  let currentQuarterIndex = 0;
  // Annual State-led surveys replace the former global, omniscient pass. A
  // discovered unclaimed site is reported to Frontier; it is not mined until
  // ordinary expansion has incorporated it into a market area.
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
          run(context, writer);
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
    if (agricultureRefreshed && optionsStore.getState().ruralUrbanMigration === "megacity") {
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
    const tickDays = deltaDays + deltaMonths * MEAN_DAYS_PER_MONTH + deltaYears * MEAN_DAYS_PER_YEAR;
    // Fast-Forward Phase 4 (docs/plan/advance-time-fast-forward.md §8): defer the hire-board body to
    // a ~monthly cadence during a Fast-Forward bulk advance. Outside Fast-Forward nothing changes —
    // `effectiveDays`/`effectiveDeltaYears` keep their exact previous expressions and the body runs
    // every tick. Everything below is scaled by `effectiveDays`, so one batched call is the same
    // shape an Advance Month step already produces.
    const ffActive = context.fastAdvanceRates !== null;
    let hiringDaysAccumulated = getCadencePhase("fastAdvanceHiringDays");
    if (ffActive) {
      hiringDaysAccumulated += tickDays;
      setCadencePhase("fastAdvanceHiringDays", hiringDaysAccumulated);
      if (hiringDaysAccumulated < FAST_ADVANCE_COARSE_GATE_DAYS) return;
    }
    const effectiveDays = ffActive ? hiringDaysAccumulated : tickDays;
    const effectiveDeltaYears = ffActive
      ? hiringDaysAccumulated / MEAN_DAYS_PER_YEAR
      : deltaYears + deltaMonths / 12 + deltaDays / MEAN_DAYS_PER_YEAR;
    if (ffActive) setCadencePhase("fastAdvanceHiringDays", 0);
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
    const urbanMobility = context.fastAdvanceRates
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
    FortificationMastery.settleAnnual();
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

    const daysSinceLastProspecting = getCadencePhase("prospectingDays") + effectiveDays;
    setCadencePhase("prospectingDays", daysSinceLastProspecting % PROSPECTING_INTERVAL_DAYS);
    if (daysSinceLastProspecting >= PROSPECTING_INTERVAL_DAYS) {
      const discoveries = runStateProspecting(api, () => context.rng.rand());
      const reanchoredOperations = MineOperations.reanchorOperations();
      const openedOperations = MineOperations.openDiscoveredAccessibleOperations();
      if (discoveries || openedOperations || reanchoredOperations) SmelterOperations.generate();
    }
  });

  registerEconomyTickSystem("economy.foodCalendar", (context, _writer) => {
    const { years: deltaYears, months: deltaMonths, days: deltaDays } = context.delta;
    const effectiveDays = deltaDays + deltaMonths * 30 + deltaYears * 365;
    let daysSinceLastProduction = getCadencePhase("productionDays");
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
        measureTickStep("food:consumption", () => settleMonthlyFoodConsumption(settlementMonth));
        measureTickStep("food:production", () => FoodProduction.generateMonthlyLedger(settlementMonth));
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
    setCadencePhase("productionDays", daysSinceLastProduction);

    if (settledMonths > 0) {
      productionSettlementsDue += settledMonths;
      foodSettlementsAlreadyApplied += foodSettlementsThisTick;
      // Fast-Forward (docs/plan/advance-time-fast-forward.md §4.3(b)): captured here, the one place
      // in this chain that still has `context` (and therefore isBulkAdvance), for
      // scheduleProductionSettlement()'s microtask to read once it flushes. Food consumption
      // above is unaffected either way — it already ran for real, per due month, regardless of
      // Fast-Forward.
      productionSettlementsFastForward ||= context.fastAdvanceRates !== null;
      // Queue after all synchronous simulation systems have run, so logging events from
      // Shipbuilding (same tick, economy phase after this system by lexical id) are included.
      scheduleProductionSettlement();
    }
  });

  const unregisterMarketTerritorySystem = api.registerSimulationSystem({
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

  // The view rebuilt its layers for a loaded or regenerated map; upgrade the loaded economy data.
  on("fmg:map-layers-reinitialized", () => {
    if (!api.isExtensionEnabled(ECONOMY_EXTENSION_ID)) return;
    Goods.sync();
    Markets.sync();
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

  return () => {
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
    unregisterMarketTerritorySystem();
    unsubscribe();
    unregisterMapReadyTask();
    for (const [type, listener] of listeners) api.events.removeEventListener(type, listener);
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

    clearUrbanPregnancyBirthFloorRegistration();
    setFrontierSpendingPayee(null);
    unregisterPersonalCash();
    clearEconomyContext();
  };
}

export const economySimulation: SimulationExtension = {
  id: ECONOMY_EXTENSION_ID,
  requires: ["characters"],
  register
};
