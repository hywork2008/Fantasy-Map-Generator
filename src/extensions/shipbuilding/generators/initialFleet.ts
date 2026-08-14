/**
 * Map-generation initial fleet seeding for port-owning states.
 * See docs/plan/shipbuilding-initial-fleet.md.
 */

import type { Burg, PackedGraph, State } from "../../hostTypes";
import { getShipbuildingRuntimeState, getWorldContext } from "../shipbuildingContext";
import {
  FLAGSHIP_OUTLIER_P,
  type HistoricalPeriod,
  MAX_FLEET_PER_STATE,
  type MaritimeRole,
  SHIP_CLASS_TECH_POINTS,
  type ShipClassId,
  STARTER_GUIDELINES
} from "./initialFleetTables";
import type { PortCapacity } from "./portCapacity";
import type { ShipyardCandidate } from "./shipyardCandidates";
import { registerCompletedHull } from "./shipyardQueue";

export interface OceanPortBurg {
  burgId: number;
  stateId: number;
  population: number;
  capital: boolean;
  citadel: boolean;
  isShipyard: boolean;
  navalCulture: boolean;
}

export interface ClassCounts {
  sloop: number;
  caravel: number;
  galleon: number;
}

export interface StateFleetPlan extends ClassCounts {
  total: number;
  stateHulls: number;
  marketHulls: number;
  maxTechPointsRequired: number;
  role: MaritimeRole;
}

export interface HullSeedAssignment {
  owner: "state" | "market";
  shipClassId: ShipClassId;
  homeBurgId: number;
}

