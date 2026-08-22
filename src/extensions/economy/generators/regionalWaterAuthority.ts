/**
 * Phase 3 (docs/plan/modern-urban-water-treatment-and-governance.md §8, §9, §14): the
 * `RegionalWaterScheme` lifecycle — proposed → surveying → negotiating → funded → building →
 * commissioning → operating (+ suspended) — for ordinary (non-Giant) Burgs that cannot solve their
 * own drinking-water intake locally. The interface itself (urbanWaterTypes.ts's
 * `RegionalWaterScheme`) was added in Phase 1 as an unwired data shape; this module is the first
 * thing that constructs, persists, and advances it.
 *
 * Reuses the gravity-routing machinery Giants' inherited aqueducts already use
 * (urbanWaterSupply.ts's `chooseProtectedIntakeCell`/`buildAqueductTree`) rather than duplicating
 * pathfinding — the physics of "where can this State protect a headwater and gravity-feed it to a
 * Burg" is the same question for a legacy Roman aqueduct and for a newly negotiated scheme.
 *
 * One-directional import boundary: this file must never import from urbanWaterSystem.ts.
 * urbanWaterSystem.ts imports `getRegionalSchemeConnectedBurgIds` FROM here (to fold an operating
 * scheme's benefit into computeUrbanWaterSystem()'s hasUpstreamIntake — see that file's
 * `hasRegionalWaterConnection`) — importing back would be a cycle. `actualUrbanPeople`/
 * `modernizationAffinityForBurg`-equivalents below are therefore small local duplicates of
 * urbanWaterSystem.ts's private helpers, not shared imports.
 *
 * Deliberate scope cuts (documented so they are not silently forgotten, matching Phase 2's own
 * §12.4-style disclosure):
 * - `authorityKind` is always `"stateWaterAuthority"` — a `"charteredWaterUnion"` of independent
 *   city-states without a common sponsoring State (§9.1's other authority kind) is not modeled.
 * - §9.3's default 50% State / 40% beneficiary / 10% bonds split is folded into a simpler 60% State
 *   / 40% beneficiary Burg split (REGIONAL_SCHEME_STATE_SHARE below) — no separate bond/guild
 *   instrument.
 * - `chooseProtectedIntakeCell`'s sewer-outfall exclusion list is passed empty: a scheme does not
 *   yet avoid siting its intake downstream of another Burg's own wastewater outfall.
 * - Negotiation/approval is a solvency check on the sponsor State only, not a genuine per-party
 *   (§9.3's water-rights/compensation) negotiation — every member Burg approves automatically once
 *   the State can afford the flat negotiation fee.
 */

