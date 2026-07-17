import {
  type Burg,
  SHIPBUILDING_MATERIAL_IDS,
  type ShipbuildingMaterialBlockedReason,
  type ShipbuildingMaterialId,
  type ShipbuildingMaterialRequest,
  type ShipbuildingMaterialRequestResult,
  type ShipbuildingMaterialShortage,
  type ShipbuildingMaterials,
  type ShipbuildingStrategicProcurementDemand,
  type ShipGoodStock,
  type State
} from "../../hostTypes";
import { getShipbuildingRuntimeState } from "../shipbuildingContext";
import type { PortCapacity } from "./portCapacity";
import {
  getAnnualShipbuildingMaterialDemand,
  getHighestUnlockedShipClass,
  getMaterialsForWork,
  getShipClass,
  getShipSizeTier,
  SHIPYARD_BUILD_POINTS_PER_YEAR,
  type ShipClass
} from "./shipClasses";
import type { ShipyardCandidate } from "./shipyardCandidates";

export type ShipyardOwner = "state" | "market" | "shipyard";
type ShipHullOwner = Exclude<ShipyardOwner, "shipyard">;

/** Signature of ExtensionAPI.getEffectiveSkill — injected rather than imported so this
 * module stays a plain, host-independent unit under test (see AGENTS.md §7.3). */
export type GetEffectiveSkillFn = (characterId: number, skill: string) => number;

export interface ShipyardQueueEntry {
  shipClassId: string;
  owner: ShipHullOwner;
  progress: number;
  /** Potential work accumulated since the last material request, not yet construction progress. */
  pendingWorkPoints: number;
  blockedReason?: ShipbuildingMaterialBlockedReason;
  missingMaterials?: ShipbuildingMaterialShortage;
}

export interface SurplusShipyardQueueEntry extends Omit<ShipyardQueueEntry, "owner"> {
  owner: "shipyard";
}

export type ShipHullStatus = "docked" | "voyage";

/**
 * A single completed hull. `ownerId` is a stateId for `owner: "state"` (navy hulls are
 * pooled at the state level, matching `_completedHulls`'s existing key scheme) or a
 * burgId for `owner: "market"`. `homeBurgId` is always the burg that built it — hulls
 * don't relocate to other ports in this model. `status` tracks whether it currently
 * occupies a port berth (`"docked"`) or is out on a trade/training voyage (`"voyage"`,
 * see `shipVoyages.ts` and docs/plan/ships.md "航海訓練・偽装通商・諜報（暫定案）").
 */
export interface ShipHull {
  id: number;
  shipClassId: string;
  owner: ShipHullOwner;
  ownerId: number;
  homeBurgId: number;
  status: ShipHullStatus;
}

const TECH_POINTS_PER_YEAR_PER_SHIPYARD = 1;
/** 0.5 points maps to material quantities representable by Economy's two-decimal stocks. */
const MATERIAL_REQUEST_WORK_POINTS = 0.5;
const EPSILON = 0.000001;

export type RequestShipbuildingMaterialsFn = (
  request: Omit<ShipbuildingMaterialRequest, "result">
) => ShipbuildingMaterialRequestResult;

export type NotifyStrategicProcurementDemandFn = (demand: ShipbuildingStrategicProcurementDemand) => void;
export type RequestShipGoodStockFn = (marketId: number) => ShipGoodStock | undefined;
export type NotifySurplusShipCompletedFn = (burgId: number, marketId: number, shipClassId: string) => boolean;

const allowMaterialsForUnitTests: RequestShipbuildingMaterialsFn = () => ({ status: "fulfilled" });
const ignoreStrategicProcurementDemand: NotifyStrategicProcurementDemandFn = () => {};
const noShipGoodStock: RequestShipGoodStockFn = () => undefined;
const doNotAddSurplusShip: NotifySurplusShipCompletedFn = () => false;

/** True if the state has an active "Enemy" diplomacy relation with anyone — same idiom Economy's own tick hook already uses (`economy/index.tsx`) to decide wartime behavior, replicated here rather than imported since it's a plain read of `pack.states`. */
export function isStateAtWar(stateId: number, states: readonly State[]): boolean {
  const state = states[stateId];
  return Boolean(state?.diplomacy && (state.diplomacy as unknown[]).includes("Enemy"));
}

