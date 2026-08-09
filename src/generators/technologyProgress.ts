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
import { getActiveTechnologyDefinitions, getTechnologyDefinition } from "./technologyDefinitions";
import {
  createEmptyTechnologySimulationState,
  isTechnologyStageAtLeast,
  progressKey,
  type TechnologyDefinition,
  type TechnologyProgress,
  type TechnologyScope,
  type TechnologySignals,
  type TechnologySimulationState,
  type TechnologyStage,
  type TechnologyThresholds,
  technologyStageRank
} from "./technologyTypes";

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

/**
 * Highest ship class tier (0 sloop / 1 caravel / 2 galleon) allowed by the tech graph.
 * Tech points still apply separately in Shipbuilding.
 */
export function getMaxShipClassTierForState(stateId: number): number {
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

/** Seed start-profile technologies for every live political state. */
export function seedTechnologyStartProfile(year = simulationContext.currentYear): void {
  const tech = ensureTechnologyState();
  const gates = worldGates();
  const active = getActiveTechnologyDefinitions(gates);
  const states = worldContext.pack?.states ?? [];
  const byKey = new Map(tech.progress.map(p => [progressKey(p.technologyId, p.scope, p.ownerId), p]));

  for (const state of states) {
    if (!state?.i || state.removed) continue;
    for (const def of active) {
      if (def.scope !== "state") continue;
      const key = progressKey(def.id, "state", state.i);
      if (byKey.has(key)) continue;
      const start = def.startStage;
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

      entry.stage = advanceStage(entry, def, signals, year);
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
    // Urban population is stored in "display people / populationRate" units in many UIs;
    // keep raw burg.population sum (already in map population units).
    void populationRate;
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
    }

    const academyMax = new Map<number, number>();
    for (const entry of asStockArray(economy.academyKnowledgeStocks)) {
      if (entry.domain !== "administration") continue;
      const burgId = asNumber(entry.burgId);
      const stock = asNumber(entry.stock);
      const burg = pack.burgs?.[burgId];
      if (!burg?.state) continue;
      academyMax.set(burg.state, Math.max(academyMax.get(burg.state) ?? 0, stock));
    }
    for (const [stateId, stock] of academyMax) {
      const signals = map.get(stateId);
      if (signals) signals.administration = Math.max(signals.administration, stock);
    }

    for (const mine of asStockArray(economy.mineOperations)) {
      const stateId = asNumber(mine.stateId) || burgStateId(asNumber(mine.burgId));
      const signals = map.get(stateId);
      if (signals && mine.active !== false) signals.mineCount += 1;
    }
    for (const smelter of asStockArray(economy.smelterOperations)) {
      const stateId = asNumber(smelter.stateId) || burgStateId(asNumber(smelter.burgId));
      const signals = map.get(stateId);
      if (signals && smelter.active !== false) {
        signals.smelterWorkers += asNumber(smelter.workers);
      }
    }
    for (const ledger of asStockArray(economy.militaryResourceLedgers)) {
      const stateId = asNumber(ledger.stateId);
      const signals = map.get(stateId);
      if (!signals) continue;
      const demand = isRecord(ledger.annualDemand) ? ledger.annualDemand : {};
      signals.gunpowderDemand = asNumber(demand.gunpowder);
    }
    for (const water of asStockArray(economy.urbanWaterSystems)) {
      const burgId = asNumber(water.burgId);
      const burg = pack.burgs?.[burgId];
      if (!burg?.state) continue;
      const signals = map.get(burg.state);
      if (!signals) continue;
      const tier = asNumber(water.tier);
      signals.urbanWaterMaxTier = Math.max(signals.urbanWaterMaxTier, tier);
    }
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

function prerequisitesMet(def: TechnologyDefinition, stageOf: (id: string) => TechnologyStage): boolean {
  return def.prerequisites.every(id => isTechnologyStageAtLeast(stageOf(id), "adopted"));
}

function thresholdsMet(thresholds: TechnologyThresholds, signals: TechnologySignals): boolean {
  if (thresholds.min) {
    for (const [key, need] of Object.entries(thresholds.min) as [keyof TechnologySignals, number][]) {
      if (need === undefined) continue;
      const value = signals[key];
      if (typeof value === "number" && value < need) return false;
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

function advanceStage(
  entry: TechnologyProgress,
  def: TechnologyDefinition,
  signals: TechnologySignals,
  year: number
): TechnologyStage {
  let stage = entry.stage;

  // Same year may climb locked → known → demonstrated → adopted when signals are strong.
  if (technologyStageRank(stage) < 1 && thresholdsMet(def.known, signals)) {
    stage = "known";
    entry.discoveredYear = entry.discoveredYear ?? year;
  }
  if (technologyStageRank(stage) === 1 && thresholdsMet(def.demonstrated, signals)) {
    stage = "demonstrated";
    entry.demonstratedYear = entry.demonstratedYear ?? year;
  }
  if (technologyStageRank(stage) === 2 && thresholdsMet(def.adopted, signals)) {
    stage = "adopted";
    entry.adoptedYear = entry.adoptedYear ?? year;
    entry.diffusion = Math.max(entry.diffusion || 0, 0);
  }
  if (stage === "adopted") {
    entry.diffusion = Math.min(1, (entry.diffusion || 0) + DIFFUSION_ANNUAL_GAIN);
    if (entry.diffusion >= 1) stage = "diffused";
  }
  if (stage === "diffused") {
    entry.diffusion = 1;
  }

  entry.stage = stage;
  return stage;
}

/** Test helper: replace progress rows. */
export function setTechnologyProgressForTests(progress: TechnologyProgress[]): void {
  const tech = ensureTechnologyState();
  tech.progress = progress;
  tech.lastEvaluatedYear = null;
}