import { getCultureModernizationAffinity } from "../../hostCore";
import type { Burg, PackedGraph, State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import {
  getRegionalWaterSchemes,
  getRegionalWaterSchemesLastSettledYear,
  getSimulationYear,
  getUrbanWaterSystems,
  getWorldContext,
  setRegionalWaterSchemes,
  setRegionalWaterSchemesLastSettledYear
} from "../economyContext";
import { getComfortableTreasuryLevel } from "./guildTreasury";
import { raceKeyForBurgState } from "./resolveBurgCulture";
import { isModernWaterEraAvailable, MODERN_WATER_MIN_POPULATION } from "./urbanWaterModernTreatment";
import { buildAqueductTree, chooseProtectedIntakeCell, hasSameLandGravityWaterSource } from "./urbanWaterSupply";
import type { RegionalWaterScheme } from "./urbanWaterTypes";

/** At most this many non-suspended schemes per sponsoring State — same "cap concurrent civil
 *  projects per State" idiom as dams.ts's MAX_DAMS_PER_STATE. */
const MAX_ACTIVE_SCHEMES_PER_STATE = 2;

/** Flat State treasury debit to close negotiating → funded — same "flat annual civil-project fee"
 *  idiom as dams.ts's DAM_BUDGET, standing in for §9.3's water-rights/survey paperwork rather than
 *  the construction cost itself (that is schemeConstructionBudget() below, spent during building). */
const REGIONAL_SCHEME_NEGOTIATION_COST = 40;

/** §9.3's default split, folded from 50/40/10 into 60/40 — see the file header's scope-cut note. */
const REGIONAL_SCHEME_STATE_SHARE = 0.6;
/** Fraction of the sponsor State's CURRENT liquid treasury it may put toward this scheme in one
 *  year — several concurrent schemes/other State spending still compete for the same treasury. */
const REGIONAL_SCHEME_STATE_ANNUAL_SHARE = 0.1;
/** Fraction of a member Burg's CURRENT liquid treasury it may put toward this scheme in one year —
 *  same spirit as urbanWaterModernTreatment.ts's MODERN_CONSTRUCTION_BUDGET_SHARE. */
const REGIONAL_SCHEME_BURG_BUDGET_SHARE = 0.1;

// Calibration TBD (dams.ts/damSites.ts use the same disclaimer for their own cost constants) — a
// multi-Burg trunk aqueduct is bigger than any single Burg's own Phase 2 filtration plant
// (urbanWaterModernTreatment.ts's ~240-260 currency-unit costs), scaling with route length and
// member count rather than population alone.
const REGIONAL_SCHEME_BASE_COST = 900;
const REGIONAL_SCHEME_COST_PER_ROUTE_CELL = 14;
const REGIONAL_SCHEME_COST_PER_MEMBER = 320;

/** Recurring annual operations need, split State/Burgs the same way construction is (just a
 *  smaller pool) — calibration TBD. */
const REGIONAL_SCHEME_OPS_STATE_SHARE = 0.3;
const REGIONAL_SCHEME_OPS_BASE_PER_MEMBER = 6;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function sumRecord(record: Record<string | number, number> | undefined): number {
  if (!record) return 0;
  let sum = 0;
  for (const value of Object.values(record)) if (Number.isFinite(value)) sum += value as number;
  return sum;
}

/** Local duplicate of urbanWaterSystem.ts's private actualUrbanPeople() — see the file header's
 *  import-boundary note for why this isn't a shared import. */
function urbanPeople(burg: Burg, populationRate: number, urbanization: number): number {
  return Math.max(0, burg.population ?? 0) * Math.max(0, populationRate) * Math.max(0, urbanization);
}

/** Local duplicate of urbanWaterSystem.ts's private modernizationAffinityForBurg(). */
function modernizationAffinityForBurg(burg: Burg): number {
  const culture = getWorldContext().pack.cultures?.[burg.culture ?? 0];
  return getCultureModernizationAffinity(culture ?? {});
}

type WaterCells = Pick<PackedGraph["cells"], "c" | "f" | "h" | "haven" | "i" | "p" | "r" | "state">;

function collectRiverCells(cells: WaterCells): number[] {
  const riverCells: number[] = [];
  for (let cell = 0; cell < cells.i.length; cell++) {
    if (cells.r[cell] && cells.p[cell]) riverCells.push(cell);
  }
  return riverCells;
}

/** Burg ids currently served by an "operating" RegionalWaterScheme — read by urbanWaterSystem.ts's
 *  buildSystems() to fold into computeUrbanWaterSystem()'s hasUpstreamIntake/serviceWaterCapacity/
 *  drinkingBase, one year lagged (see this module's settleAnnual() ordering note in index.tsx). */
export function getRegionalSchemeConnectedBurgIds(): ReadonlySet<number> {
  const ids = new Set<number>();
  for (const scheme of getRegionalWaterSchemes()) {
    if (scheme.status !== "operating") continue;
    for (const burgId of scheme.memberBurgIds) ids.add(burgId);
  }
  return ids;
}

/** §3's route+member-scaled construction cost, in the same treasury currency as everything else in
 *  this file — deterministic from already-stored scheme fields, so no extra interface field is
 *  needed to remember it (RegionalWaterScheme's shape matches doc §9.4 exactly). */
function schemeConstructionBudget(scheme: RegionalWaterScheme): number {
  return (
    REGIONAL_SCHEME_BASE_COST +
    REGIONAL_SCHEME_COST_PER_ROUTE_CELL * scheme.routeCellIds.length +
    REGIONAL_SCHEME_COST_PER_MEMBER * scheme.memberBurgIds.length
  );
}

function schemeOperationsAnnualNeed(scheme: RegionalWaterScheme): number {
  return REGIONAL_SCHEME_OPS_BASE_PER_MEMBER * Math.max(1, scheme.memberBurgIds.length);
}

interface SettleContext {
  cells: WaterCells;
  burgs: readonly (Burg | undefined)[];
  states: readonly (State | undefined)[];
}

class RegionalWaterAuthorityModule {
  /** Full rebuild after map generation or economy enable — no scheme survives a new map. */
  generate(): void {
    setRegionalWaterSchemes([]);
    setRegionalWaterSchemesLastSettledYear(getSimulationYear());
  }

  clear(): void {
    setRegionalWaterSchemes([]);
    setRegionalWaterSchemesLastSettledYear(-1);
  }

  /**
   * Annual: advance every existing scheme one lifecycle step (or one year of its current step),
   * then propose new schemes for eligible, not-yet-covered Burg groups. Self-gates once per
   * simulation year, same shape as UrbanWater.settleAnnual()/Dams.settleAnnual().
   */
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getRegionalWaterSchemesLastSettledYear() === year) return false;
    setRegionalWaterSchemesLastSettledYear(year);

    const world = getWorldContext();
    const { cells, burgs, states } = world.pack;
    const ctx: SettleContext = { cells, burgs, states: states ?? [] };

    const schemes = getRegionalWaterSchemes().map(scheme => ({
      ...scheme,
      contractedCapacityByBurg: { ...scheme.contractedCapacityByBurg },
      approvalByParty: { ...scheme.approvalByParty },
      capitalContributionByParty: { ...scheme.capitalContributionByParty },
      routeCellIds: [...scheme.routeCellIds],
      memberBurgIds: [...scheme.memberBurgIds],
      transitBurgIds: [...scheme.transitBurgIds]
    }));

    for (const scheme of schemes) advanceScheme(scheme, ctx);

    setRegionalWaterSchemes(proposeNewSchemes(schemes, ctx));
    return true;
  }
}