export function getHulls(): readonly ShipHull[] {
  return Object.values(getShipbuildingRuntimeState().hulls);
}

export function getHullsAtBurg(burgId: number): ShipHull[] {
  return Object.values(getShipbuildingRuntimeState().hulls).filter(h => h.homeBurgId === burgId);
}

export function setHullStatus(hullId: number, status: ShipHullStatus): void {
  const hull = getShipbuildingRuntimeState().hulls[hullId];
  if (hull) hull.status = status;
}

/**
 * A shipyard is state-run (a naval arsenal) only at a burg significant enough to
 * warrant one — its state's capital or a fortified (citadel) port. Every other
 * shipyard candidate defaults to a commercial/merchant queue funded by local trade.
 */
function determineOwner(burg: Burg): ShipHullOwner {
  return burg.state && (burg.capital || burg.citadel) ? "state" : "market";
}

export function getStateTechPoints(stateId: number): number {
  return getShipbuildingRuntimeState().stateTechPoints[stateId] ?? 0;
}

/**
 * Aggregated state-owned shipyard material demand for new-map initial stock warm-up
 * (docs/plan/shipbuilding-industrial-policy.md §4.6). Unlike the per-shipyard notifications
 * `runShipyardTick()` fires every tick, this runs once at generation time before any queue
 * exists, so ownership/ship-class come straight from burgs/tech points (both queue-independent)
 * and multiple state-owned shipyards sharing a market are summed into one entry per (state, market).
 */
export function getInitialStateOwnedDemand(
  candidates: readonly ShipyardCandidate[],
  burgs: readonly Burg[]
): ShipbuildingStrategicProcurementDemand[] {
  const demandByKey = new Map<string, ShipbuildingStrategicProcurementDemand>();

  for (const { burgId } of candidates) {
    const burg = burgs[burgId];
    if (!burg || burg.removed || !burg.state || !burg.market || determineOwner(burg) !== "state") continue;

    const unlockedClass = getHighestUnlockedShipClass(getStateTechPoints(burg.state));
    const annualMaterials = getAnnualShipbuildingMaterialDemand(unlockedClass);
    const key = `${burg.state}:${burg.market}`;
    const existing = demandByKey.get(key);

    demandByKey.set(key, {
      source: "shipbuilding",
      stateId: burg.state,
      destinationMarketId: burg.market,
      annualMaterials: existing ? mergeAnnualMaterials(existing.annualMaterials, annualMaterials) : annualMaterials
    });
  }

  return Array.from(demandByKey.values());
}

function mergeAnnualMaterials(a: ShipbuildingMaterials, b: ShipbuildingMaterials): ShipbuildingMaterials {
  const merged = {} as Record<ShipbuildingMaterialId, number>;
  for (const material of SHIPBUILDING_MATERIAL_IDS) merged[material] = (a[material] ?? 0) + (b[material] ?? 0);
  return merged;
}

function getRulerId(state: State | undefined): number | undefined {
  const rulerId = (state as unknown as Record<string, unknown> | undefined)?.rulerId;
  return typeof rulerId === "number" ? rulerId : undefined;
}

/**
 * A state's naval architecture research pace is boosted by its ruler's Engineering
 * skill (Nobility extension, if enabled) — read via the generic skill-modifier
 * registry, never by importing Nobility directly. Defaults to 1x (no bonus, no
 * penalty) when there's no ruler or Nobility isn't providing skill data.
 */
function getEngineeringMultiplier(
  stateId: number,
  states: readonly State[],
  getEffectiveSkill: GetEffectiveSkillFn
): number {
  const rulerId = getRulerId(states[stateId]);
  if (!rulerId) return 1;
  return 1 + getEffectiveSkill(rulerId, "engineering") / 100;
}

function completedHullKey(owner: ShipHullOwner, ownerId: number, shipClassId: string): string {
  return `${owner}:${ownerId}:${shipClassId}`;
}

/** Completed hulls for a state's navy (owner: "state") or a single port's merchant fleet (owner: "market"). */
export function getCompletedHulls(owner: ShipHullOwner, ownerId: number, shipClassId: string): number {
  return getShipbuildingRuntimeState().completedHulls[completedHullKey(owner, ownerId, shipClassId)] ?? 0;
}

