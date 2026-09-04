/**
 * Once-per-simulation-year settle gates. One `<system>LastSettledYear` pair per annual subsystem,
all following the same read/compare/write shape — the duplication T2 folds into a shared registry.
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

import { getEconomySlice, registerContextFallbackReset, writeYearToSlice, yearFromSlice } from "./economyApi";

let _settlementDevelopmentLastEvaluatedYearFallback: number | null = null;

let _agTechLastSettledYearFallback: number | null = null;

let _industrialTechLastSettledYearFallback: number | null = null;

let _guildKnowledgeLastSettledYearFallback: number | null = null;

let _guildChaptersLastSettledYearFallback: number | null = null;

let _academyKnowledgeLastSettledYearFallback: number | null = null;

let _stateSecretLastSettledYearFallback: number | null = null;

let _martialDisciplineLastSettledYearFallback: number | null = null;

let _martialIndividualMasteryLastSettledYearFallback: number | null = null;

let _guildSuccessionLastSettledYearFallback: number | null = null;

let _burgTreasuryLastSettledYearFallback: number | null = null;

let _innFacilitiesLastSettledYearFallback: number | null = null;

let _urbanWaterLastSettledYearFallback: number | null = null;

let _steamInstallationsLastSettledYearFallback: number | null = null;

let _apothecaryWorkshopsLastSettledYearFallback: number | null = null;

let _experimentalWorkshopsLastSettledYearFallback: number | null = null;

let _hospitalInstallationsLastSettledYearFallback: number | null = null;

let _acidPlantsLastSettledYearFallback: number | null = null;

let _chlorinePlantsLastSettledYearFallback: number | null = null;

let _phosphateFertilizerPlantsLastSettledYearFallback: number | null = null;

let _steelConverterPlantsLastSettledYearFallback: number | null = null;

let _fertilizerInvestmentLastSettledYearFallback: number | null = null;

let _syntheticAmmoniaPlantsLastSettledYearFallback: number | null = null;

let _nitrogenFertilizerInvestmentLastSettledYearFallback: number | null = null;

let _powerStationsLastSettledYearFallback: number | null = null;

let _telegraphLinesLastSettledYearFallback: number | null = null;

let _electrolysisPlantsLastSettledYearFallback: number | null = null;

let _chlorAlkaliPlantsLastSettledYearFallback: number | null = null;

let _mercuryPlantsLastSettledYearFallback: number | null = null;

let _oilRefineryPlantsLastSettledYearFallback: number | null = null;

let _powerGridInvestmentLastSettledYearFallback: number | null = null;

let _damsLastSettledYearFallback: number | null = null;

let _leveesLastSettledYearFallback: number | null = null;

let _faunaPopulationLastSettledYearFallback: number | null = null;

let _greatLibraryLastSettledYearFallback: number | null = null;

let _climateDisastersLastSettledYearFallback: number | null = null;

export function getSettlementDevelopmentLastEvaluatedYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.settlementDevelopmentLastEvaluatedYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _settlementDevelopmentLastEvaluatedYearFallback;
}

export function setSettlementDevelopmentLastEvaluatedYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.settlementDevelopmentLastEvaluatedYear = year;
    return;
  }
  _settlementDevelopmentLastEvaluatedYearFallback = year;
}

export function clearSettlementDevelopmentLastEvaluatedYear(): void {
  const slice = getEconomySlice();
  if (slice) {
    delete slice.settlementDevelopmentLastEvaluatedYear;
    return;
  }
  _settlementDevelopmentLastEvaluatedYearFallback = null;
}

/**
 * Guards AgTechInvestment.settleAnnual() to run at most once per simulation year, the same way
 * getSettlementDevelopmentLastEvaluatedYear guards updateAnnualAgriculture (docs/plan/rural-agtech-investment.md §3.3).
 */
export function getAgTechLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.agTechLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _agTechLastSettledYearFallback;
}