export const RegionalWaterAuthority = new RegionalWaterAuthorityModule();

function advanceScheme(scheme: RegionalWaterScheme, ctx: SettleContext): void {
  switch (scheme.status) {
    case "proposed":
      scheme.status = "surveying";
      return;
    case "surveying":
      surveyScheme(scheme, ctx);
      return;
    case "negotiating":
      negotiateScheme(scheme, ctx);
      return;
    case "funded":
      scheme.status = "building";
      return;
    case "building":
      buildScheme(scheme, ctx);
      return;
    case "commissioning":
      commissionScheme(scheme, ctx);
      return;
    case "operating":
      operateScheme(scheme, ctx);
      return;
    case "suspended":
      trySuspendedRecovery(scheme, ctx);
      return;
  }
}

function surveyScheme(scheme: RegionalWaterScheme, { cells, burgs }: SettleContext): void {
  const memberBurgs = scheme.memberBurgIds
    .map(id => burgs[id])
    .filter((burg): burg is Burg & { i: number } => Boolean(burg?.i && !burg.removed));
  if (!memberBurgs.length) {
    scheme.status = "suspended";
    return;
  }

  const riverCells = collectRiverCells(cells);
  // Sewer-outfall exclusion deferred (file header scope cut) — [] means no candidate is rejected
  // for sitting downstream of a known outfall yet.
  const intakeCell = chooseProtectedIntakeCell(memberBurgs, riverCells, cells, []);
  if (intakeCell === undefined) {
    scheme.status = "suspended";
    return;
  }

  const routes = buildAqueductTree(memberBurgs, intakeCell, cells, new Set());
  if (!routes.length) {
    scheme.status = "suspended";
    return;
  }

  const routeCellSet = new Set<number>();
  for (const route of routes) for (const cell of route.cellPath) routeCellSet.add(cell);

  scheme.sourceCellId = intakeCell;
  scheme.routeCellIds = [...routeCellSet].sort((a, b) => a - b);
  scheme.transitBurgIds = computeTransitBurgIds(scheme, burgs, cells);
  scheme.status = "negotiating";
}