export function getQueueEntry(burgId: number): ShipyardQueueEntry | undefined {
  return getShipbuildingRuntimeState().queues[burgId];
}

function completeHull(burg: Burg, owner: ShipHullOwner, shipClassId: string, states: readonly State[]): void {
  const ownerId = owner === "state" ? burg.state! : burg.i!;
  const key = completedHullKey(owner, ownerId, shipClassId);
  const runtimeState = getShipbuildingRuntimeState();
  runtimeState.completedHulls[key] = (runtimeState.completedHulls[key] ?? 0) + 1;

  // Wartime navies launch straight into a docked/mobilized state; everything else
  // (peacetime navies and all merchant hulls) heads straight out to sea rather than
  // sitting idle — see docs/plan/ships.md "航海訓練・偽装通商・諜報（暫定案）".
  const staysDocked = owner === "state" && isStateAtWar(ownerId, states);
  const hull: ShipHull = {
    id: runtimeState.nextHullId++,
    shipClassId,
    owner,
    ownerId,
    homeBurgId: burg.i!,
    status: staysDocked ? "docked" : "voyage"
  };
  runtimeState.hulls[hull.id] = hull;

  document.dispatchEvent(
    new CustomEvent("fmg:shipbuilding-ship-completed", {
      detail: { burgId: burg.i, stateId: burg.state ?? null, owner, shipClassId }
    })
  );
}

/**
 * Called on every advanceTime() tick (via Shipbuilding's registerTimeTickHook). Advances
 * each shipyard candidate's build queue and each state's naval tech points. Ship class
 * tiers are gated by the burg's own state's tech points (0 for stateless/free-city burgs);
 * both state- and market-owned queues draw from the same state tech pool — merchant
 * shipwrights aren't presumed to lag behind the crown's own arsenals here.
 */
export function runShipyardTick(
  candidates: readonly ShipyardCandidate[],
  burgs: readonly Burg[],
  states: readonly State[],
  deltaYears: number,
  getEffectiveSkill: GetEffectiveSkillFn,
  requestMaterials: RequestShipbuildingMaterialsFn = allowMaterialsForUnitTests,
  notifyStrategicProcurementDemand: NotifyStrategicProcurementDemandFn = ignoreStrategicProcurementDemand,
  requestShipGoodStock: RequestShipGoodStockFn = noShipGoodStock,
  notifySurplusShipCompleted: NotifySurplusShipCompletedFn = doNotAddSurplusShip,
  portCapacityByBurg: ReadonlyMap<number, PortCapacity> = new Map()
): void {
  if (candidates.length === 0 || deltaYears <= 0) return;

  const shipyardCountByState = new Map<number, number>();
  for (const { burgId } of candidates) {
    const stateId = burgs[burgId]?.state;
    if (stateId) shipyardCountByState.set(stateId, (shipyardCountByState.get(stateId) ?? 0) + 1);
  }
  for (const [stateId, shipyardCount] of shipyardCountByState) {
    const engineeringMultiplier = getEngineeringMultiplier(stateId, states, getEffectiveSkill);
    const gained = TECH_POINTS_PER_YEAR_PER_SHIPYARD * shipyardCount * deltaYears * engineeringMultiplier;
    getShipbuildingRuntimeState().stateTechPoints[stateId] = getStateTechPoints(stateId) + gained;
  }

  for (const { burgId } of candidates) {
    const burg = burgs[burgId];
    if (!burg || burg.removed) continue;

    const owner = determineOwner(burg);
    const techPoints = burg.state ? getStateTechPoints(burg.state) : 0;
    const unlockedClass = getHighestUnlockedShipClass(techPoints);

    const runtimeState = getShipbuildingRuntimeState();
    let entry = runtimeState.queues[burgId];
    if (!entry) {
      entry = { shipClassId: unlockedClass.id, owner, progress: 0, pendingWorkPoints: 0 };
      runtimeState.queues[burgId] = entry;
    } else {
      entry.owner = owner;
    }

    if (entry.owner === "state" && burg.state && burg.market) {
      notifyStrategicProcurementDemand({
        source: "shipbuilding",
        stateId: burg.state,
        destinationMarketId: burg.market,
        annualMaterials: getAnnualShipbuildingMaterialDemand(getShipClass(entry.shipClassId) ?? unlockedClass)
      });
    }

    const classDef = getShipClass(entry.shipClassId) ?? unlockedClass;
    const unusedWorkPoints = advanceQueueWithMaterials(entry, burg, classDef, deltaYears, requestMaterials, states);
    if (owner === "market" && unusedWorkPoints > EPSILON) {
      advanceSurplusQueue(
        burg,
        techPoints,
        unusedWorkPoints,
        requestMaterials,
        requestShipGoodStock,
        notifySurplusShipCompleted,
        portCapacityByBurg.get(burgId)
      );
    }
    // Re-evaluate the target class for the next hull — tech may have advanced.
    entry.shipClassId = unlockedClass.id;
  }
}

