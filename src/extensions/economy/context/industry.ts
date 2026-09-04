/**
 * Extraction and processing: minerals, quarries, salt, construction, smelting and metallurgy,
the chemistry / steam / electrical plant families, and dams and levees.
 *
 * Split out of the former single 2,452-line `economyContext.ts`, which had grown into a
 * 410-export module every one of this extension's ~180 files imported. `economyContext.ts` is now
 * a re-export barrel over these domain modules, so the public API is unchanged and no call site
 * moved. docs/plan/economy-coupling-audit.md T3.
 */

/**
 * Module-level context holder for the economy extension.
 * Populated once by init(api) in index.tsx; read by all economy sub-modules.
 *
 * This avoids direct host imports in sub-modules, which would create separate
 * module instances when the extension is loaded via a blob URL.
 */

import type {
  AcidPlant,
  ApothecaryWorkshop,
  ChemistryTrial,
  ChemMedPracticeRecord,
  ChlorinePlant,
  ExperimentalWorkshop,
  HospitalInstallation,
  MedicalCareReliefRow,
  MercuryPlant,
  OilRefineryPlant,
  PhosphateFertilizerPlant,
  SyntheticAmmoniaPlant
} from "../generators/chemistryTypes";
import type { ConstructionOperation } from "../generators/constructionEmploymentTypes";
import type { Dam, DamSite } from "../generators/damTypes";
import type { PowerStation, TelegraphLine } from "../generators/electricalTypes";
import type { ChlorAlkaliPlant, ElectrolysisPlant } from "../generators/electrolysisTypes";
import type { Levee, LeveeSite } from "../generators/leveeTypes";
import type {
  MetallurgAssetLedger,
  MetallurgMaterialForecast,
  MetallurgWorkOrder
} from "../generators/metallurgWorkTypes";
import type {
  MineOperation,
  MineralDeposit,
  MineralDistrict,
  MineralGeologicalProvince
} from "../generators/mineralResourcesTypes";
import type { QuarryOperation } from "../generators/quarryOperationsTypes";
import type { SaltShipment, Saltworks, StateSaltLedger } from "../generators/saltLogisticsTypes";
import type { SmelterOperation } from "../generators/smelterOperationsTypes";
import type { SmithingWorkshopLedger } from "../generators/smithingWorkshopLedgerTypes";
import type { RailwayLink, SteamInstallation, SteamPumpTrial } from "../generators/steamTypes";
import type { SteelConverterPlant } from "../generators/steelConverterTypes";
import type { VolcanicOperation } from "../generators/volcanicOperationsTypes";
import { getSliceArray, getSliceNumber, setSliceArray, setSliceNumber } from "./economyApi";

/** Static geological groundwork for future mine operations. */
export function getMineralGeologicalProvinces(): MineralGeologicalProvince[] {
  return getSliceArray<MineralGeologicalProvince>("mineralGeologicalProvinces");
}

export function setMineralGeologicalProvinces(provinces: readonly MineralGeologicalProvince[]): void {
  setSliceArray("mineralGeologicalProvinces", provinces);
}

export function getMineralDistricts(): MineralDistrict[] {
  return getSliceArray<MineralDistrict>("mineralDistricts");
}

export function setMineralDistricts(districts: readonly MineralDistrict[]): void {
  setSliceArray("mineralDistricts", districts);
}

export function getMineralDeposits(): MineralDeposit[] {
  return getSliceArray<MineralDeposit>("mineralDeposits");
}

export function setMineralDeposits(deposits: readonly MineralDeposit[]): void {
  setSliceArray("mineralDeposits", deposits);
}

export function getMineOperations(): MineOperation[] {
  return getSliceArray<MineOperation>("mineOperations");
}

export function setMineOperations(operations: readonly MineOperation[]): void {
  setSliceArray("mineOperations", operations);
}

/** Burg-anchored quarry sites (docs/plan/urban-construction-industry.md §3.2, Phase 1). */
export function getQuarryOperations(): QuarryOperation[] {
  return getSliceArray<QuarryOperation>("quarryOperations");
}

export function setQuarryOperations(operations: readonly QuarryOperation[]): void {
  setSliceArray("quarryOperations", operations);
}