/** Deterministic unit hash in [0, 1) from integer seeds (map-stable, no Math.random). */
export function unitHash(...parts: number[]): number {
  let h = 2166136261;
  for (const part of parts) {
    h ^= part | 0;
    h = Math.imul(h, 16777619);
  }
  // final avalanche
  h ^= h >>> 16;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function isOceanPortBurg(burg: Burg | undefined, pack: PackedGraph): boolean {
  if (!burg?.i || burg.removed || !burg.port) return false;
  const haven = pack.cells.haven?.[burg.cell];
  if (!haven) return false;
  const featureId = pack.cells.f?.[haven];
  if (featureId === undefined || featureId === null) return false;
  return pack.features?.[featureId]?.type === "ocean";
}

export function collectOceanPortsByState(
  pack: PackedGraph,
  shipyardBurgIds: ReadonlySet<number>
): Map<number, OceanPortBurg[]> {
  const byState = new Map<number, OceanPortBurg[]>();
  const cultures = pack.cultures ?? [];

  for (const burg of pack.burgs ?? []) {
    if (!isOceanPortBurg(burg, pack)) continue;
    const stateId = burg.state ?? 0;
    if (stateId <= 0) continue;

    const culture = burg.culture !== undefined ? cultures[burg.culture] : undefined;
    const port: OceanPortBurg = {
      burgId: burg.i!,
      stateId,
      population: burg.population ?? 0,
      capital: Boolean(burg.capital),
      citadel: Boolean(burg.citadel),
      isShipyard: shipyardBurgIds.has(burg.i!),
      navalCulture: culture?.type === "Naval"
    };
    const list = byState.get(stateId) ?? [];
    list.push(port);
    byState.set(stateId, list);
  }

  for (const list of byState.values()) {
    list.sort((a, b) => b.population - a.population || a.burgId - b.burgId);
  }
  return byState;
}

export function pickOceanicEmpireStateIds(
  portsByState: ReadonlyMap<number, readonly OceanPortBurg[]>,
  period: HistoricalPeriod,
  maxEmpires = 2
): Set<number> {
  if (period !== "lateMedieval" && period !== "ageOfExploration") return new Set();

  const candidates: { stateId: number; portCount: number; shipyardCount: number }[] = [];
  for (const [stateId, ports] of portsByState) {
    const portCount = ports.length;
    const shipyardCount = ports.filter(p => p.isShipyard).length;
    if (portCount >= 6 && shipyardCount >= 3) {
      candidates.push({ stateId, portCount, shipyardCount });
    }
  }

  candidates.sort((a, b) => b.portCount - a.portCount || b.shipyardCount - a.shipyardCount || a.stateId - b.stateId);
  return new Set(candidates.slice(0, maxEmpires).map(c => c.stateId));
}

export function classifyMaritimeRole(input: {
  ports: readonly OceanPortBurg[];
  period: HistoricalPeriod;
  forceOceanic: boolean;
}): MaritimeRole {
  const { ports, period, forceOceanic } = input;
  if (forceOceanic && (period === "lateMedieval" || period === "ageOfExploration")) {
    return "oceanic_empire";
  }

  const portCount = ports.length;
  if (portCount <= 0) return "minor_coastal";

  const shipyardPortCount = ports.filter(p => p.isShipyard).length;
  const capitalIsPort = ports.some(p => p.capital);
  const navalShare = ports.filter(p => p.navalCulture).length / portCount;

  if (portCount >= 4 || (portCount >= 2 && shipyardPortCount >= 2) || (navalShare >= 0.5 && portCount >= 2)) {
    return "major_maritime";
  }
  if (portCount >= 2 || capitalIsPort) return "regional_maritime";
  return "minor_coastal";
}

/** Largest-remainder integer allocation of `total` across positive weights. */
export function allocateByWeights(total: number, weights: readonly number[]): number[] {
  if (total <= 0 || weights.length === 0) return weights.map(() => 0);
  const weightSum = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (weightSum <= 0) {
    const out = weights.map(() => 0);
    out[0] = total;
    return out;
  }

  const exact = weights.map(w => (total * Math.max(0, w)) / weightSum);
  const floors = exact.map(v => Math.floor(v));
  const remaining = total - floors.reduce((s, v) => s + v, 0);
  const order = exact.map((v, i) => ({ i, frac: v - floors[i] })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out = [...floors];
  for (let k = 0; k < remaining; k++) out[order[k % order.length].i]++;
  return out;
}

function scaleClassCounts(base: ClassCounts, total: number): ClassCounts {
  const baseTotal = base.sloop + base.caravel + base.galleon;
  if (total <= 0) return { sloop: 0, caravel: 0, galleon: 0 };
  if (baseTotal <= 0) return { sloop: total, caravel: 0, galleon: 0 };
  const [sloop, caravel, galleon] = allocateByWeights(total, [base.sloop, base.caravel, base.galleon]);
  return { sloop, caravel, galleon };
}

function applyFlagshipOutlier(
  counts: ClassCounts,
  period: HistoricalPeriod,
  role: MaritimeRole,
  stateId: number
): ClassCounts {
  if (counts.galleon > 0) return counts;
  if (period !== "lateMedieval" && period !== "ageOfExploration") return counts;
  if (role !== "minor_coastal" && role !== "regional_maritime") return counts;

  const p = FLAGSHIP_OUTLIER_P[role];
  if (unitHash(stateId, 0xf1a9, period.length) >= p) return counts;

  const next = { ...counts, galleon: 1 };
  if (next.sloop > 0) next.sloop--;
  else if (next.caravel > 0) next.caravel--;
  // If we somehow had zero small/medium, keep total +1 (rare); clamp later not needed for guidelines.
  return next;
}

export function planStateFleet(
  period: HistoricalPeriod,
  role: MaritimeRole,
  portCount: number,
  stateId: number
): StateFleetPlan {
  // early/high oceanic is disabled in the tables — fold to major.
  const effectiveRole: MaritimeRole =
    role === "oceanic_empire" && period !== "lateMedieval" && period !== "ageOfExploration" ? "major_maritime" : role;

  const guide = STARTER_GUIDELINES[period][effectiveRole];
  let total = guide.totalShipsBase + guide.shipsPerExtraPort * Math.max(0, portCount - guide.typicalPorts);
  total = Math.max(0, Math.min(MAX_FLEET_PER_STATE, total));

  let counts = scaleClassCounts(
    { sloop: guide.sloopCount, caravel: guide.caravelCount, galleon: guide.galleonCount },
    total
  );

  if (period === "earlyMedieval") {
    // Force no large hulls in the earliest period.
    const moved = counts.galleon;
    counts = { sloop: counts.sloop + moved, caravel: counts.caravel, galleon: 0 };
  }

  counts = applyFlagshipOutlier(counts, period, effectiveRole, stateId);
  total = counts.sloop + counts.caravel + counts.galleon;

  const stateHulls = Math.min(total, Math.round(total * guide.stateOwnedShare));
  const marketHulls = total - stateHulls;

  let maxTech = 0;
  if (counts.sloop > 0) maxTech = Math.max(maxTech, SHIP_CLASS_TECH_POINTS.sloop);
  if (counts.caravel > 0) maxTech = Math.max(maxTech, SHIP_CLASS_TECH_POINTS.caravel);
  if (counts.galleon > 0) maxTech = Math.max(maxTech, SHIP_CLASS_TECH_POINTS.galleon);

  return {
    ...counts,
    total,
    stateHulls,
    marketHulls,
    maxTechPointsRequired: maxTech,
    role: effectiveRole
  };
}

/**
 * Split class counts into state vs market preference lists.
 * State prefers large → medium → small; market prefers small → medium → large.
 */
export function splitHullsByOwner(plan: StateFleetPlan): { owner: "state" | "market"; shipClassId: ShipClassId }[] {
  const remaining: ClassCounts = {
    sloop: plan.sloop,
    caravel: plan.caravel,
    galleon: plan.galleon
  };
  const out: { owner: "state" | "market"; shipClassId: ShipClassId }[] = [];

  const take = (owner: "state" | "market", order: ShipClassId[], count: number) => {
    let left = count;
    for (const cls of order) {
      while (left > 0 && remaining[cls] > 0) {
        remaining[cls]--;
        left--;
        out.push({ owner, shipClassId: cls });
      }
    }
    // If preference order ran dry, take any remaining class.
    if (left > 0) {
      for (const cls of ["sloop", "caravel", "galleon"] as ShipClassId[]) {
        while (left > 0 && remaining[cls] > 0) {
          remaining[cls]--;
          left--;
          out.push({ owner, shipClassId: cls });
        }
      }
    }
  };

  take("state", ["galleon", "caravel", "sloop"], plan.stateHulls);
  take("market", ["sloop", "caravel", "galleon"], plan.marketHulls);
  return out;
}

function sortStateHomePorts(ports: readonly OceanPortBurg[]): OceanPortBurg[] {
  return [...ports].sort((a, b) => {
    const score = (p: OceanPortBurg) =>
      (p.capital ? 8 : 0) + (p.citadel ? 4 : 0) + (p.isShipyard ? 2 : 0) + Math.min(1, p.population);
    return score(b) - score(a) || b.population - a.population || a.burgId - b.burgId;
  });
}

function sortMarketHomePorts(ports: readonly OceanPortBurg[]): OceanPortBurg[] {
  // Prefer ordinary commercial ports over arsenal (capital/citadel) berths.
  return [...ports].sort((a, b) => {
    const arsenal = (p: OceanPortBurg) => (p.capital || p.citadel ? 1 : 0);
    return arsenal(a) - arsenal(b) || b.population - a.population || a.burgId - b.burgId;
  });
}

function portSeedCap(port: OceanPortBurg, capacity: ReadonlyMap<number, PortCapacity> | undefined): number {
  const cap = capacity?.get(port.burgId);
  if (!cap) return Math.max(8, 4 + Math.floor(port.population));
  return Math.max(3, cap.small + cap.medium + cap.large);
}

export function assignHullsToPorts(
  plan: StateFleetPlan,
  ports: readonly OceanPortBurg[],
  portCapacity?: ReadonlyMap<number, PortCapacity>
): HullSeedAssignment[] {
  if (ports.length === 0 || plan.total === 0) return [];

  const hulls = splitHullsByOwner(plan);
  const statePorts = sortStateHomePorts(ports);
  const marketPorts = sortMarketHomePorts(ports);
  const load = new Map<number, number>();
  for (const p of ports) load.set(p.burgId, 0);

  const pickPort = (ordered: OceanPortBurg[], preferUnderCap: boolean): OceanPortBurg => {
    if (preferUnderCap) {
      for (const p of ordered) {
        if ((load.get(p.burgId) ?? 0) < portSeedCap(p, portCapacity)) return p;
      }
    }
    // All over soft cap: pick least loaded.
    return ordered.reduce((best, p) => ((load.get(p.burgId) ?? 0) < (load.get(best.burgId) ?? 0) ? p : best));
  };

  const assignments: HullSeedAssignment[] = [];
  let marketIdx = 0;

  for (const hull of hulls) {
    // State navy: always prefer capital/citadel/shipyard order (fill preferred ports
    // up to soft cap before spilling). Merchant hulls round-robin commercial ports.
    let ordered: OceanPortBurg[];
    if (hull.owner === "state") {
      ordered = statePorts;
    } else {
      ordered = [
        ...marketPorts.slice(marketIdx % marketPorts.length),
        ...marketPorts.slice(0, marketIdx % marketPorts.length)
      ];
      marketIdx++;
    }

    const home = pickPort(ordered, true);
    load.set(home.burgId, (load.get(home.burgId) ?? 0) + 1);
    assignments.push({ owner: hull.owner, shipClassId: hull.shipClassId, homeBurgId: home.burgId });
  }

  return assignments;
}

function ensureTechFloor(stateId: number, minTechPoints: number): void {
  if (minTechPoints <= 0) return;
  const runtime = getShipbuildingRuntimeState();
  runtime.stateTechPoints[stateId] = Math.max(runtime.stateTechPoints[stateId] ?? 0, minTechPoints);
}

function resolveHistoricalPeriod(raw: unknown): HistoricalPeriod {
  if (raw === "earlyMedieval" || raw === "highMedieval" || raw === "lateMedieval" || raw === "ageOfExploration") {
    return raw;
  }
  return "ageOfExploration";
}

/**
 * Seed completed hulls for every port-owning state on a freshly generated map.
 * Must run after shipbuilding reset and candidate recompute.
 */
export function seedInitialFleets(
  candidates: readonly ShipyardCandidate[],
  portCapacity: ReadonlyMap<number, PortCapacity> = new Map()
): number {
  const { pack, options } = getWorldContext();
  const period = resolveHistoricalPeriod(options?.historicalPeriod);
  const shipyardBurgIds = new Set(candidates.map(c => c.burgId));
  const portsByState = collectOceanPortsByState(pack, shipyardBurgIds);
  const oceanicIds = pickOceanicEmpireStateIds(portsByState, period);
  const states = pack.states ?? [];
  let seeded = 0;

  for (const [stateId, ports] of portsByState) {
    if (stateId <= 0 || ports.length === 0) continue;
    // Skip missing/removed states.
    const state = states[stateId] as State | undefined;
    if (!state || (state as { removed?: boolean }).removed) continue;

    const role = classifyMaritimeRole({
      ports,
      period,
      forceOceanic: oceanicIds.has(stateId)
    });
    const plan = planStateFleet(period, role, ports.length, stateId);
    if (plan.total === 0) continue;

    ensureTechFloor(stateId, plan.maxTechPointsRequired);
    const assignments = assignHullsToPorts(plan, ports, portCapacity);

    for (const a of assignments) {
      const burg = pack.burgs[a.homeBurgId];
      if (!burg || burg.removed) continue;
      registerCompletedHull({
        burg,
        owner: a.owner,
        shipClassId: a.shipClassId,
        states,
        emitCompletedEvent: true
      });
      seeded++;
    }
  }

  return seeded;
}