export function setAgTechLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.agTechLastSettledYear = year;
    return;
  }
  _agTechLastSettledYearFallback = year;
}

/** Same guard as getAgTechLastSettledYear, for IndustrialTechInvestment.settleAnnual() (docs/plan/rural-agtech-investment.md §6.2). */
export function getIndustrialTechLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.industrialTechLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _industrialTechLastSettledYearFallback;
}

export function setIndustrialTechLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.industrialTechLastSettledYear = year;
    return;
  }
  _industrialTechLastSettledYearFallback = year;
}

/** Same guard as getAgTechLastSettledYear, for GuildKnowledge.settleAnnual() (docs/plan/knowledge-guild-system.md §9 Phase 1). */
export function getGuildKnowledgeLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.guildKnowledgeLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _guildKnowledgeLastSettledYearFallback;
}

export function setGuildKnowledgeLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.guildKnowledgeLastSettledYear = year;
    return;
  }
  _guildKnowledgeLastSettledYearFallback = year;
}

/** Independent annual guard for formal GuildChapter placement. */
export function getGuildChaptersLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.guildChaptersLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _guildChaptersLastSettledYearFallback;
}

export function setGuildChaptersLastSettledYear(year: number | null): void {
  const slice = getEconomySlice();
  if (slice) {
    if (year === null) delete slice.guildChaptersLastSettledYear;
    else slice.guildChaptersLastSettledYear = year;
    return;
  }
  _guildChaptersLastSettledYearFallback = year;
}

/** Same guard as getGuildKnowledgeLastSettledYear, for AcademyKnowledge.settleAnnual() (docs/plan/knowledge-guild-system.md §9 Phase 3). */
export function getAcademyKnowledgeLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.academyKnowledgeLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _academyKnowledgeLastSettledYearFallback;
}

export function setAcademyKnowledgeLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.academyKnowledgeLastSettledYear = year;
    return;
  }
  _academyKnowledgeLastSettledYearFallback = year;
}

/** Same guard as getGuildKnowledgeLastSettledYear, for StateSecretKnowledge.settleAnnual() (docs/plan/knowledge-guild-system.md §9 Phase 4). */
export function getStateSecretLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.stateSecretLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _stateSecretLastSettledYearFallback;
}

export function setStateSecretLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.stateSecretLastSettledYear = year;
    return;
  }
  _stateSecretLastSettledYearFallback = year;
}

/** Same guard as getGuildKnowledgeLastSettledYear, for MartialDisciplineKnowledge.settleAnnual() (docs/plan/knowledge-guild-system.md §9 Phase 5). */
export function getMartialDisciplineLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.martialDisciplineLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _martialDisciplineLastSettledYearFallback;
}

export function setMartialDisciplineLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.martialDisciplineLastSettledYear = year;
    return;
  }
  _martialDisciplineLastSettledYearFallback = year;
}

/** Once-per-year guard for individual commander practice, after MartialDisciplineStock settles. */
export function getMartialIndividualMasteryLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.martialIndividualMasteryLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _martialIndividualMasteryLastSettledYearFallback;
}

export function setMartialIndividualMasteryLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.martialIndividualMasteryLastSettledYear = year;
    return;
  }
  _martialIndividualMasteryLastSettledYearFallback = year;
}

/** Same guard as getGuildKnowledgeLastSettledYear, for GuildSuccession.settleAnnual() (docs/plan/knowledge-guild-system.md §9 Phase 6). */
export function getGuildSuccessionLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.guildSuccessionLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _guildSuccessionLastSettledYearFallback;
}

export function setGuildSuccessionLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.guildSuccessionLastSettledYear = year;
    return;
  }
  _guildSuccessionLastSettledYearFallback = year;
}