function advanceQueueWithMaterials(
  entry: ShipyardQueueEntry,
  burg: Burg,
  shipClass: ShipClass,
  deltaYears: number,
  requestMaterials: RequestShipbuildingMaterialsFn,
  states: readonly State[]
): number {
  let availableWorkPoints = entry.pendingWorkPoints + SHIPYARD_BUILD_POINTS_PER_YEAR * deltaYears;
  entry.pendingWorkPoints = 0;

  while (availableWorkPoints > EPSILON) {
    const remainingWorkPoints = Math.max(0, shipClass.buildPointsRequired - entry.progress);
    const requestedWorkPoints = Math.min(availableWorkPoints, remainingWorkPoints, MATERIAL_REQUEST_WORK_POINTS);
    const completesHull = requestedWorkPoints + EPSILON >= remainingWorkPoints;

    // Daily progress accumulates until material quantities are representable by Economy's
    // two-decimal market stock. A final partial chunk still settles the hull exactly.
    if (!completesHull && requestedWorkPoints + EPSILON < MATERIAL_REQUEST_WORK_POINTS) {
      entry.pendingWorkPoints = requestedWorkPoints;
      return 0;
    }

    const result = requestMaterials({
      burgId: burg.i!,
      marketId: burg.market ?? 0,
      shipClassId: shipClass.id,
      owner: entry.owner,
      workPoints: requestedWorkPoints,
      materials: getMaterialsForWork(shipClass, requestedWorkPoints)
    });

    if (result.status !== "fulfilled") {
      entry.blockedReason = result.status;
      entry.missingMaterials = result.status === "insufficientMaterials" ? result.missing : undefined;
      // Preserve the work points this attempt was for — they represent capacity the shipyard has
      // already earned (SHIPYARD_BUILD_POINTS_PER_YEAR accrual), not capacity contingent on the
      // material check succeeding. Discarding them here (as this used to do) meant a single
      // materials shortfall reset the accumulator to 0, forcing MATERIAL_REQUEST_WORK_POINTS worth
      // of days (~91 at the default rate) to reaccumulate from scratch before the next attempt —
      // so a state-owned shipyard whose supply chain simply hadn't caught up yet by the first
      // ~quarterly checkpoint could show 0% progress for an entire year even once material became
      // available on every other day. Carrying it forward means next tick retries immediately.
      entry.pendingWorkPoints = requestedWorkPoints;
      return Math.max(0, availableWorkPoints - requestedWorkPoints);
    }

    entry.blockedReason = undefined;
    entry.missingMaterials = undefined;
    entry.progress += requestedWorkPoints;
    availableWorkPoints -= requestedWorkPoints;

    if (entry.progress + EPSILON < shipClass.buildPointsRequired) continue;

    entry.progress = 0;
    completeHull(burg, entry.owner, shipClass.id, states);
  }
  return 0;
}

/**
 * Converts capacity left unused by a merchant queue into a separate, generic market-stock
 * stream. It never creates ShipHull records, so voyage and owner lifecycle logic remains
 * confined to the existing state/market queues.
 */