/** Same-State burgs (excluding members) whose own cell neighbors a route cell — flavor/UI only. */
function computeTransitBurgIds(
  scheme: RegionalWaterScheme,
  burgs: readonly (Burg | undefined)[],
  cells: WaterCells
): number[] {
  const routeCellSet = new Set(scheme.routeCellIds);
  const memberSet = new Set(scheme.memberBurgIds);
  const transit: number[] = [];
  for (const burg of burgs) {
    if (!burg?.i || burg.removed || memberSet.has(burg.i) || burg.state !== scheme.sponsorStateId) continue;
    const neighbors = cells.c?.[burg.cell] ?? [];
    if (routeCellSet.has(burg.cell) || neighbors.some(neighbor => routeCellSet.has(neighbor))) transit.push(burg.i);
  }
  return transit;
}

function negotiateScheme(scheme: RegionalWaterScheme, { states }: SettleContext): void {
  const state = states[scheme.sponsorStateId];
  if (!state?.i || state.removed) {
    scheme.status = "suspended";
    return;
  }
  const liquid = Math.max(0, state.treasury ?? 0);
  if (liquid < REGIONAL_SCHEME_NEGOTIATION_COST) return; // stalls; retried every year, no dead end
  state.treasury = rn(liquid - REGIONAL_SCHEME_NEGOTIATION_COST, 2);

  scheme.approvalByParty = {
    [String(scheme.sponsorStateId)]: "approved" as const,
    ...Object.fromEntries(scheme.memberBurgIds.map(id => [String(id), "approved" as const]))
  };
  scheme.status = "funded";
}

function buildScheme(scheme: RegionalWaterScheme, { burgs, states }: SettleContext): void {
  const budget = schemeConstructionBudget(scheme);
  collectCapitalContributions(scheme, budget, burgs, states);
  scheme.constructionProgress = rn(clamp01(sumRecord(scheme.capitalContributionByParty) / budget), 4);
  if (scheme.constructionProgress >= 1) scheme.status = "commissioning";
}

/**
 * Draws this year's construction contribution from the sponsor State (REGIONAL_SCHEME_STATE_SHARE
 * of the total, itself capped per year) and each member Burg (the remaining share, split by
 * contractedCapacityByBurg, each capped by its own comfortable-treasury cushion — same partial-draw
 * shape as urbanWaterModernTreatment.ts's settleModernWaterTreatmentInvestment()). Mutates treasury
 * and scheme.capitalContributionByParty in place.
 */