/** Same guard as getGuildKnowledgeLastSettledYear, for GuildTreasury.settleAnnual() (docs/plan/burg-treasury-equilibrium.md §3.3). */
export function getBurgTreasuryLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.burgTreasuryLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _burgTreasuryLastSettledYearFallback;
}

export function setBurgTreasuryLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.burgTreasuryLastSettledYear = year;
    return;
  }
  _burgTreasuryLastSettledYearFallback = year;
}

/** Once-per-simulation-year guard for InnFacilities.settleAnnual(). */
export function getInnFacilitiesLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.innFacilitiesLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _innFacilitiesLastSettledYearFallback;
}

export function setInnFacilitiesLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.innFacilitiesLastSettledYear = year;
    return;
  }
  _innFacilitiesLastSettledYearFallback = year;
}

/** Once-per-simulation-year guard for UrbanWater.settleAnnual(). */
export function getUrbanWaterLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.urbanWaterLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _urbanWaterLastSettledYearFallback;
}

export function setUrbanWaterLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.urbanWaterLastSettledYear = year;
    return;
  }
  _urbanWaterLastSettledYearFallback = year;
}

export function getSteamInstallationsLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.steamInstallationsLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _steamInstallationsLastSettledYearFallback;
}

export function setSteamInstallationsLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.steamInstallationsLastSettledYear = year;
    return;
  }
  _steamInstallationsLastSettledYearFallback = year;
}

export function getApothecaryWorkshopsLastSettledYear(): number | null {
  return yearFromSlice("apothecaryWorkshopsLastSettledYear", _apothecaryWorkshopsLastSettledYearFallback);
}

export function setApothecaryWorkshopsLastSettledYear(year: number): void {
  writeYearToSlice("apothecaryWorkshopsLastSettledYear", year, value => {
    _apothecaryWorkshopsLastSettledYearFallback = value;
  });
}

export function getExperimentalWorkshopsLastSettledYear(): number | null {
  return yearFromSlice("experimentalWorkshopsLastSettledYear", _experimentalWorkshopsLastSettledYearFallback);
}

export function setExperimentalWorkshopsLastSettledYear(year: number): void {
  writeYearToSlice("experimentalWorkshopsLastSettledYear", year, value => {
    _experimentalWorkshopsLastSettledYearFallback = value;
  });
}

export function getHospitalInstallationsLastSettledYear(): number | null {
  return yearFromSlice("hospitalInstallationsLastSettledYear", _hospitalInstallationsLastSettledYearFallback);
}

export function setHospitalInstallationsLastSettledYear(year: number): void {
  writeYearToSlice("hospitalInstallationsLastSettledYear", year, value => {
    _hospitalInstallationsLastSettledYearFallback = value;
  });
}

export function getAcidPlantsLastSettledYear(): number | null {
  return yearFromSlice("acidPlantsLastSettledYear", _acidPlantsLastSettledYearFallback);
}

export function setAcidPlantsLastSettledYear(year: number): void {
  writeYearToSlice("acidPlantsLastSettledYear", year, value => {
    _acidPlantsLastSettledYearFallback = value;
  });
}

export function getPhosphateFertilizerPlantsLastSettledYear(): number | null {
  return yearFromSlice("phosphateFertilizerPlantsLastSettledYear", _phosphateFertilizerPlantsLastSettledYearFallback);
}

export function setPhosphateFertilizerPlantsLastSettledYear(year: number): void {
  writeYearToSlice("phosphateFertilizerPlantsLastSettledYear", year, value => {
    _phosphateFertilizerPlantsLastSettledYearFallback = value;
  });
}

/** Guards ChlorinePlants.settleAnnual(), same shape as getAcidPlantsLastSettledYear. */
export function getChlorinePlantsLastSettledYear(): number | null {
  return yearFromSlice("chlorinePlantsLastSettledYear", _chlorinePlantsLastSettledYearFallback);
}

export function setChlorinePlantsLastSettledYear(year: number): void {
  writeYearToSlice("chlorinePlantsLastSettledYear", year, value => {
    _chlorinePlantsLastSettledYearFallback = value;
  });
}