/** State-owned salt sources and their latest monthly allocation records. */
export function getSaltworks(): Saltworks[] {
  return getSliceArray<Saltworks>("saltworks");
}

export function setSaltworks(operations: readonly Saltworks[]): void {
  setSliceArray("saltworks", operations);
}

export function getSaltShipments(): SaltShipment[] {
  return getSliceArray<SaltShipment>("saltShipments");
}

export function setSaltShipments(shipments: readonly SaltShipment[]): void {
  setSliceArray("saltShipments", shipments);
}

export function getStateSaltLedgers(): StateSaltLedger[] {
  return getSliceArray<StateSaltLedger>("stateSaltLedgers");
}

export function setStateSaltLedgers(ledgers: readonly StateSaltLedger[]): void {
  setSliceArray("stateSaltLedgers", ledgers);
}

/** Burg-anchored construction industry (docs/plan/urban-construction-industry.md §3.3, Phase 2). */
export function getConstructionOperations(): ConstructionOperation[] {
  return getSliceArray<ConstructionOperation>("constructionOperations");
}

export function setConstructionOperations(operations: readonly ConstructionOperation[]): void {
  setSliceArray("constructionOperations", operations);
}

export function getSteamPumpTrials(): SteamPumpTrial[] {
  return getSliceArray<SteamPumpTrial>("steamPumpTrials");
}

export function setSteamPumpTrials(trials: readonly SteamPumpTrial[]): void {
  setSliceArray("steamPumpTrials", trials);
}

export function getSteamInstallations(): SteamInstallation[] {
  return getSliceArray<SteamInstallation>("steamInstallations");
}

export function setSteamInstallations(installations: readonly SteamInstallation[]): void {
  setSliceArray("steamInstallations", installations);
}

export function getRailwayLinks(): RailwayLink[] {
  return getSliceArray<RailwayLink>("railwayLinks");
}

export function setRailwayLinks(links: readonly RailwayLink[]): void {
  setSliceArray("railwayLinks", links);
}

export function getExperimentalWorkshops(): ExperimentalWorkshop[] {
  return getSliceArray<ExperimentalWorkshop>("experimentalWorkshops");
}

export function setExperimentalWorkshops(rows: readonly ExperimentalWorkshop[]): void {
  setSliceArray("experimentalWorkshops", rows);
}

export function getApothecaryWorkshops(): ApothecaryWorkshop[] {
  return getSliceArray<ApothecaryWorkshop>("apothecaryWorkshops");
}

export function setApothecaryWorkshops(rows: readonly ApothecaryWorkshop[]): void {
  setSliceArray("apothecaryWorkshops", rows);
}

export function getChemistryTrials(): ChemistryTrial[] {
  return getSliceArray<ChemistryTrial>("chemistryTrials");
}

export function setChemistryTrials(rows: readonly ChemistryTrial[]): void {
  setSliceArray("chemistryTrials", rows);
}

export function getHospitalInstallations(): HospitalInstallation[] {
  return getSliceArray<HospitalInstallation>("hospitalInstallations");
}

export function setHospitalInstallations(rows: readonly HospitalInstallation[]): void {
  setSliceArray("hospitalInstallations", rows);
}

export function getAcidPlants(): AcidPlant[] {
  return getSliceArray<AcidPlant>("acidPlants");
}

export function setAcidPlants(rows: readonly AcidPlant[]): void {
  setSliceArray("acidPlants", rows);
}

export function getPhosphateFertilizerPlants(): PhosphateFertilizerPlant[] {
  return getSliceArray<PhosphateFertilizerPlant>("phosphateFertilizerPlants");
}

export function setPhosphateFertilizerPlants(rows: readonly PhosphateFertilizerPlant[]): void {
  setSliceArray("phosphateFertilizerPlants", rows);
}

/** Same shape as getAcidPlants/getPhosphateFertilizerPlants. Design: docs/plan/chlorine-production-vertical-slice.md §3.6. */
export function getChlorinePlants(): ChlorinePlant[] {
  return getSliceArray<ChlorinePlant>("chlorinePlants");
}

export function setChlorinePlants(rows: readonly ChlorinePlant[]): void {
  setSliceArray("chlorinePlants", rows);
}

