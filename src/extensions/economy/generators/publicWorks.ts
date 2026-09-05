/**
 * Public Works — the state budget line that turns tax revenue back into infrastructure.
 * docs/plan/economy-coupling-audit.md L8 stage 2.
 *
 * Before this, `pack.routes` was purely exogenous to the economy: the map generator laid every
 * trail and road once, `steamIndustry.ts` added railways, and nothing a state did with its money
 * could change the network — while the network itself fed burg capacity and every travel time.
 * The arrow only ever pointed downstream. This module closes it:
 *
 *  1. Caravans leave a traffic trail on the routes they actually use (`Route.traffic`).
 *  2. Once a `trails` route is busy enough *and* the state that owns most of it can pay for the
 *     paving, it is promoted to `roads` — faster for every later caravan
 *     (`PAVED_ROAD_SPEED_BONUS` in tradeRouteDuration.ts) and worth more connectivity.
 *  3. The same budget builds harbour works at ports (shorter mode-transfer penalty) and public
 *     granaries (a deeper `Burg.foodReserve` buffer against the L3 famine loop).
 *
 * Money comes from L3a `state.departmentBalances.publicWorks`, credited every tax cycle like any
 * other department. Unlike the four office departments it funds no stipend and is exempt from the
 * L3a over-cap remit (see CAPPED_DEPARTMENT_KEYS), because a single paving project can cost more
 * than a small state's whole annual works budget and has to be saved up for.
 *
 * The existing `Dams` / `Levees` systems are deliberately left alone: those are market-financed
 * and stay a parallel track, as the audit's "intentionally loose" list records.
 */