/** Guards SteelConverters.settleAnnual(), same shape as getAcidPlantsLastSettledYear. */
export function getSteelConverterPlantsLastSettledYear(): number | null {
  return yearFromSlice("steelConverterPlantsLastSettledYear", _steelConverterPlantsLastSettledYearFallback);
}

export function setSteelConverterPlantsLastSettledYear(year: number): void {
  writeYearToSlice("steelConverterPlantsLastSettledYear", year, value => {
    _steelConverterPlantsLastSettledYearFallback = value;
  });
}

/** Guards SyntheticAmmoniaPlants.settleAnnual(), same shape as getPhosphateFertilizerPlantsLastSettledYear. */
export function getSyntheticAmmoniaPlantsLastSettledYear(): number | null {
  return yearFromSlice("syntheticAmmoniaPlantsLastSettledYear", _syntheticAmmoniaPlantsLastSettledYearFallback);
}

export function setSyntheticAmmoniaPlantsLastSettledYear(year: number): void {
  writeYearToSlice("syntheticAmmoniaPlantsLastSettledYear", year, value => {
    _syntheticAmmoniaPlantsLastSettledYearFallback = value;
  });
}

/** Guards FertilizerInvestment.settleAnnual(), same shape as getAgTechLastSettledYear. */
export function getFertilizerInvestmentLastSettledYear(): number | null {
  return yearFromSlice("fertilizerInvestmentLastSettledYear", _fertilizerInvestmentLastSettledYearFallback);
}

export function setFertilizerInvestmentLastSettledYear(year: number): void {
  writeYearToSlice("fertilizerInvestmentLastSettledYear", year, value => {
    _fertilizerInvestmentLastSettledYearFallback = value;
  });
}

/** Guards NitrogenFertilizerInvestment.settleAnnual(), same shape as getFertilizerInvestmentLastSettledYear. */
export function getNitrogenFertilizerInvestmentLastSettledYear(): number | null {
  return yearFromSlice(
    "nitrogenFertilizerInvestmentLastSettledYear",
    _nitrogenFertilizerInvestmentLastSettledYearFallback
  );
}

export function setNitrogenFertilizerInvestmentLastSettledYear(year: number): void {
  writeYearToSlice("nitrogenFertilizerInvestmentLastSettledYear", year, value => {
    _nitrogenFertilizerInvestmentLastSettledYearFallback = value;
  });
}

/** Guards PowerStations.settleAnnual(), same shape as getSteelConverterPlantsLastSettledYear. */
export function getPowerStationsLastSettledYear(): number | null {
  return yearFromSlice("powerStationsLastSettledYear", _powerStationsLastSettledYearFallback);
}

export function setPowerStationsLastSettledYear(year: number): void {
  writeYearToSlice("powerStationsLastSettledYear", year, value => {
    _powerStationsLastSettledYearFallback = value;
  });
}

/** Guards TelegraphLines.settleAnnual(), same shape as getPowerStationsLastSettledYear. */
export function getTelegraphLinesLastSettledYear(): number | null {
  return yearFromSlice("telegraphLinesLastSettledYear", _telegraphLinesLastSettledYearFallback);
}

export function setTelegraphLinesLastSettledYear(year: number): void {
  writeYearToSlice("telegraphLinesLastSettledYear", year, value => {
    _telegraphLinesLastSettledYearFallback = value;
  });
}

/**
 * Guards ElectrolysisPlants.settleAnnual(), same shape as getTelegraphLinesLastSettledYear.
 * Design: docs/plan/electrolytic-industry-vertical-slice.md §3.7.
 */
export function getElectrolysisPlantsLastSettledYear(): number | null {
  return yearFromSlice("electrolysisPlantsLastSettledYear", _electrolysisPlantsLastSettledYearFallback);
}