function collectCapitalContributions(
  scheme: RegionalWaterScheme,
  budget: number,
  burgs: readonly (Burg | undefined)[],
  states: readonly (State | undefined)[]
): void {
  const stateKey = String(scheme.sponsorStateId);
  const state = states[scheme.sponsorStateId];
  if (state?.i && !state.removed) {
    const target = budget * REGIONAL_SCHEME_STATE_SHARE;
    const already = scheme.capitalContributionByParty[stateKey] ?? 0;
    const remaining = Math.max(0, target - already);
    if (remaining > 0) {
      const liquid = Math.max(0, state.treasury ?? 0);
      const spend = Math.min(remaining, liquid * REGIONAL_SCHEME_STATE_ANNUAL_SHARE);
      if (spend > 0) {
        state.treasury = rn(liquid - spend, 2);
        scheme.capitalContributionByParty[stateKey] = rn(already + spend, 2);
      }
    }
  }

  const totalCapacity = sumRecord(scheme.contractedCapacityByBurg) || scheme.memberBurgIds.length || 1;
  const burgPool = budget * (1 - REGIONAL_SCHEME_STATE_SHARE);
  for (const burgId of scheme.memberBurgIds) {
    const burg = burgs[burgId];
    if (!burg?.i || burg.removed) continue;
    const key = String(burgId);
    const shareFraction = (scheme.contractedCapacityByBurg[burgId] ?? 1) / totalCapacity;
    const target = burgPool * shareFraction;
    const already = scheme.capitalContributionByParty[key] ?? 0;
    const remaining = Math.max(0, target - already);
    if (remaining <= 0) continue;

    const liquid = Math.max(0, burg.treasury ?? 0);
    const cushion = getComfortableTreasuryLevel(burg) * 0.15;
    // Small modernizationAffinity boost on top of the shared budget-share cap (§11.4: speed only,
    // never a bypass of the cap or cushion below).
    const affinitySpeed = 0.7 + modernizationAffinityForBurg(burg) * 0.6;
    const spend = Math.max(
      0,
      Math.min(remaining, liquid - cushion, liquid * REGIONAL_SCHEME_BURG_BUDGET_SHARE * affinitySpeed)
    );
    if (spend > 0) {
      burg.treasury = rn(liquid - spend, 2);
      scheme.capitalContributionByParty[key] = rn(already + spend, 2);
    }
  }
}

function commissionScheme(scheme: RegionalWaterScheme, { burgs }: SettleContext): void {
  const valid = scheme.memberBurgIds.every(id => {
    const burg = burgs[id];
    return burg?.i && !burg.removed && burg.state === scheme.sponsorStateId;
  });
  scheme.status = valid ? "operating" : "suspended";
}

function operateScheme(scheme: RegionalWaterScheme, { burgs, states }: SettleContext): void {
  const need = schemeOperationsAnnualNeed(scheme);
  const raised = collectOperationsContributions(scheme, need, burgs, states);
  // Rounded before the shortfall check — otherwise a scheme that raised exactly its annual need
  // could be suspended by a sub-cent float rounding artifact from summing several partial draws.
  const nextReserve = rn((scheme.operationsReserve ?? 0) + raised - need, 2);
  if (nextReserve < 0) {
    scheme.operationsReserve = 0;
    scheme.status = "suspended";
    return;
  }
  scheme.operationsReserve = nextReserve;
}

function collectOperationsContributions(
  scheme: RegionalWaterScheme,
  need: number,
  burgs: readonly (Burg | undefined)[],
  states: readonly (State | undefined)[]
): number {
  let raised = 0;
  const state = states[scheme.sponsorStateId];
  if (state?.i && !state.removed) {
    const target = need * REGIONAL_SCHEME_OPS_STATE_SHARE;
    const liquid = Math.max(0, state.treasury ?? 0);
    const spend = Math.min(target, liquid * REGIONAL_SCHEME_STATE_ANNUAL_SHARE);
    if (spend > 0) {
      state.treasury = rn(liquid - spend, 2);
      raised += spend;
    }
  }

  const totalCapacity = sumRecord(scheme.contractedCapacityByBurg) || scheme.memberBurgIds.length || 1;
  const burgPool = need * (1 - REGIONAL_SCHEME_OPS_STATE_SHARE);
  for (const burgId of scheme.memberBurgIds) {
    const burg = burgs[burgId];
    if (!burg?.i || burg.removed) continue;
    const shareFraction = (scheme.contractedCapacityByBurg[burgId] ?? 1) / totalCapacity;
    const target = burgPool * shareFraction;
    const liquid = Math.max(0, burg.treasury ?? 0);
    const cushion = getComfortableTreasuryLevel(burg) * 0.1;
    const spend = Math.max(0, Math.min(target, liquid - cushion, liquid * REGIONAL_SCHEME_BURG_BUDGET_SHARE));
    if (spend > 0) {
      burg.treasury = rn(liquid - spend, 2);
      raised += spend;
    }
  }
  return raised;
}