import type { Burg, Route, State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { ANNUAL_GATE, getSimulationYear, getWorldContext, settleAnnualOnce } from "../economyContext";
import type { TradeRouteSegment } from "./marketTypes";
import { TradeRoutePlanner } from "./tradeRoutePlanner";
import { ensureDepartmentBalances } from "./treasuryAllocation";

/** Share of last year's accumulated route traffic carried into this year. */
export const ROUTE_TRAFFIC_ANNUAL_RETENTION = 0.7;

/**
 * Caravan departures (after decay) a trail must be carrying before paving it is even considered.
 * With the 0.7 retention above, a route settles at roughly `annualDepartures / 0.3` — so this is
 * a corridor sustaining ~8 shipments a year, not a one-off convoy.
 */
export const ROAD_PROMOTION_TRAFFIC_THRESHOLD = 24;

/** Silver pieces per route cell to metal a trail into a road. */
export const ROAD_PROMOTION_COST_PER_CELL = 12;

/**
 * Share of a trail's cells that must lie inside the paying state. A trade trail wandering across
 * three realms is nobody's public works project; the state that carries most of it pays for all
 * of it, which is also why the promotion is not split per-cell.
 */
export const ROAD_PROMOTION_OWNERSHIP_MIN = 0.6;

/** Works are built in fixed increments so one rich year cannot finish a harbour outright. */
export const WORKS_LEVEL_STEP = 0.2;
export const HARBOR_WORKS_COST_PER_STEP = 150;
export const GRANARY_WORKS_COST_PER_STEP = 100;

/** Fraction of a works level lost each year to silting, rot and neglect when nothing is funded. */
export const WORKS_ANNUAL_DECAY = 0.04;

/**
 * How this year's balance is offered to the three project types. Roads first — they are the
 * headline of L8 and the only line with a traffic prerequisite — then harbours, then granaries.
 * Whatever an earlier envelope cannot spend rolls into the later ones, so a landlocked state
 * simply puts its harbour money into granaries instead of wasting it.
 */
export const ROAD_BUDGET_SHARE = 0.5;
export const HARBOR_BUDGET_SHARE = 0.25;

/** Extra `BURG_TARGET_RESERVE_DAYS` a fully built-out public granary buys (as a multiplier). */
export const GRANARY_MAX_RESERVE_BONUS = 1;

export interface PublicWorksSettlement {
  stateId: number;
  spent: number;
  roadsPaved: number;
  harborSteps: number;
  granarySteps: number;
}

const _settlementByState = new Map<number, PublicWorksSettlement>();

export function getPublicWorksSettlements(): PublicWorksSettlement[] {
  return Array.from(_settlementByState.values());
}

export function clearPublicWorksSettlements(): void {
  _settlementByState.clear();
}

/** Reserve-days multiplier this burg's public granary earns (1 = no granary). */
export function getGranaryReserveMultiplier(burg: Pick<Burg, "publicWorks">): number {
  const granary = burg.publicWorks?.granary ?? 0;
  if (!(granary > 0)) return 1;
  return 1 + GRANARY_MAX_RESERVE_BONUS * Math.min(1, granary);
}

function ensureBurgWorks(burg: Burg): NonNullable<Burg["publicWorks"]> {
  if (!burg.publicWorks) burg.publicWorks = {};
  return burg.publicWorks;
}

/** Route ids a caravan's land legs run over, deduplicated (a route crossed twice still counts once). */
function landRouteIdsOf(segments: readonly TradeRouteSegment[]): Set<number> {
  const ids = new Set<number>();
  const cellRoutes = getWorldContext().pack.cells?.routes;
  if (!cellRoutes) return ids;

  for (const segment of segments) {
    if (segment.type !== "land") continue;
    for (let index = 0; index < segment.points.length - 1; index++) {
      const from = segment.points[index][2];
      const to = segment.points[index + 1][2];
      if (from === undefined || to === undefined || from === to) continue;
      const routeId = cellRoutes[from]?.[to];
      if (routeId !== undefined) ids.add(routeId);
    }
  }
  return ids;
}

function findRouteById(routes: readonly Route[], routeId: number): Route | undefined {
  // Route ids match array indices on a freshly generated map; only fall back to a scan when
  // editor removals have shifted them.
  const direct = routes[routeId];
  if (direct?.i === routeId) return direct;
  return routes.find(route => route.i === routeId);
}

/**
 * Records one caravan departure on every land route it will travel. Called from both departure
 * paths in caravans.ts (commercial sailing and state procurement); sea and river legs leave no
 * mark because no budget maintains them.
 */
export function recordRouteTraffic(segments: readonly TradeRouteSegment[]): void {
  const routes = getWorldContext().pack?.routes;
  if (!routes?.length) return;

  for (const routeId of landRouteIdsOf(segments)) {
    const route = findRouteById(routes, routeId);
    if (!route) continue;
    route.traffic = rn((route.traffic ?? 0) + 1, 3);
  }
}

/** Cells a route runs through, from `cells` when present and from the polyline otherwise. */
function routeCells(route: Route): number[] {
  if (route.cells?.length) return route.cells;
  const cells: number[] = [];
  for (const point of route.points) {
    const cellId = point[2];
    if (cellId !== undefined && cells[cells.length - 1] !== cellId) cells.push(cellId);
  }
  return cells;
}

interface RoadCandidate {
  route: Route;
  cost: number;
  traffic: number;
}

/** Trails inside `stateId` that are busy enough to be worth paving, dearest-traffic first. */
function findRoadCandidates(stateId: number): RoadCandidate[] {
  const { pack } = getWorldContext();
  const cellState = pack.cells?.state;
  if (!cellState) return [];

  const candidates: RoadCandidate[] = [];
  for (const route of pack.routes) {
    if (route.group !== "trails") continue;
    const traffic = route.traffic ?? 0;
    if (traffic < ROAD_PROMOTION_TRAFFIC_THRESHOLD) continue;

    const cells = routeCells(route);
    if (cells.length < 2) continue;
    let owned = 0;
    for (const cellId of cells) if (cellState[cellId] === stateId) owned++;
    if (owned / cells.length < ROAD_PROMOTION_OWNERSHIP_MIN) continue;

    candidates.push({ route, cost: rn(cells.length * ROAD_PROMOTION_COST_PER_CELL, 2), traffic });
  }
  candidates.sort((a, b) => b.traffic - a.traffic);
  return candidates;
}

/** This state's own burgs, largest first — works go where the traffic and the mouths are. */
function stateBurgs(stateId: number): Burg[] {
  const burgs = getWorldContext().pack.burgs ?? [];
  return burgs
    .filter(burg => burg?.i && !burg.removed && burg.state === stateId)
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0));
}

/**
 * Spends one state's Public Works balance for the year. Returns the settlement summary; the
 * caller aggregates `roadsPaved` to decide whether the route network has to be redrawn.
 */