export function setElectrolysisPlantsLastSettledYear(year: number): void {
  writeYearToSlice("electrolysisPlantsLastSettledYear", year, value => {
    _electrolysisPlantsLastSettledYearFallback = value;
  });
}

/**
 * Guards ChlorAlkaliPlants.settleAnnual(), same shape as getElectrolysisPlantsLastSettledYear.
 * Design: docs/plan/chlor-alkali-electrolysis-vertical-slice.md §3.7.
 */
export function getChlorAlkaliPlantsLastSettledYear(): number | null {
  return yearFromSlice("chlorAlkaliPlantsLastSettledYear", _chlorAlkaliPlantsLastSettledYearFallback);
}

export function setChlorAlkaliPlantsLastSettledYear(year: number): void {
  writeYearToSlice("chlorAlkaliPlantsLastSettledYear", year, value => {
    _chlorAlkaliPlantsLastSettledYearFallback = value;
  });
}

/**
 * Guards MercuryPlants.settleAnnual(), same shape as getChlorAlkaliPlantsLastSettledYear.
 * Design: docs/plan/cinnabar-mercury-vertical-slice.md §3.7.
 */
export function getMercuryPlantsLastSettledYear(): number | null {
  return yearFromSlice("mercuryPlantsLastSettledYear", _mercuryPlantsLastSettledYearFallback);
}

export function setMercuryPlantsLastSettledYear(year: number): void {
  writeYearToSlice("mercuryPlantsLastSettledYear", year, value => {
    _mercuryPlantsLastSettledYearFallback = value;
  });
}

/**
 * Guards OilRefineryPlants.settleAnnual(), same shape as getMercuryPlantsLastSettledYear.
 * Design: docs/plan/petroleum-and-internal-combustion-vertical-slice.md §3.7.
 */
export function getOilRefineryPlantsLastSettledYear(): number | null {
  return yearFromSlice("oilRefineryPlantsLastSettledYear", _oilRefineryPlantsLastSettledYearFallback);
}

export function setOilRefineryPlantsLastSettledYear(year: number): void {
  writeYearToSlice("oilRefineryPlantsLastSettledYear", year, value => {
    _oilRefineryPlantsLastSettledYearFallback = value;
  });
}

/** Guards PowerGridInvestment.settleAnnual(), same shape as getFertilizerInvestmentLastSettledYear. */
export function getPowerGridInvestmentLastSettledYear(): number | null {
  return yearFromSlice("powerGridInvestmentLastSettledYear", _powerGridInvestmentLastSettledYearFallback);
}

export function setPowerGridInvestmentLastSettledYear(year: number): void {
  writeYearToSlice("powerGridInvestmentLastSettledYear", year, value => {
    _powerGridInvestmentLastSettledYearFallback = value;
  });
}

/** Guards Dams.settleAnnual(). Design: docs/plan/dam-flood-control-and-hydropower.md §3. */
export function getDamsLastSettledYear(): number | null {
  return yearFromSlice("damsLastSettledYear", _damsLastSettledYearFallback);
}

export function setDamsLastSettledYear(year: number): void {
  writeYearToSlice("damsLastSettledYear", year, value => {
    _damsLastSettledYearFallback = value;
  });
}

/** Guards Levees.settleAnnual(). Design: docs/plan/river-levee-and-flood-damage.md §3. */
export function getLeveesLastSettledYear(): number | null {
  return yearFromSlice("leveesLastSettledYear", _leveesLastSettledYearFallback);
}

export function setLeveesLastSettledYear(year: number): void {
  writeYearToSlice("leveesLastSettledYear", year, value => {
    _leveesLastSettledYearFallback = value;
  });
}

/** Guards ClimateDisasters.settleAnnual(). Design: docs/plan/climate-disaster-drought.md §3.1. */
export function getClimateDisastersLastSettledYear(): number | null {
  return yearFromSlice("climateDisastersLastSettledYear", _climateDisastersLastSettledYearFallback);
}