/** Same shape as getAcidPlants/getPhosphateFertilizerPlants. Design: docs/plan/modern-steelmaking-and-high-pressure-apparatus.md §3.2. */
export function getSteelConverterPlants(): SteelConverterPlant[] {
  return getSliceArray<SteelConverterPlant>("steelConverterPlants");
}

export function setSteelConverterPlants(rows: readonly SteelConverterPlant[]): void {
  setSliceArray("steelConverterPlants", rows);
}

/** Same shape as getAcidPlants/getPhosphateFertilizerPlants. Design: docs/plan/synthetic-ammonia-vertical-slice.md §3.6. */
export function getSyntheticAmmoniaPlants(): SyntheticAmmoniaPlant[] {
  return getSliceArray<SyntheticAmmoniaPlant>("syntheticAmmoniaPlants");
}

export function setSyntheticAmmoniaPlants(rows: readonly SyntheticAmmoniaPlant[]): void {
  setSliceArray("syntheticAmmoniaPlants", rows);
}

/** Same shape as getAcidPlants/getSteelConverterPlants. Design: docs/plan/electric-power-and-telegraph.md §3.9. */
export function getPowerStations(): PowerStation[] {
  return getSliceArray<PowerStation>("powerStations");
}

export function setPowerStations(rows: readonly PowerStation[]): void {
  setSliceArray("powerStations", rows);
}

/** Same shape as getPowerStations. Design: docs/plan/electric-power-and-telegraph.md §3.9. */
export function getTelegraphLines(): TelegraphLine[] {
  return getSliceArray<TelegraphLine>("telegraphLines");
}

export function setTelegraphLines(rows: readonly TelegraphLine[]): void {
  setSliceArray("telegraphLines", rows);
}

/** Same shape as getPowerStations. Design: docs/plan/dam-flood-control-and-hydropower.md §3. */
export function getDamSites(): DamSite[] {
  return getSliceArray<DamSite>("damSites");
}

export function setDamSites(rows: readonly DamSite[]): void {
  setSliceArray("damSites", rows);
}

/** Same shape as getPowerStations. Design: docs/plan/dam-flood-control-and-hydropower.md §3. */
export function getDams(): Dam[] {
  return getSliceArray<Dam>("dams");
}

export function setDams(rows: readonly Dam[]): void {
  setSliceArray("dams", rows);
}

/** Same shape as getDamSites. Design: docs/plan/river-levee-and-flood-damage.md §3. */
export function getLeveeSites(): LeveeSite[] {
  return getSliceArray<LeveeSite>("leveeSites");
}

export function setLeveeSites(rows: readonly LeveeSite[]): void {
  setSliceArray("leveeSites", rows);
}

/** Same shape as getDams. Design: docs/plan/river-levee-and-flood-damage.md §3. */
export function getLevees(): Levee[] {
  return getSliceArray<Levee>("levees");
}

export function setLevees(rows: readonly Levee[]): void {
  setSliceArray("levees", rows);
}

/** Same shape as getPowerStations. Design: docs/plan/electrolytic-industry-vertical-slice.md §3.7. */
export function getElectrolysisPlants(): ElectrolysisPlant[] {
  return getSliceArray<ElectrolysisPlant>("electrolysisPlants");
}

export function setElectrolysisPlants(rows: readonly ElectrolysisPlant[]): void {
  setSliceArray("electrolysisPlants", rows);
}

/** Same shape as getElectrolysisPlants — a third supply route for Chlorine/Caustic Soda.
 *  Design: docs/plan/chlor-alkali-electrolysis-vertical-slice.md §3.7. */
export function getChlorAlkaliPlants(): ChlorAlkaliPlant[] {
  return getSliceArray<ChlorAlkaliPlant>("chlorAlkaliPlants");
}

export function setChlorAlkaliPlants(rows: readonly ChlorAlkaliPlant[]): void {
  setSliceArray("chlorAlkaliPlants", rows);
}

/** Same shape as getPhosphateFertilizerPlants. Design: docs/plan/cinnabar-mercury-vertical-slice.md §3.7. */
export function getMercuryPlants(): MercuryPlant[] {
  return getSliceArray<MercuryPlant>("mercuryPlants");
}

export function setMercuryPlants(rows: readonly MercuryPlant[]): void {
  setSliceArray("mercuryPlants", rows);
}