function settleStatePublicWorks(state: State): PublicWorksSettlement {
  const settlement: PublicWorksSettlement = {
    stateId: state.i,
    spent: 0,
    roadsPaved: 0,
    harborSteps: 0,
    granarySteps: 0
  };

  const balances = ensureDepartmentBalances(state);
  const budget = Math.max(0, balances.publicWorks || 0);
  if (!(budget > 0)) return settlement;

  let remaining = budget;
  const spend = (amount: number): boolean => {
    if (amount > remaining + 1e-9) return false;
    remaining = rn(remaining - amount, 2);
    settlement.spent = rn(settlement.spent + amount, 2);
    return true;
  };

  // 1. Roads. Skipping a candidate the envelope cannot afford (rather than stopping) lets a
  // shorter busy trail get paved this year while the state keeps saving for the long one.
  let roadEnvelope = rn(budget * ROAD_BUDGET_SHARE, 2);
  for (const candidate of findRoadCandidates(state.i)) {
    if (candidate.cost > roadEnvelope) continue;
    if (!spend(candidate.cost)) continue;
    roadEnvelope = rn(roadEnvelope - candidate.cost, 2);
    candidate.route.group = "roads";
    settlement.roadsPaved++;
  }

  // 2. Harbours, then 3. granaries — each envelope inherits what the previous one left unspent.
  const burgs = stateBurgs(state.i);
  let harborEnvelope = rn(budget * HARBOR_BUDGET_SHARE + roadEnvelope, 2);
  for (const burg of burgs) {
    if (!burg.port) continue;
    const works = burg.publicWorks;
    if ((works?.harbor ?? 0) >= 1) continue;
    if (HARBOR_WORKS_COST_PER_STEP > harborEnvelope) break;
    if (!spend(HARBOR_WORKS_COST_PER_STEP)) break;
    harborEnvelope = rn(harborEnvelope - HARBOR_WORKS_COST_PER_STEP, 2);
    const target = ensureBurgWorks(burg);
    target.harbor = rn(Math.min(1, (target.harbor ?? 0) + WORKS_LEVEL_STEP), 3);
    settlement.harborSteps++;
  }

  let granaryEnvelope = remaining;
  for (const burg of burgs) {
    const works = burg.publicWorks;
    if ((works?.granary ?? 0) >= 1) continue;
    if (GRANARY_WORKS_COST_PER_STEP > granaryEnvelope) break;
    if (!spend(GRANARY_WORKS_COST_PER_STEP)) break;
    granaryEnvelope = rn(granaryEnvelope - GRANARY_WORKS_COST_PER_STEP, 2);
    const target = ensureBurgWorks(burg);
    target.granary = rn(Math.min(1, (target.granary ?? 0) + WORKS_LEVEL_STEP), 3);
    settlement.granarySteps++;
  }

  balances.publicWorks = rn(Math.max(0, budget - settlement.spent), 2);
  return settlement;
}

/** Yearly traffic decay, so a corridor that falls out of use loses its claim on the budget. */
function decayRouteTraffic(): void {
  for (const route of getWorldContext().pack.routes) {
    if (!route.traffic) continue;
    const next = rn(route.traffic * ROUTE_TRAFFIC_ANNUAL_RETENTION, 3);
    route.traffic = next > 0.01 ? next : undefined;
  }
}

/**
 * Yearly works decay. Funded burgs are topped straight back up by the spending pass below.
 * Returns true when any level moved.
 */
function decayBurgWorks(): boolean {
  let changed = false;
  for (const burg of getWorldContext().pack.burgs ?? []) {
    const works = burg?.publicWorks;
    if (!works) continue;
    if (works.harbor) {
      works.harbor = rn(Math.max(0, works.harbor - WORKS_ANNUAL_DECAY), 3);
      changed = true;
    }
    if (works.granary) {
      works.granary = rn(Math.max(0, works.granary - WORKS_ANNUAL_DECAY), 3);
      changed = true;
    }
  }
  return changed;
}

export interface PublicWorksAnnualResult {
  /** This call claimed the year's gate and actually ran (false on every later tick that year). */
  settled: boolean;
  /** A trail was promoted to `roads` — `map.networks` must be invalidated and redrawn. */
  networkChanged: boolean;
  /** A harbour or granary level moved (built or decayed) — `simulation.burgs` changed. */
  worksChanged: boolean;
}

export class PublicWorksModule {
  /**
   * Settles this year's public works, at most once per simulation year. The `networkChanged`
   * flag follows the same contract `SteamIndustry.settleAnnual()` uses for newly laid railway
   * track; `worksChanged` covers the per-burg harbour/granary levels, which move on their own
   * (through decay) even in a year when nothing is paved.
   */
  settleAnnual(): PublicWorksAnnualResult {
    const result: PublicWorksAnnualResult = { settled: false, networkChanged: false, worksChanged: false };
    result.settled = settleAnnualOnce(ANNUAL_GATE.publicWorks, () => {
      // Wear first, then this year's grants — so a funded burg's budget repairs the decay
      // instead of the decay immediately eating what was just built.
      result.worksChanged = decayBurgWorks();

      _settlementByState.clear();
      for (const state of getWorldContext().pack.states ?? []) {
        if (!state?.i || state.removed) continue;
        const settlement = settleStatePublicWorks(state);
        _settlementByState.set(state.i, settlement);
        if (settlement.roadsPaved > 0) result.networkChanged = true;
        if (settlement.harborSteps > 0 || settlement.granarySteps > 0) result.worksChanged = true;
      }

      // Traffic decays only after the paving decision, so the threshold is measured against the
      // traffic a corridor actually carried since the last settlement, not a pre-discounted one.
      decayRouteTraffic();

      if (result.networkChanged) {
        // A promoted route keeps its geometry but changes cost and connectivity class, so every
        // cached path planned against the old surface has to be thrown away.
        TradeRoutePlanner.clearCache();
      }
    });
    return result;
  }

  /** Current simulation year, exposed for tests that need the gate's key year. */
  getSettlementYear(): number {
    return getSimulationYear();
  }
}

export const PublicWorks = new PublicWorksModule();