export function setClimateDisastersLastSettledYear(year: number): void {
  writeYearToSlice("climateDisastersLastSettledYear", year, value => {
    _climateDisastersLastSettledYearFallback = value;
  });
}

/**
 * Once-per-simulation-year guard for FaunaPopulation.updateAnnualFaunaCohorts()
 * (docs/plan/biome-goods-producer-ecosystem.md §4, Phase 2). Independent of
 * getSettlementDevelopmentLastEvaluatedYear so the (heavier, togglable) fauna cohort update can be
 * skipped without disturbing agriculture's own annual cadence.
 */
export function getFaunaPopulationLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.faunaPopulationLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _faunaPopulationLastSettledYearFallback;
}

export function setFaunaPopulationLastSettledYear(year: number): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.faunaPopulationLastSettledYear = year;
    return;
  }
  _faunaPopulationLastSettledYearFallback = year;
}

/** Once-per-year guard for GreatLibrary.settleAnnual() (docs/plan/great-library.md 年次フロー). */
export function getGreatLibraryLastSettledYear(): number | null {
  const slice = getEconomySlice();
  if (slice) {
    const value = slice.greatLibraryLastSettledYear;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return _greatLibraryLastSettledYearFallback;
}

export function setGreatLibraryLastSettledYear(year: number | null): void {
  const slice = getEconomySlice();
  if (slice) {
    if (year === null) delete slice.greatLibraryLastSettledYear;
    else slice.greatLibraryLastSettledYear = year;
    return;
  }
  _greatLibraryLastSettledYearFallback = year;
}

registerContextFallbackReset(() => {
  _settlementDevelopmentLastEvaluatedYearFallback = null;
  _agTechLastSettledYearFallback = null;
  _industrialTechLastSettledYearFallback = null;
  _guildKnowledgeLastSettledYearFallback = null;
  _guildChaptersLastSettledYearFallback = null;
  _academyKnowledgeLastSettledYearFallback = null;
  _stateSecretLastSettledYearFallback = null;
  _martialDisciplineLastSettledYearFallback = null;
  _martialIndividualMasteryLastSettledYearFallback = null;
  _guildSuccessionLastSettledYearFallback = null;
  _burgTreasuryLastSettledYearFallback = null;
  _innFacilitiesLastSettledYearFallback = null;
  _urbanWaterLastSettledYearFallback = null;
  _steamInstallationsLastSettledYearFallback = null;
  _apothecaryWorkshopsLastSettledYearFallback = null;
  _experimentalWorkshopsLastSettledYearFallback = null;
  _hospitalInstallationsLastSettledYearFallback = null;
  _acidPlantsLastSettledYearFallback = null;
  _chlorinePlantsLastSettledYearFallback = null;
  _phosphateFertilizerPlantsLastSettledYearFallback = null;
  _steelConverterPlantsLastSettledYearFallback = null;
  _fertilizerInvestmentLastSettledYearFallback = null;
  _syntheticAmmoniaPlantsLastSettledYearFallback = null;
  _nitrogenFertilizerInvestmentLastSettledYearFallback = null;
  _powerStationsLastSettledYearFallback = null;
  _telegraphLinesLastSettledYearFallback = null;
  _electrolysisPlantsLastSettledYearFallback = null;
  _chlorAlkaliPlantsLastSettledYearFallback = null;
  _mercuryPlantsLastSettledYearFallback = null;
  _oilRefineryPlantsLastSettledYearFallback = null;
  _powerGridInvestmentLastSettledYearFallback = null;
  _damsLastSettledYearFallback = null;
  _leveesLastSettledYearFallback = null;
  _faunaPopulationLastSettledYearFallback = null;
  _greatLibraryLastSettledYearFallback = null;
  _climateDisastersLastSettledYearFallback = null;
});