/**
 * Same shape as getMercuryPlants — the first plant that yields two Goods (Kerosene + Lubricating
 * Oil) from one input. Design: docs/plan/petroleum-and-internal-combustion-vertical-slice.md §3.7.
 */
export function getOilRefineryPlants(): OilRefineryPlant[] {
  return getSliceArray<OilRefineryPlant>("oilRefineryPlants");
}

export function setOilRefineryPlants(rows: readonly OilRefineryPlant[]): void {
  setSliceArray("oilRefineryPlants", rows);
}

export function getChemMedPracticeRecords(): ChemMedPracticeRecord[] {
  return getSliceArray<ChemMedPracticeRecord>("chemMedPracticeRecords");
}

export function setChemMedPracticeRecords(rows: readonly ChemMedPracticeRecord[]): void {
  setSliceArray("chemMedPracticeRecords", rows);
}

export function getMedicalCareReliefByBurg(): MedicalCareReliefRow[] {
  return getSliceArray<MedicalCareReliefRow>("medicalCareReliefByBurg");
}

export function setMedicalCareReliefByBurg(rows: readonly MedicalCareReliefRow[]): void {
  setSliceArray("medicalCareReliefByBurg", rows);
}

/**
 * Burg-anchored volcanic works sites, yielding Volcanic Ash/Sulfur/Obsidian from one shared
 * workforce (docs/plan/urban-construction-industry.md §3.4, docs/plan/volcanic-biome-goods.md §3.3).
 */
export function getVolcanicOperations(): VolcanicOperation[] {
  return getSliceArray<VolcanicOperation>("volcanicOperations");
}

export function setVolcanicOperations(operations: readonly VolcanicOperation[]): void {
  setSliceArray("volcanicOperations", operations);
}

export function getSmelterOperations(): SmelterOperation[] {
  return getSliceArray<SmelterOperation>("smelterOperations");
}

export function setSmelterOperations(operations: readonly SmelterOperation[]): void {
  setSliceArray("smelterOperations", operations);
}

/** Current-cycle material, sales, profit, and master-wage records for metallurgy workshops. */
export function getSmithingWorkshopLedgers(): SmithingWorkshopLedger[] {
  return getSliceArray<SmithingWorkshopLedger>("smithingWorkshopLedgers");
}

export function setSmithingWorkshopLedgers(ledgers: readonly SmithingWorkshopLedger[]): void {
  setSliceArray("smithingWorkshopLedgers", ledgers);
}

/** Demand-only Metallurg planning state. Fulfillment remains in the generic production flow for now. */
export function getMetallurgAssetLedgers(): MetallurgAssetLedger[] {
  return getSliceArray<MetallurgAssetLedger>("metallurgAssetLedgers");
}

export function setMetallurgAssetLedgers(ledgers: readonly MetallurgAssetLedger[]): void {
  setSliceArray("metallurgAssetLedgers", ledgers);
}

export function getMetallurgWorkOrders(): MetallurgWorkOrder[] {
  return getSliceArray<MetallurgWorkOrder>("metallurgWorkOrders");
}

export function setMetallurgWorkOrders(orders: readonly MetallurgWorkOrder[]): void {
  setSliceArray("metallurgWorkOrders", orders);
}

export function getMetallurgMaterialForecasts(): MetallurgMaterialForecast[] {
  return getSliceArray<MetallurgMaterialForecast>("metallurgMaterialForecasts");
}

export function setMetallurgMaterialForecasts(forecasts: readonly MetallurgMaterialForecast[]): void {
  setSliceArray("metallurgMaterialForecasts", forecasts);
}

export function getMetallurgNextWorkOrderId(): number {
  return getSliceNumber("nextMetallurgWorkOrderId");
}

export function setMetallurgNextWorkOrderId(id: number): void {
  setSliceNumber("nextMetallurgWorkOrderId", id);
}

/** Version marker for one-time Metallurg work-queue migrations in persisted saves. */
export function getMetallurgToolsUnitScaleVersion(): number {
  return getSliceNumber("metallurgToolsUnitScaleVersion");
}

export function setMetallurgToolsUnitScaleVersion(version: number): void {
  setSliceNumber("metallurgToolsUnitScaleVersion", version);
}
