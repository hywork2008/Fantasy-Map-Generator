/**
 * Host-owned annual technology graph evaluator.
 * Design: docs/plan/technology-development-roadmap.md §12–§13 (Phases 1–3).
 *
 * Reads pack + optional extension slices as plain data (no extension module imports).
 * Effects are exposed via pure query helpers consumed by Economy / Shipbuilding.
 */

import { simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import { isGunpowderEraEnabled } from "../utils/gunpowderEra";
import { getTechnologyDevelopmentSpeed } from "../utils/technologyDevelopmentSpeed";
import {
  getTechnologyRequirementEase,
  meetsTechnologyRequirement,
  type TechnologyRequirementKind
} from "../utils/technologyRequirementEase";
import { getActiveTechnologyDefinitions, getTechnologyDefinition } from "./technologyDefinitions";
import {
  createEmptyTechnologySimulationState,
  isTechnologyStageAtLeast,
  progressKey,
  type TechnologyDefinition,
  type TechnologyProgress,
  type TechnologyScope,
  type TechnologySignalKey,
  type TechnologySignals,
  type TechnologySimulationState,
  type TechnologyStage,
  type TechnologyThresholds,
  technologyStageRank
} from "./technologyTypes";

/**
 * Knowledge-ratio mins a live TechnologyHint may treat as met on the known stage.
 * Counts, amounts, and physical pressures (mineDrainagePressure, sanitation, …) stay required.
 */
export const HINTABLE_KNOWN_RATIO_KEYS = [
  "experimentRecord",
  "administration",
  "printing",
  "naturalPhilosophy",
  "metallurgy",
  "woodworking",
  "masonry",
  "instruments",
  "glassware",
  "medicine",
  "pyrotechnics"
] as const satisfies readonly (keyof TechnologySignals)[];

const HINTABLE_KNOWN_RATIO_KEY_SET: ReadonlySet<keyof TechnologySignals> = new Set(HINTABLE_KNOWN_RATIO_KEYS);

const DIFFUSION_ANNUAL_GAIN = 0.15;
/** Demonstrated blackPowder without war can still advance if treasury demand is high. */
const WAR_OPTIONAL_TREASURY = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStockArray(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

function ensureTechnologyState(): TechnologySimulationState {
  if (!simulationContext.technology || typeof simulationContext.technology !== "object") {
    simulationContext.technology = createEmptyTechnologySimulationState();
  }
  const tech = simulationContext.technology;
  if (!Array.isArray(tech.progress)) tech.progress = [];
  if (tech.lastEvaluatedYear !== null && typeof tech.lastEvaluatedYear !== "number") {
    tech.lastEvaluatedYear = null;
  }
  return tech;
}

export function getTechnologyState(): TechnologySimulationState {
  const tech = ensureTechnologyState();
  // Older archives / mid-session loads may lack rows until the first annual tick.
  // Seed the start profile lazily so ship/gunpowder queries see medieval baselines.
  if (tech.progress.length === 0 && (worldContext.pack?.states?.length ?? 0) > 1) {
    seedTechnologyStartProfile(simulationContext.currentYear);
  }
  return tech;
}

export function resetTechnologyProgress(): void {
  simulationContext.technology = createEmptyTechnologySimulationState();
}

export function getTechnologyProgressEntries(): readonly TechnologyProgress[] {
  return getTechnologyState().progress;
}

export function getTechnologyStage(
  technologyId: string,
  ownerId: number,
  scope: TechnologyScope = "state"
): TechnologyStage {
  const entry = getTechnologyState().progress.find(
    p => p.technologyId === technologyId && p.ownerId === ownerId && p.scope === scope
  );
  return entry?.stage ?? "locked";
}

export function isTechnologyAtLeast(
  technologyId: string,
  ownerId: number,
  minimum: TechnologyStage,
  scope: TechnologyScope = "state"
): boolean {
  return isTechnologyStageAtLeast(getTechnologyStage(technologyId, ownerId, scope), minimum);
}

/**
 * Multiplier on military gunpowder demand (lower = more efficient chemistry/logistics).
 * Pre-demonstration programs waste powder; adopted corned powder / mass firearms improve on baseline.
 */
export function getGunpowderDemandTechMultiplier(stateId: number): number {
  if (!isGunpowderEraEnabled(worldContext.options)) return 0;
  const black = getTechnologyStage("blackPowder", stateId);
  const corned = getTechnologyStage("cornedPowder", stateId);
  const mass = getTechnologyStage("massFirearms", stateId);
  if (isTechnologyStageAtLeast(mass, "adopted")) return 0.85;
  if (isTechnologyStageAtLeast(corned, "adopted")) return 0.9;
  if (isTechnologyStageAtLeast(corned, "demonstrated")) return 0.95;
  if (isTechnologyStageAtLeast(black, "adopted")) return 1;
  if (isTechnologyStageAtLeast(black, "demonstrated")) return 1.1;
  if (isTechnologyStageAtLeast(black, "known")) return 1.25;
  return 1.4;
}

/** Whether a state has the minimum technical knowledge to produce distilled liquor. */
export function isDistillationKnown(stateId: number): boolean {
  return isTechnologyAtLeast("distillation", stateId, "known");
}

/**
 * Highest ship class tier (0 sloop / 1 caravel / 2 galleon) allowed by the tech graph.
 * Tech points still apply separately in Shipbuilding.
 */
export function getMaxShipClassTierForState(stateId: number): number {
  if (isTechnologyAtLeast("coastalSteamNavigation", stateId, "demonstrated")) return 3;
  const hulls = getTechnologyStage("oceanGoingHulls", stateId);
  const navigation = getTechnologyStage("oceanNavigation", stateId);
  if (isTechnologyStageAtLeast(hulls, "adopted") && isTechnologyStageAtLeast(navigation, "known")) {
    return 2;
  }
  if (isTechnologyStageAtLeast(hulls, "demonstrated")) {
    return 1;
  }
  return 0;
}

/**
 * Local uptake of four-course rotation. Demonstration represents a limited trial,
 * while adoption and diffusion make the clover ley part of the normal field plan.
 */
export function getFourCourseRotationEffect(stateId: number): number {
  const stage = getTechnologyStage("fourCourseRotation", stateId);
  if (stage === "diffused") return 1;
  if (stage === "adopted") return 0.75;
  if (stage === "demonstrated") return 0.35;
  return 0;
}

/**
 * How much atmospheric steam pumping supplements a state's mine drainage (0..1).
 * Demonstration is a single trial engine; adoption/diffusion are working installations.
 */
export function getAtmosphericSteamPumpingEffect(stateId: number): number {
  const stage = getTechnologyStage("atmosphericSteamPumping", stateId);
  if (stage === "diffused") return 1;
  if (stage === "adopted") return 0.75;
  if (stage === "demonstrated") return 0.35;
  return 0;
}

/** Extra drainage credit (0..0.5) applied on top of a mine's physical drainage works. */
export function getAtmosphericSteamDrainageBonus(stateId: number): number {
  return getAtmosphericSteamPumpingEffect(stateId) * 0.5;
}

type HistoricalPeriod = NonNullable<typeof worldContext.options.historicalPeriod>;

/**
 * Gunpowder-chain technologies (ERA_2, technologyDefinitions.ts) all ship with no `startStage` of
 * their own — every state begins "locked" and must organically climb known -> demonstrated ->
 * adopted via settleTechnologyAnnual()/advanceStage(), regardless of the map's historicalPeriod.
 * That means picking "Age of Exploration" never gave states credit for gunpowder chemistry and
 * cannon-founding already being established, widely known science by ~1450-1600 — a state started
 * exactly as ignorant of it as an earlyMedieval one. This only raises the starting FLOOR:
 * advanceStage() never regresses a stage (see its own comment), so a seeded "known"/"demonstrated"
 * start still lets a well-run state climb further toward "adopted"/"diffused" through play; it
 * just stops re-deriving the same secrecy premise from scratch on every map regardless of period.
 * - earlyMedieval / highMedieval: unchanged ("locked") — gunpowder weapons predate neither period
 *   in most real timelines; if gunpowderEraEnabled is manually turned on this early, it should
 *   still feel like a freshly invented, closely guarded curiosity.
 * - lateMedieval (~1300-1450): "known" — hand cannons and early bombards existed and were
 *   documented, but remained rare, crude, and far from standardized.
 * - ageOfExploration (~1450-1600, the default period): "demonstrated" — corned powder and cast
 *   bronze/iron cannon-founding were proven, widely circulated knowledge across Western Europe by
 *   this point; a state still has to invest to reach "adopted" (efficient mass production).
 */
const GUNPOWDER_ERA2_START_STAGE_BY_PERIOD: Readonly<Partial<Record<HistoricalPeriod, TechnologyStage>>> = {
  lateMedieval: "known",
  ageOfExploration: "demonstrated"
};
const GUNPOWDER_ERA2_TECHNOLOGY_IDS: ReadonlySet<string> = new Set([
  "blackPowder",
  "cornedPowder",
  "cannonFoundry",
  "artilleryTactics",
  "massFirearms",
  "gunpowderFortification"
]);

function resolveStartStage(
  def: TechnologyDefinition,
  period: HistoricalPeriod | undefined
): TechnologyStage | undefined {
  if (GUNPOWDER_ERA2_TECHNOLOGY_IDS.has(def.id)) {
    const override = period && GUNPOWDER_ERA2_START_STAGE_BY_PERIOD[period];
    if (override) return override;
  }
  return def.startStage;
}

/** Seed start-profile technologies for every live political state. */
export function seedTechnologyStartProfile(year = simulationContext.currentYear): void {
  const tech = ensureTechnologyState();
  const gates = worldGates();
  const active = getActiveTechnologyDefinitions(gates);
  const states = worldContext.pack?.states ?? [];
  const period = worldContext.options?.historicalPeriod;
  const byKey = new Map(tech.progress.map(p => [progressKey(p.technologyId, p.scope, p.ownerId), p]));

  for (const state of states) {
    if (!state?.i || state.removed) continue;
    for (const def of active) {
      if (def.scope !== "state") continue;
      const key = progressKey(def.id, "state", state.i);
      if (byKey.has(key)) continue;
      const start = resolveStartStage(def, period);
      if (!start || start === "locked") {
        byKey.set(key, {
          technologyId: def.id,
          scope: "state",
          ownerId: state.i,
          stage: "locked",
          diffusion: 0
        });
        continue;
      }
      byKey.set(key, {
        technologyId: def.id,
        scope: "state",
        ownerId: state.i,
        stage: start,
        discoveredYear: year,
        demonstratedYear: technologyStageRank(start) >= 2 ? year : undefined,
        adoptedYear: technologyStageRank(start) >= 3 ? year : undefined,
        diffusion: start === "diffused" ? 1 : 0
      });
    }
  }

  tech.progress = [...byKey.values()];
}

/**
 * Annual evaluation. Self-gates to once per simulation year.
 * Call from a host simulation system after economy knowledge stocks update.
 */
export function settleTechnologyAnnual(year = simulationContext.currentYear): boolean {
  const tech = ensureTechnologyState();
  if (tech.lastEvaluatedYear === year) return false;
  tech.lastEvaluatedYear = year;

  // Ensure every live state has rows for active definitions (new conquests / first run).
  seedTechnologyStartProfile(year);

  const gates = worldGates();
  const active = getActiveTechnologyDefinitions(gates);
  const activeIds = new Set(active.map(d => d.id));
  const signalsByState = buildStateSignals();

  // Drop progress for inactive world-gated techs and removed states.
  const liveStateIds = new Set(
    (worldContext.pack?.states ?? []).filter(s => s?.i && !s.removed).map(s => s.i as number)
  );
  tech.progress = tech.progress.filter(p => {
    if (p.scope === "state" && !liveStateIds.has(p.ownerId)) return false;
    if (!activeIds.has(p.technologyId) && !getTechnologyDefinition(p.technologyId)?.startStage) {
      // Keep start-profile rows even if somehow filtered; drop gated techs when world disables them.
      const def = getTechnologyDefinition(p.technologyId);
      if (def?.worldGates?.length) return false;
    }
    if (!activeIds.has(p.technologyId)) {
      const def = getTechnologyDefinition(p.technologyId);
      return Boolean(def && !def.worldGates?.length);
    }
    return true;
  });

  const byKey = new Map(tech.progress.map(p => [progressKey(p.technologyId, p.scope, p.ownerId), p]));
  const liveHintKeys = collectLiveTechnologyHintKeys(year);

  for (const stateId of liveStateIds) {
    const signals = signalsByState.get(stateId) ?? emptySignals();
    const stageOf = (id: string): TechnologyStage => byKey.get(progressKey(id, "state", stateId))?.stage ?? "locked";

    for (const def of active) {
      if (def.scope !== "state") continue;
      if (def.startStage && technologyStageRank(def.startStage) >= technologyStageRank("adopted")) {
        continue; // start profile does not re-evaluate downward
      }

      const key = progressKey(def.id, "state", stateId);
      let entry = byKey.get(key);
      if (!entry) {
        entry = {
          technologyId: def.id,
          scope: "state",
          ownerId: stateId,
          stage: "locked",
          diffusion: 0
        };
        byKey.set(key, entry);
      }

      if (!prerequisitesMet(def, stageOf)) {
        // Knowledge can stall but does not forget past demonstrated/adopted stages.
        continue;
      }

      // Hints waive allowlisted knowledge ratios on the known climb only.
      entry.stage = advanceStage(entry, def, signals, year, liveHintKeys.has(`${stateId}:${def.id}`));
    }
  }

  tech.progress = [...byKey.values()];
  return true;
}

function worldGates(): { gunpowderWorld: boolean; shipbuildingWorld: boolean } {
  return {
    gunpowderWorld: isGunpowderEraEnabled(worldContext.options),
    // Shipbuilding nodes evaluate whenever coastal infrastructure exists; the extension
    // may be disabled, but hull signals will simply stay at zero.
    shipbuildingWorld: true
  };
}

function emptySignals(): TechnologySignals {
  return {
    treasury: 0,
    urbanPopulation: 0,
    portCount: 0,
    coastalBurgCount: 0,
    mineCount: 0,
    smelterWorkers: 0,
    pyrotechnics: 0,
    metallurgy: 0,
    woodworking: 0,
    printing: 0,
    administration: 0,
    masonry: 0,
    gunpowderDemand: 0,
    shipTechPoints: 0,
    completedHulls: 0,
    urbanWaterMaxTier: 0,
    instruments: 0,
    deepMineCount: 0,
    coalMineCount: 0,
    mineDrainagePressure: 0,
    steamTrialYears: 0,
    steamInstallations: 0,
    glassware: 0,
    naturalPhilosophy: 0,
    medicine: 0,
    sulfurAccess: 0,
    urbanSanitationPressure: 0,
    epidemicPressure: 0,
    battleWoundPressure: 0,
    soapGlassPressure: 0,
    gunpowderSulfurPressure: 0,
    medicineDemandPressure: 0,
    foodFertilizerPressure: 0,
    lateChemistryDemandPressure: 0,
    labVesselQuality: 0,
    pumiceCoverage: 0,
    pozzolanPractice: 0,
    obsidianPractice: 0,
    labGlassPracticeYears: 0,
    apothecaryTrialYears: 0,
    hospitalTrialYears: 0,
    acidPlantTrialYears: 0,
    hospitalInstallations: 0,
    acidPlantInstallations: 0,
    phosphateRockAccess: 0,
    phosphateFertilizerTrialYears: 0,
    phosphateFertilizerPlantCount: 0,
    steelAccess: 0,
    modernSteelmakingTrialYears: 0,
    modernSteelmakingInstallations: 0,
    experimentRecord: 0,
    urbanWaterMaxMunicipalSanitation: 0,
    fertilizerCoverageGap: 0,
    syntheticAmmoniaTrialYears: 0,
    syntheticAmmoniaInstallations: 0,
    atWar: false,
    capitalPort: false
  };
}

function buildStateSignals(): Map<number, TechnologySignals> {
  const map = new Map<number, TechnologySignals>();
  const pack = worldContext.pack;
  if (!pack?.states) return map;

  for (const state of pack.states) {
    if (!state?.i || state.removed) continue;
    map.set(state.i, emptySignals());
  }

  const populationRate = worldContext.populationRate || 1000;
  for (const burg of pack.burgs ?? []) {
    if (!burg?.i || burg.removed || !burg.state) continue;
    const signals = map.get(burg.state);
    if (!signals) continue;
    signals.urbanPopulation += Number(burg.population) || 0;
    if ((burg.port ?? 0) > 0) {
      signals.portCount += 1;
      signals.coastalBurgCount += 1;
      if (burg.capital) signals.capitalPort = true;
    }
  }

  for (const state of pack.states) {
    if (!state?.i || state.removed) continue;
    const signals = map.get(state.i);
    if (!signals) continue;
    signals.treasury = Math.max(0, Number(state.treasury) || 0);
    signals.atWar = Boolean(state.diplomacy && (state.diplomacy as unknown[]).includes("Enemy"));
    // Urban population stays in population-point units (docs/plan/craft-demand-calibration.md
    // PR 4: "urbanPopulation はポイントのまま" — a scale gate, not restated in people).
  }

  const economy = simulationContext.extensions?.economy;
  if (isRecord(economy)) {
    for (const entry of asStockArray(economy.stateSecretStocks)) {
      if (entry.domain !== "pyrotechnics") continue;
      const stateId = asNumber(entry.stateId);
      const signals = map.get(stateId);
      if (signals) signals.pyrotechnics = Math.max(signals.pyrotechnics, asNumber(entry.stock));
    }

    const guildMax = new Map<string, number>();
    for (const entry of asStockArray(economy.guildKnowledgeStocks)) {
      const burgId = asNumber(entry.burgId);
      const domain = String(entry.domain ?? "");
      const stock = asNumber(entry.stock);
      const burg = pack.burgs?.[burgId];
      if (!burg?.state || !domain) continue;
      const key = `${burg.state}:${domain}`;
      guildMax.set(key, Math.max(guildMax.get(key) ?? 0, stock));
    }
    for (const [key, stock] of guildMax) {
      const [stateIdRaw, domain] = key.split(":");
      const stateId = Number(stateIdRaw);
      const signals = map.get(stateId);
      if (!signals) continue;
      if (domain === "metallurgy") signals.metallurgy = Math.max(signals.metallurgy, stock);
      if (domain === "woodworking") signals.woodworking = Math.max(signals.woodworking, stock);
      if (domain === "printing") signals.printing = Math.max(signals.printing, stock);
      if (domain === "masonry") signals.masonry = Math.max(signals.masonry, stock);
      if (domain === "instruments") signals.instruments = Math.max(signals.instruments, stock);
      if (domain === "glassware") signals.glassware = Math.max(signals.glassware, stock);
    }

    const academyMax = new Map<string, number>();
    for (const entry of asStockArray(economy.academyKnowledgeStocks)) {
      const domain = String(entry.domain ?? "");
      const burgId = asNumber(entry.burgId);
      const stock = asNumber(entry.stock);
      const burg = pack.burgs?.[burgId];
      if (!burg?.state || !domain) continue;
      const key = `${burg.state}:${domain}`;
      academyMax.set(key, Math.max(academyMax.get(key) ?? 0, stock));
    }
    for (const [key, stock] of academyMax) {
      const [stateIdRaw, domain] = key.split(":");
      const signals = map.get(Number(stateIdRaw));
      if (!signals) continue;
      if (domain === "administration") signals.administration = Math.max(signals.administration, stock);
      if (domain === "medicine") signals.medicine = Math.max(signals.medicine, stock);
      if (domain === "naturalPhilosophy") signals.naturalPhilosophy = Math.max(signals.naturalPhilosophy, stock);
    }

    const depositsById = new Map<number, Record<string, unknown>>();
    for (const deposit of asStockArray(economy.mineralDeposits)) {
      depositsById.set(asNumber(deposit.i), deposit);
    }
    type MineAgg = { active: number; deep: number; coal: number; deficit: number };
    const mineAgg = new Map<number, MineAgg>();
    for (const mine of asStockArray(economy.mineOperations)) {
      const stateId = asNumber(mine.stateId) || burgStateId(asNumber(mine.burgId));
      const signals = map.get(stateId);
      if (!signals || mine.active === false) continue;
      signals.mineCount += 1;

      const agg = mineAgg.get(stateId) ?? { active: 0, deep: 0, coal: 0, deficit: 0 };
      agg.active += 1;
      const deposit = depositsById.get(asNumber(mine.depositId));
      const depth = String(deposit?.depth ?? "");
      if (depth === "deep") agg.deep += 1;
      const commodities = Array.isArray(deposit?.commodities) ? deposit.commodities : [];
      const primary = String(deposit?.primaryCommodity ?? "");
      if (primary === "coal" || commodities.includes("coal")) agg.coal += 1;
      const drainageNeed = depth === "deep" ? 1 : depth === "shallow" ? 0.55 : 0.2;
      agg.deficit += Math.max(0, drainageNeed - asNumber(mine.drainage));
      mineAgg.set(stateId, agg);
    }
    for (const [stateId, agg] of mineAgg) {
      const signals = map.get(stateId);
      if (!signals || agg.active <= 0) continue;
      signals.deepMineCount = agg.deep;
      signals.coalMineCount = agg.coal;
      signals.mineDrainagePressure = Math.max(
        0,
        Math.min(1, 0.45 * (agg.deficit / agg.active) + 0.3 * (agg.deep / agg.active) + 0.25 * Math.min(1, agg.coal))
      );
    }

    const trialYearsByState = new Map<number, number>();
    for (const trial of asStockArray(economy.steamPumpTrials)) {
      const stateId = asNumber(trial.stateId);
      trialYearsByState.set(stateId, Math.max(trialYearsByState.get(stateId) ?? 0, asNumber(trial.documentedRuns)));
    }
    for (const [stateId, years] of trialYearsByState) {
      const signals = map.get(stateId);
      if (signals) signals.steamTrialYears = years;
    }
    for (const installation of asStockArray(economy.steamInstallations)) {
      const mineId = asNumber(installation.mineOperationId);
      const mine = asStockArray(economy.mineOperations).find(entry => asNumber(entry.i) === mineId);
      const stateId = asNumber(mine?.stateId) || burgStateId(asNumber(mine?.burgId));
      const signals = map.get(stateId);
      if (signals) signals.steamInstallations += 1;
    }
    for (const smelter of asStockArray(economy.smelterOperations)) {
      const stateId = asNumber(smelter.stateId) || burgStateId(asNumber(smelter.burgId));
      const signals = map.get(stateId);
      if (signals && smelter.active !== false) {
        // docs/plan/craft-demand-calibration.md PR 4: this is the one raw-headcount signal (not a
        // 0-1 stock) technologyDefinitions.ts's smelterWorkers gates read, so it is restated in
        // real people here — smelter.workers itself stays a population-point figure everywhere
        // else (SmelterOperation, basicEmployment.ts's reconcile, GuildKnowledgeModule's closed
        // inventory all keep the pre-PR-4 unit).
        signals.smelterWorkers += Math.max(0, asNumber(smelter.workers)) * populationRate;
      }
    }
    for (const ledger of asStockArray(economy.militaryResourceLedgers)) {
      const stateId = asNumber(ledger.stateId);
      const signals = map.get(stateId);
      if (!signals) continue;
      const demand = isRecord(ledger.annualDemand) ? ledger.annualDemand : {};
      const unmet = isRecord(ledger.unmetDemand) ? ledger.unmetDemand : {};
      signals.gunpowderDemand = asNumber(demand.gunpowder);
      const sulfurDemand = asNumber(demand.sulfur);
      signals.gunpowderSulfurPressure = sulfurDemand > 0 ? clamp01(asNumber(unmet.sulfur) / sulfurDemand) : 0;
    }
    const waterByBurg = new Map<number, Record<string, unknown>>();
    for (const water of asStockArray(economy.urbanWaterSystems)) {
      const burgId = asNumber(water.burgId);
      waterByBurg.set(burgId, water);
      const burg = pack.burgs?.[burgId];
      if (!burg?.state) continue;
      const signals = map.get(burg.state);
      if (!signals) continue;
      signals.urbanWaterMaxTier = Math.max(signals.urbanWaterMaxTier, asNumber(water.tier));
      signals.urbanWaterMaxMunicipalSanitation = Math.max(
        signals.urbanWaterMaxMunicipalSanitation,
        asNumber(water.municipalSanitation)
      );
      signals.epidemicPressure = Math.max(signals.epidemicPressure, asNumber(water.healthPressure));
    }

    applyChemistryMedicineSignals(map, pack, economy);
  }

  const shipbuilding = simulationContext.extensions?.shipbuilding;
  if (isRecord(shipbuilding) && isRecord(shipbuilding.runtimeState)) {
    const runtime = shipbuilding.runtimeState;
    if (isRecord(runtime.stateTechPoints)) {
      for (const [rawId, points] of Object.entries(runtime.stateTechPoints)) {
        const stateId = Number(rawId);
        const signals = map.get(stateId);
        if (signals) signals.shipTechPoints = asNumber(points);
      }
    }
    if (isRecord(runtime.completedHulls)) {
      for (const [key, count] of Object.entries(runtime.completedHulls)) {
        // keys: owner:ownerId:shipClassId — owner is "state" | "market"
        const parts = key.split(":");
        if (parts[0] !== "state") continue;
        const stateId = Number(parts[1]);
        const signals = map.get(stateId);
        if (signals) signals.completedHulls += asNumber(count);
      }
    }
  }

  return map;
}

function burgStateId(burgId: number): number {
  const burg = worldContext.pack?.burgs?.[burgId];
  return burg?.state ?? 0;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function goodIdByName(economy: Record<string, unknown>, name: string): number | null {
  for (const good of asStockArray(economy.goods)) {
    if (String(good.name ?? "") === name) {
      const id = asNumber(good.i, -1);
      return id >= 0 ? id : null;
    }
  }
  return null;
}

type ChemMedPack = { burgs?: Array<{ i?: number; removed?: boolean; state?: number; market?: number } | 0 | null> };

/**
 * Market -> owning state(s), built once per buildStateSignals() call instead of re-derived per
 * (state, good) pair. A market can serve more than one state via a split-border catchment (a live
 * burg outside the center burg's state still pointing burg.market at it) — same ownership rule as
 * before, just computed in a single O(markets + burgs) pass rather than O(states * markets * burgs).
 */
function buildMarketOwnerStates(economy: Record<string, unknown>, pack: ChemMedPack): Map<number, Set<number>> {
  const owners = new Map<number, Set<number>>();
  const addOwner = (marketId: number, stateId: number | undefined) => {
    if (!stateId) return;
    const existing = owners.get(marketId);
    if (existing) existing.add(stateId);
    else owners.set(marketId, new Set([stateId]));
  };

  for (const market of asStockArray(economy.markets)) {
    const center = pack.burgs?.[asNumber(market.centerBurgId)];
    if (center && typeof center === "object" && !center.removed) addOwner(asNumber(market.i), center.state);
  }
  for (const burg of pack.burgs ?? []) {
    if (!burg || typeof burg !== "object" || !burg.i || burg.removed || !burg.market) continue;
    addOwner(burg.market, burg.state);
  }
  return owners;
}

/** Per-state stock totals for one good, computed in a single pass over markets. */
function stateMarketStockByGood(
  economy: Record<string, unknown>,
  owners: Map<number, Set<number>>,
  goodId: number | null
): Map<number, number> {
  const byState = new Map<number, number>();
  if (goodId === null) return byState;
  for (const market of asStockArray(economy.markets)) {
    const ownerStates = owners.get(asNumber(market.i));
    if (!ownerStates || ownerStates.size === 0) continue;
    const goods = isRecord(market.goods) ? market.goods : {};
    const row = goods[String(goodId)] ?? goods[goodId as unknown as string];
    const stock = asNumber(isRecord(row) ? row.stock : row);
    if (stock === 0) continue;
    for (const stateId of ownerStates) {
      byState.set(stateId, (byState.get(stateId) ?? 0) + stock);
    }
  }
  return byState;
}

function applyChemistryMedicineSignals(
  map: Map<number, TechnologySignals>,
  pack: {
    burgs?: Array<
      | {
          i?: number;
          removed?: boolean;
          state?: number;
          market?: number;
          population?: number;
          sanitation?: number;
        }
      | 0
      | null
    >;
  },
  economy: Record<string, unknown>
): void {
  const soapId = goodIdByName(economy, "Soap");
  const glassId = goodIdByName(economy, "Glass");
  const pumiceId = goodIdByName(economy, "Pumice");
  const sulfurId = goodIdByName(economy, "Sulfur");
  const phosphateRockId = goodIdByName(economy, "Phosphate Rock");
  const steelId = goodIdByName(economy, "Steel");

  const waterByBurg = new Map<number, Record<string, unknown>>();
  for (const water of asStockArray(economy.urbanWaterSystems)) {
    waterByBurg.set(asNumber(water.burgId), water);
  }

  const sanitationWeighted = new Map<number, { sum: number; pop: number }>();
  for (const burg of pack.burgs ?? []) {
    if (!burg || typeof burg !== "object" || !burg.i || burg.removed || !burg.state) continue;
    const signals = map.get(burg.state);
    if (!signals) continue;
    const pop = Math.max(0, Number(burg.population) || 0);
    const water = waterByBurg.get(burg.i);
    const term = water
      ? Math.max(1 - asNumber(burg.sanitation, 50) / 100, asNumber(water.healthPressure))
      : 1 - asNumber(burg.sanitation, 50) / 100;
    const entry = sanitationWeighted.get(burg.state) ?? { sum: 0, pop: 0 };
    entry.sum += term * pop;
    entry.pop += pop;
    sanitationWeighted.set(burg.state, entry);
  }
  for (const [stateId, entry] of sanitationWeighted) {
    const signals = map.get(stateId);
    if (signals && entry.pop > 0) signals.urbanSanitationPressure = clamp01(entry.sum / entry.pop);
  }

  const combatByState = new Map<number, number>();
  const loss = simulationContext.populationLoss;
  if (loss && typeof loss === "object" && Array.isArray(loss.history)) {
    for (const bucket of loss.history) {
      if (!isRecord(bucket) || !isRecord(bucket.byState)) continue;
      for (const [rawId, totals] of Object.entries(bucket.byState)) {
        const stateId = Number(rawId);
        combatByState.set(
          stateId,
          (combatByState.get(stateId) ?? 0) + asNumber(isRecord(totals) ? totals.combat : totals)
        );
      }
    }
  }

  // One pass over markets per good (not per state) — see buildMarketOwnerStates()/stateMarketStockByGood().
  const marketOwners = buildMarketOwnerStates(economy, pack);
  const soapStockByState = stateMarketStockByGood(economy, marketOwners, soapId);
  const glassStockByState = stateMarketStockByGood(economy, marketOwners, glassId);
  const sulfurStockByState = stateMarketStockByGood(economy, marketOwners, sulfurId);
  const pumiceStockByState = stateMarketStockByGood(economy, marketOwners, pumiceId);
  const phosphateRockStockByState = stateMarketStockByGood(economy, marketOwners, phosphateRockId);
  const steelStockByState = stateMarketStockByGood(economy, marketOwners, steelId);

  for (const [stateId, signals] of map) {
    const urbanPop = Math.max(signals.urbanPopulation, 1);
    signals.battleWoundPressure = clamp01((combatByState.get(stateId) ?? 0) / Math.max(urbanPop * 0.02, 1));

    const soapStock = soapStockByState.get(stateId) ?? 0;
    const glassStock = glassStockByState.get(stateId) ?? 0;
    const soapShort = clamp01(1 - soapStock / Math.max(urbanPop * 0.02, 1));
    const glassShort = clamp01(1 - glassStock / Math.max(urbanPop * 0.02, 1));
    signals.soapGlassPressure = clamp01(0.5 * soapShort + 0.5 * glassShort);

    const sulfurStock = sulfurStockByState.get(stateId) ?? 0;
    const marketCoverage = clamp01(sulfurStock / 2);
    const militaryCoverage = signals.gunpowderDemand > 0 ? 1 - signals.gunpowderSulfurPressure : 0;
    signals.sulfurAccess = Math.max(militaryCoverage, marketCoverage);

    // docs/plan/phosphate-fertilizer-vertical-slice.md §3.6 — same market-stock-coverage shape
    // as sulfurAccess, no military-demand analog (Phosphate Rock has no war use).
    signals.phosphateRockAccess = clamp01((phosphateRockStockByState.get(stateId) ?? 0) / 2);

    // docs/plan/modern-steelmaking-and-high-pressure-apparatus.md §3.3 — same market-stock-
    // coverage shape as sulfurAccess/phosphateRockAccess, no military-demand analog.
    signals.steelAccess = clamp01((steelStockByState.get(stateId) ?? 0) / 2);

    signals.pumiceCoverage = clamp01((pumiceStockByState.get(stateId) ?? 0) / 1);
    signals.labVesselQuality = clamp01(signals.glassware * (0.7 + 0.3 * signals.pumiceCoverage));
    signals.medicineDemandPressure = clamp01(
      0.4 * signals.urbanSanitationPressure +
        0.3 * signals.epidemicPressure +
        0.2 * signals.battleWoundPressure +
        0.1 * signals.soapGlassPressure
    );
  }

  for (const record of asStockArray(economy.chemMedPracticeRecords)) {
    const signals = map.get(asNumber(record.stateId));
    if (!signals) continue;
    signals.labGlassPracticeYears = asNumber(record.labGlassPracticeYears);
    signals.pozzolanPractice = clamp01(asNumber(record.pozzolanPractice));
    signals.obsidianPractice = clamp01(asNumber(record.obsidianPractice));
  }

  const compoundingYears = new Map<number, number>();
  const acidYears = new Map<number, number>();
  // docs/plan/phosphate-fertilizer-vertical-slice.md §3.6.
  const phosphateFertilizerYears = new Map<number, number>();
  // docs/plan/synthetic-ammonia-vertical-slice.md §3.5 — same ChemistryTrial indirection as
  // phosphateFertilizerYears above.
  const syntheticAmmoniaYears = new Map<number, number>();
  for (const trial of asStockArray(economy.chemistryTrials)) {
    if (String(trial.status ?? "") !== "running") continue;
    const stateId = asNumber(trial.stateId);
    const runs = asNumber(trial.documentedRuns);
    const kind = String(trial.kind ?? "");
    if (kind === "compounding") compoundingYears.set(stateId, Math.max(compoundingYears.get(stateId) ?? 0, runs));
    if (kind === "acidPlant") acidYears.set(stateId, Math.max(acidYears.get(stateId) ?? 0, runs));
    if (kind === "phosphateFertilizerPlant") {
      phosphateFertilizerYears.set(stateId, Math.max(phosphateFertilizerYears.get(stateId) ?? 0, runs));
    }
    if (kind === "syntheticAmmoniaPlant") {
      syntheticAmmoniaYears.set(stateId, Math.max(syntheticAmmoniaYears.get(stateId) ?? 0, runs));
    }
  }
  for (const [stateId, years] of compoundingYears) {
    const signals = map.get(stateId);
    if (signals) signals.apothecaryTrialYears = years;
  }
  for (const [stateId, years] of acidYears) {
    const signals = map.get(stateId);
    if (signals) signals.acidPlantTrialYears = years;
  }
  for (const [stateId, years] of phosphateFertilizerYears) {
    const signals = map.get(stateId);
    if (signals) signals.phosphateFertilizerTrialYears = years;
  }
  for (const [stateId, years] of syntheticAmmoniaYears) {
    const signals = map.get(stateId);
    if (signals) signals.syntheticAmmoniaTrialYears = years;
  }

  const hospitalYears = new Map<number, number>();
  for (const hospital of asStockArray(economy.hospitalInstallations)) {
    if (hospital.active === false) continue;
    const stateId = asNumber(hospital.stateId) || burgStateId(asNumber(hospital.burgId));
    const signals = map.get(stateId);
    if (!signals) continue;
    signals.hospitalInstallations += 1;
    hospitalYears.set(stateId, Math.max(hospitalYears.get(stateId) ?? 0, asNumber(hospital.documentedRuns)));
  }
  for (const [stateId, years] of hospitalYears) {
    const signals = map.get(stateId);
    if (signals) signals.hospitalTrialYears = years;
  }

  // docs/plan/modern-steelmaking-and-high-pressure-apparatus.md §3.3 — same shape as the
  // hospitalInstallations/hospitalTrialYears block above: SteelConverterPlant holds
  // documentedRuns on itself, no ChemistryTrial indirection.
  const steelYears = new Map<number, number>();
  for (const plant of asStockArray(economy.steelConverterPlants)) {
    if (plant.active === false) continue;
    const stateId = asNumber(plant.stateId) || burgStateId(asNumber(plant.burgId));
    const signals = map.get(stateId);
    if (!signals) continue;
    signals.modernSteelmakingInstallations += 1;
    steelYears.set(stateId, Math.max(steelYears.get(stateId) ?? 0, asNumber(plant.documentedRuns)));
  }
  for (const [stateId, years] of steelYears) {
    const signals = map.get(stateId);
    if (signals) signals.modernSteelmakingTrialYears = years;
  }

  for (const plant of asStockArray(economy.acidPlants)) {
    if (plant.active === false) continue;
    const stateId = asNumber(plant.stateId) || burgStateId(asNumber(plant.burgId));
    const signals = map.get(stateId);
    if (signals) signals.acidPlantInstallations += 1;
  }

  // docs/plan/phosphate-fertilizer-vertical-slice.md §3.6.
  for (const plant of asStockArray(economy.phosphateFertilizerPlants)) {
    if (plant.active === false) continue;
    const stateId = asNumber(plant.stateId) || burgStateId(asNumber(plant.burgId));
    const signals = map.get(stateId);
    if (signals) signals.phosphateFertilizerPlantCount += 1;
  }

  // docs/plan/synthetic-ammonia-vertical-slice.md §3.5.
  for (const plant of asStockArray(economy.syntheticAmmoniaPlants)) {
    if (plant.active === false) continue;
    const stateId = asNumber(plant.stateId) || burgStateId(asNumber(plant.burgId));
    const signals = map.get(stateId);
    if (signals) signals.syntheticAmmoniaInstallations += 1;
  }

  for (const workshop of asStockArray(economy.experimentalWorkshops)) {
    if (workshop.active === false) continue;
    const stateId = asNumber(workshop.sponsorStateId) || burgStateId(asNumber(workshop.burgId));
    const signals = map.get(stateId);
    if (signals) signals.experimentRecord = Math.max(signals.experimentRecord, asNumber(workshop.experimentRecord));
  }

  let fertilizerCount = 0;
  // docs/plan/synthetic-ammonia-vertical-slice.md §3.5: gapSum accumulates the "fertilizer
  // coverage gap" (1 - Market.fertilizerStock) in the same single pass as foodFertilizerPressure,
  // without a second loop or new cultivatedArea plumbing.
  const fertilizerByState = new Map<number, { sum: number; n: number; gapSum: number }>();
  for (const market of asStockArray(economy.markets)) {
    const ledger = isRecord(market.foodLedger) ? market.foodLedger : null;
    if (!ledger) continue;
    const stateId = (() => {
      const center = pack.burgs?.[asNumber(market.centerBurgId)];
      return center && typeof center === "object" ? (center.state ?? 0) : 0;
    })();
    if (!stateId) continue;
    const need = Math.max(0, asNumber(ledger.urbanNeed));
    const gap = Math.max(0, asNumber(ledger.importNeed) - asNumber(ledger.satisfiedImport));
    const ratio = need > 0 ? gap / need : 0;
    const entry = fertilizerByState.get(stateId) ?? { sum: 0, n: 0, gapSum: 0 };
    entry.sum += ratio;
    entry.gapSum += 1 - clamp01(asNumber(market.fertilizerStock));
    entry.n += 1;
    fertilizerByState.set(stateId, entry);
    fertilizerCount += 1;
  }
  if (fertilizerCount > 0) {
    for (const [stateId, entry] of fertilizerByState) {
      const signals = map.get(stateId);
      if (!signals || entry.n <= 0) continue;
      signals.foodFertilizerPressure = clamp01(entry.sum / entry.n);
      signals.fertilizerCoverageGap = clamp01(entry.gapSum / entry.n);
      signals.lateChemistryDemandPressure = clamp01(
        0.4 * signals.gunpowderSulfurPressure + 0.3 * signals.soapGlassPressure + 0.3 * signals.foodFertilizerPressure
      );
    }
  }
}

/** Whether a state knows how to blow laboratory vessels. */
export function isLaboratoryGlasswareKnown(stateId: number): boolean {
  return isTechnologyAtLeast("laboratoryGlassware", stateId, "known");
}

/** Whether a state has institutionalized apothecary compounding. */
export function isApothecaryCompoundingAdopted(stateId: number): boolean {
  return isTechnologyAtLeast("apothecaryCompounding", stateId, "adopted");
}

/**
 * 0..1 local hospital utilization for a state — not a global medicine multiplier.
 * Reads Economy hospital rows when present; otherwise 0.
 */
export function getHospitalCareEffect(stateId: number): number {
  const economy = simulationContext.extensions?.economy;
  if (!isRecord(economy)) return 0;
  let sum = 0;
  let n = 0;
  for (const hospital of asStockArray(economy.hospitalInstallations)) {
    if (hospital.active === false) continue;
    const owner = asNumber(hospital.stateId) || burgStateId(asNumber(hospital.burgId));
    if (owner !== stateId) continue;
    sum += clamp01(
      asNumber(hospital.utilization) * asNumber(hospital.condition, 1) * asNumber(hospital.ratedCare, 0.4)
    );
    n += 1;
  }
  return n > 0 ? clamp01(sum / n) : 0;
}

/** 0..1 fueled acid-plant utilization in a state — not a global chemistry multiplier. */
export function getIndustrialSulfuricAcidEffect(stateId: number): number {
  const economy = simulationContext.extensions?.economy;
  if (!isRecord(economy)) return 0;
  let sum = 0;
  let n = 0;
  for (const plant of asStockArray(economy.acidPlants)) {
    if (plant.active === false) continue;
    const owner = asNumber(plant.stateId) || burgStateId(asNumber(plant.burgId));
    if (owner !== stateId) continue;
    sum += clamp01(asNumber(plant.utilization));
    n += 1;
  }
  return n > 0 ? clamp01(sum / n) : 0;
}

function prerequisitesMet(def: TechnologyDefinition, stageOf: (id: string) => TechnologyStage): boolean {
  return def.prerequisites.every(id => isTechnologyStageAtLeast(stageOf(id), "adopted"));
}

const COUNT_SIGNAL_KEYS: ReadonlySet<keyof TechnologySignals> = new Set([
  "mineCount",
  "deepMineCount",
  "coalMineCount",
  "portCount",
  "coastalBurgCount",
  "smelterWorkers",
  "completedHulls",
  "steamTrialYears",
  "steamInstallations",
  "hospitalInstallations",
  "acidPlantInstallations",
  "labGlassPracticeYears",
  "apothecaryTrialYears",
  "hospitalTrialYears",
  "acidPlantTrialYears",
  "phosphateFertilizerTrialYears",
  "phosphateFertilizerPlantCount",
  "modernSteelmakingTrialYears",
  "modernSteelmakingInstallations",
  "urbanWaterMaxTier",
  "syntheticAmmoniaTrialYears",
  "syntheticAmmoniaInstallations"
]);

const AMOUNT_SIGNAL_KEYS: ReadonlySet<keyof TechnologySignals> = new Set([
  "treasury",
  "urbanPopulation",
  "gunpowderDemand",
  "shipTechPoints"
]);

function signalRequirementKind(key: keyof TechnologySignals): TechnologyRequirementKind {
  if (COUNT_SIGNAL_KEYS.has(key)) return "count";
  if (AMOUNT_SIGNAL_KEYS.has(key)) return "amount";
  return "ratio";
}

function isHintableKnownRatioKey(key: keyof TechnologySignals): boolean {
  return HINTABLE_KNOWN_RATIO_KEY_SET.has(key);
}

/** Read-only window: Economy owns writing and expiry deletion. */
function isLiveTechnologyHint(
  hint: Record<string, unknown>,
  stateId: number,
  technologyId: string,
  year: number
): boolean {
  if (asNumber(hint.stateId) !== stateId) return false;
  if (String(hint.technologyId ?? "") !== technologyId) return false;
  const first = hint.firstEligibleYear;
  const expires = hint.expiresAfterYear;
  if (typeof first !== "number" || typeof expires !== "number") return false;
  if (!Number.isFinite(first) || !Number.isFinite(expires)) return false;
  return first <= year && year <= expires;
}

function collectLiveTechnologyHintKeys(year: number): ReadonlySet<string> {
  const keys = new Set<string>();
  const economy = simulationContext.extensions?.economy;
  if (!isRecord(economy)) return keys;
  for (const hint of asStockArray(economy.technologyHints)) {
    const stateId = asNumber(hint.stateId);
    const technologyId = String(hint.technologyId ?? "");
    if (!stateId || !technologyId) continue;
    if (isLiveTechnologyHint(hint, stateId, technologyId, year)) {
      keys.add(`${stateId}:${technologyId}`);
    }
  }
  return keys;
}

function hasLiveTechnologyHint(stateId: number, technologyId: string, year: number): boolean {
  const economy = simulationContext.extensions?.economy;
  if (!isRecord(economy)) return false;
  for (const hint of asStockArray(economy.technologyHints)) {
    if (isLiveTechnologyHint(hint, stateId, technologyId, year)) return true;
  }
  return false;
}

function thresholdsMet(
  thresholds: TechnologyThresholds,
  signals: TechnologySignals,
  opts?: { hintKnowledgeRatios?: boolean }
): boolean {
  if (thresholds.min) {
    const ease = getTechnologyRequirementEase();
    const hintKnowledgeRatios = opts?.hintKnowledgeRatios === true;
    for (const [key, need] of Object.entries(thresholds.min) as [TechnologySignalKey, number][]) {
      if (need === undefined) continue;
      if (hintKnowledgeRatios && isHintableKnownRatioKey(key)) continue;
      const value = signals[key];
      if (typeof value === "number" && !meetsTechnologyRequirement(value, need, signalRequirementKind(key), ease)) {
        return false;
      }
    }
  }
  if (thresholds.flags) {
    if (thresholds.flags.atWar === true && !signals.atWar) {
      // War is preferred for some military techs; allow a treasury substitute.
      if (signals.treasury < WAR_OPTIONAL_TREASURY) return false;
    }
    if (thresholds.flags.capitalPort === true && !signals.capitalPort) return false;
  }
  return true;
}

function heldLongEnough(startYear: number | undefined, requiredYears: number | undefined, year: number): boolean {
  if (!requiredYears) return true;
  if (startYear === undefined) return false;
  const waitYears = Math.floor(requiredYears / getTechnologyDevelopmentSpeed() / getTechnologyRequirementEase() + 1e-9);
  return year - startYear >= waitYears;
}

function advanceStage(
  entry: TechnologyProgress,
  def: TechnologyDefinition,
  signals: TechnologySignals,
  year: number,
  hintKnowledgeRatios = false
): TechnologyStage {
  let stage = entry.stage;
  const waits = def.minimumYearsAtPreviousStage;

  // Same year may climb locked → known → demonstrated → adopted when signals are strong
  // and the definition does not require time-in-stage. Hints never apply past known.
  if (technologyStageRank(stage) < 1 && thresholdsMet(def.known, signals, { hintKnowledgeRatios })) {
    stage = "known";
    entry.discoveredYear = entry.discoveredYear ?? year;
  }
  if (
    technologyStageRank(stage) === 1 &&
    heldLongEnough(entry.discoveredYear, waits?.demonstrated, year) &&
    thresholdsMet(def.demonstrated, signals)
  ) {
    stage = "demonstrated";
    entry.demonstratedYear = entry.demonstratedYear ?? year;
  }
  if (
    technologyStageRank(stage) === 2 &&
    heldLongEnough(entry.demonstratedYear, waits?.adopted, year) &&
    thresholdsMet(def.adopted, signals)
  ) {
    stage = "adopted";
    entry.adoptedYear = entry.adoptedYear ?? year;
    entry.diffusion = Math.max(entry.diffusion || 0, 0);
  }
  if (stage === "adopted") {
    entry.diffusion = Math.min(1, (entry.diffusion || 0) + DIFFUSION_ANNUAL_GAIN * getTechnologyDevelopmentSpeed());
    if (entry.diffusion >= 1) stage = "diffused";
  }
  if (stage === "diffused") {
    entry.diffusion = 1;
  }

  entry.stage = stage;
  return stage;
}

function explainThresholds(
  stage: "known" | "demonstrated" | "adopted",
  thresholds: TechnologyThresholds,
  signals: TechnologySignals,
  lines: string[],
  opts?: { hintKnowledgeRatios?: boolean }
): void {
  const ease = getTechnologyRequirementEase();
  const hintKnowledgeRatios = opts?.hintKnowledgeRatios === true;
  if (thresholds.min) {
    for (const [key, need] of Object.entries(thresholds.min) as [TechnologySignalKey, number][]) {
      if (need === undefined) continue;
      if (hintKnowledgeRatios && isHintableKnownRatioKey(key)) continue;
      const value = signals[key];
      if (typeof value === "number" && !meetsTechnologyRequirement(value, need, signalRequirementKind(key), ease)) {
        lines.push(`unmet ${stage} min ${key}: ${value} < ${need}`);
      }
    }
  }
  if (thresholds.flags?.atWar === true && !signals.atWar && signals.treasury < WAR_OPTIONAL_TREASURY) {
    lines.push(`unmet ${stage} flag atWar`);
  }
  if (thresholds.flags?.capitalPort === true && !signals.capitalPort) {
    lines.push(`unmet ${stage} flag capitalPort`);
  }
}

/**
 * English diagnostic lines for unmet known/demonstrated/adopted mins and hint liveness.
 * Read by Technology Overview and tests. Pure read of pack + slices.
 */
export function explainTechnologyGate(stateId: number, technologyId: string): string[] {
  const def = getTechnologyDefinition(technologyId);
  if (!def) return [`unknown technology ${technologyId}`];

  const signals = buildStateSignals().get(stateId) ?? emptySignals();
  const year = simulationContext.currentYear;
  const hintLive = hasLiveTechnologyHint(stateId, technologyId, year);
  const lines: string[] = [hintLive ? "hint is live" : "hint is not live"];
  explainThresholds("known", def.known, signals, lines, { hintKnowledgeRatios: hintLive });
  explainThresholds("demonstrated", def.demonstrated, signals, lines);
  explainThresholds("adopted", def.adopted, signals, lines);
  return lines;
}

/** Test helper: replace progress rows. */
export function setTechnologyProgressForTests(progress: TechnologyProgress[]): void {
  const tech = ensureTechnologyState();
  tech.progress = progress;
  tech.lastEvaluatedYear = null;
}