function advanceSurplusQueue(
  burg: Burg,
  techPoints: number,
  availableWorkPoints: number,
  requestMaterials: RequestShipbuildingMaterialsFn,
  requestShipGoodStock: RequestShipGoodStockFn,
  notifySurplusShipCompleted: NotifySurplusShipCompletedFn,
  portCapacity: PortCapacity | undefined
): void {
  if (!burg.market || !burg.i || !portCapacity) return;

  const stock = requestShipGoodStock(burg.market);
  if (!stock) return;
  const mutableStock = { ...stock };

  // A hull already under construction (materials already spent on it) keeps its class
  // until it completes, even if the heuristic below would now pick a different one —
  // re-selecting mid-build would silently discard the sunk progress/materials.
  const runtimeState = getShipbuildingRuntimeState();
  const inProgress = runtimeState.surplusQueues[burg.i];
  const hasSunkProgress = Boolean(inProgress) && inProgress!.progress + inProgress!.pendingWorkPoints > EPSILON;
  const shipClass = hasSunkProgress
    ? getShipClass(inProgress!.shipClassId)
    : selectSurplusShipClass(techPoints, mutableStock);
  if (!shipClass || !hasFreePortBerth(burg.i, shipClass, mutableStock, portCapacity)) return;

  let entry = inProgress;
  if (!entry || entry.shipClassId !== shipClass.id) {
    entry = { shipClassId: shipClass.id, owner: "shipyard", progress: 0, pendingWorkPoints: 0 };
    runtimeState.surplusQueues[burg.i] = entry;
  }

  let workPoints = entry.pendingWorkPoints + availableWorkPoints;
  entry.pendingWorkPoints = 0;
  while (workPoints > EPSILON) {
    if (!hasFreePortBerth(burg.i, shipClass, mutableStock, portCapacity)) return;
    const remaining = Math.max(0, shipClass.buildPointsRequired - entry.progress);
    const requested = Math.min(workPoints, remaining, MATERIAL_REQUEST_WORK_POINTS);
    const completesShip = requested + EPSILON >= remaining;
    if (!completesShip && requested + EPSILON < MATERIAL_REQUEST_WORK_POINTS) {
      entry.pendingWorkPoints = requested;
      return;
    }

    const result = requestMaterials({
      burgId: burg.i,
      marketId: burg.market,
      shipClassId: shipClass.id,
      owner: "shipyard",
      workPoints: requested,
      materials: getMaterialsForWork(shipClass, requested)
    });
    if (result.status !== "fulfilled") {
      entry.blockedReason = result.status;
      entry.missingMaterials = result.status === "insufficientMaterials" ? result.missing : undefined;
      entry.pendingWorkPoints = requested;
      return;
    }

    entry.blockedReason = undefined;
    entry.missingMaterials = undefined;
    entry.progress += requested;
    workPoints -= requested;
    if (entry.progress + EPSILON < shipClass.buildPointsRequired) continue;

    if (!notifySurplusShipCompleted(burg.i, burg.market, shipClass.id)) return;
    mutableStock[shipClass.name as keyof ShipGoodStock]++;
    entry.progress = 0;
  }
}

function selectSurplusShipClass(techPoints: number, stock: ShipGoodStock): ShipClass | undefined {
  const sloop = getShipClass("sloop");
  const caravel = getShipClass("caravel");
  if (!sloop || !caravel) return undefined;
  if (techPoints >= caravel.techPointsRequired && stock.Sloop > 0 && stock.Caravel === 0) return caravel;
  return sloop;
}

function hasFreePortBerth(burgId: number, shipClass: ShipClass, stock: ShipGoodStock, capacity: PortCapacity): boolean {
  const tier = getShipSizeTier(shipClass);
  const dockedHulls = getHullsAtBurg(burgId).filter(hull => {
    const hullClass = getShipClass(hull.shipClassId);
    return hull.status === "docked" && hullClass?.tier === shipClass.tier;
  }).length;
  const storedShips =
    shipClass.id === "sloop" ? stock.Sloop : shipClass.id === "caravel" ? stock.Caravel : stock.Galleon;
  return dockedHulls + storedShips < capacity[tier];
}

export function clearShipyardQueues(): void {
  const runtimeState = getShipbuildingRuntimeState();
  runtimeState.queues = {};
  runtimeState.surplusQueues = {};
  runtimeState.stateTechPoints = {};
  runtimeState.completedHulls = {};
  runtimeState.hulls = {};
  runtimeState.nextHullId = 1;
}