/** A suspended scheme (funding lapse or a broken route) resumes once its sponsor State can again
 *  afford its own share — operateScheme() re-evaluates full funding health the following year, so
 *  a resumption that still can't be paid for simply suspends again rather than flapping forever. */
function trySuspendedRecovery(scheme: RegionalWaterScheme, { states }: SettleContext): void {
  const state = states[scheme.sponsorStateId];
  if (!state?.i || state.removed || (state.treasury ?? 0) <= 0) return;
  scheme.status = "operating";
}

/**
 * Groups not-yet-covered, era/population/geography-eligible Burgs by (State, landmass) and turns
 * each group into a new "proposed" scheme, up to MAX_ACTIVE_SCHEMES_PER_STATE per State per year —
 * same "found at most one/a few new civil projects per under-quota State this year" idiom as
 * dams.ts's foundNewDams().
 */
function proposeNewSchemes(schemes: RegionalWaterScheme[], ctx: SettleContext): RegionalWaterScheme[] {
  const world = getWorldContext();
  if (!isModernWaterEraAvailable(world.options?.historicalPeriod)) return schemes;

  const alreadyCovered = new Set<number>();
  for (const scheme of schemes) for (const id of scheme.memberBurgIds) alreadyCovered.add(id);

  const activeCountByState = new Map<number, number>();
  for (const scheme of schemes) {
    if (scheme.status === "suspended") continue;
    activeCountByState.set(scheme.sponsorStateId, (activeCountByState.get(scheme.sponsorStateId) ?? 0) + 1);
  }

  const systemByBurg = new Map(getUrbanWaterSystems().map(system => [system.burgId, system]));
  const groups = new Map<string, Burg[]>();
  for (const burg of ctx.burgs) {
    if (!burg?.i || burg.removed || !burg.state) continue;
    if (alreadyCovered.has(burg.i)) continue;
    if (raceKeyForBurgState(burg) === "giant") continue;
    const system = systemByBurg.get(burg.i);
    if (!system || system.hasUpstreamIntake) continue;
    if (urbanPeople(burg, world.populationRate, world.urbanization) < MODERN_WATER_MIN_POPULATION) continue;
    // Only worth proposing when a gravity-feasible source exists SOMEWHERE on the same landmass —
    // otherwise surveyScheme() would fail immediately next year anyway (same check Giants'
    // buildInheritedWaterSupplyRoutes()/hasSameLandGravityWaterSource() already use).
    if (!hasSameLandGravityWaterSource(burg, ctx.cells)) continue;

    const key = `${burg.state}:${ctx.cells.f[burg.cell]}`;
    groups.set(key, [...(groups.get(key) ?? []), burg]);
  }

  let nextId = schemes.reduce((max, scheme) => Math.max(max, scheme.id), 0) + 1;
  const created: RegionalWaterScheme[] = [];
  for (const group of groups.values()) {
    const stateId = group[0]?.state;
    if (!stateId) continue;
    const activeCount = activeCountByState.get(stateId) ?? 0;
    if (activeCount >= MAX_ACTIVE_SCHEMES_PER_STATE) continue;
    activeCountByState.set(stateId, activeCount + 1);

    created.push({
      id: nextId++,
      sponsorStateId: stateId,
      authorityKind: "stateWaterAuthority",
      status: "proposed",
      sourceCellId: -1,
      routeCellIds: [],
      memberBurgIds: group.map(burg => burg.i!),
      transitBurgIds: [],
      contractedCapacityByBurg: Object.fromEntries(group.map(burg => [burg.i!, Math.max(1, burg.population ?? 1)])),
      approvalByParty: {},
      capitalContributionByParty: {},
      compensationReserve: 0,
      constructionProgress: 0,
      operationsReserve: 0
    });
  }

  return [...schemes, ...created];
}
