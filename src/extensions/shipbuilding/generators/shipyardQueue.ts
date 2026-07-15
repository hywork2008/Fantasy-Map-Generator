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
  type State
} from "../../hostTypes";
import {
  getAnnualShipbuildingMaterialDemand,
  getHighestUnlockedShipClass,
  getMaterialsForWork,
  getShipClass,
  SHIPYARD_BUILD_POINTS_PER_YEAR,
  type ShipClass
} from "./shipClasses";
import type { ShipyardCandidate } from "./shipyardCandidates";

export type ShipyardOwner = "state" | "market";

/** Signature of ExtensionAPI.getEffectiveSkill — injected rather than imported so this
 * module stays a plain, host-independent unit under test (see AGENTS.md §7.3). */
export type GetEffectiveSkillFn = (characterId: number, skill: string) => number;

export interface ShipyardQueueEntry {
  shipClassId: string;
  owner: ShipyardOwner;
  progress: number;
  /** Potential work accumulated since the last material request, not yet construction progress. */
  pendingWorkPoints: number;
  blockedReason?: ShipbuildingMaterialBlockedReason;
  missingMaterials?: ShipbuildingMaterialShortage;
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
  owner: ShipyardOwner;
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

const allowMaterialsForUnitTests: RequestShipbuildingMaterialsFn = () => ({ status: "fulfilled" });
const ignoreStrategicProcurementDemand: NotifyStrategicProcurementDemandFn = () => {};

const _queues = new Map<number, ShipyardQueueEntry>(); // burgId -> active queue entry
const _stateTechPoints = new Map<number, number>(); // stateId -> accumulated tech points
// "state:<stateId>:<shipClassId>" or "market:<burgId>:<shipClassId>" -> completed hull count
const _completedHulls = new Map<string, number>();
const _hulls = new Map<number, ShipHull>(); // hullId -> hull record
let _nextHullId = 1;

/** True if the state has an active "Enemy" diplomacy relation with anyone — same idiom Economy's own tick hook already uses (`economy/index.tsx`) to decide wartime behavior, replicated here rather than imported since it's a plain read of `pack.states`. */
export function isStateAtWar(stateId: number, states: readonly State[]): boolean {
  const state = states[stateId];
  return Boolean(state?.diplomacy && (state.diplomacy as unknown[]).includes("Enemy"));
}

export function getHulls(): readonly ShipHull[] {
  return Array.from(_hulls.values());
}

export function getHullsAtBurg(burgId: number): ShipHull[] {
  return Array.from(_hulls.values()).filter(h => h.homeBurgId === burgId);
}

export function setHullStatus(hullId: number, status: ShipHullStatus): void {
  const hull = _hulls.get(hullId);
  if (hull) hull.status = status;
}

/**
 * A shipyard is state-run (a naval arsenal) only at a burg significant enough to
 * warrant one — its state's capital or a fortified (citadel) port. Every other
 * shipyard candidate defaults to a commercial/merchant queue funded by local trade.
 */
function determineOwner(burg: Burg): ShipyardOwner {
  return burg.state && (burg.capital || burg.citadel) ? "state" : "market";
}

export function getStateTechPoints(stateId: number): number {
  return _stateTechPoints.get(stateId) ?? 0;
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
  const rulerId = states[stateId]?.rulerId;
  if (!rulerId) return 1;
  return 1 + getEffectiveSkill(rulerId, "engineering") / 100;
}

function completedHullKey(owner: ShipyardOwner, ownerId: number, shipClassId: string): string {
  return `${owner}:${ownerId}:${shipClassId}`;
}

/** Completed hulls for a state's navy (owner: "state") or a single port's merchant fleet (owner: "market"). */
export function getCompletedHulls(owner: ShipyardOwner, ownerId: number, shipClassId: string): number {
  return _completedHulls.get(completedHullKey(owner, ownerId, shipClassId)) ?? 0;
}

export function getQueueEntry(burgId: number): ShipyardQueueEntry | undefined {
  return _queues.get(burgId);
}

function completeHull(burg: Burg, owner: ShipyardOwner, shipClassId: string, states: readonly State[]): void {
  const ownerId = owner === "state" ? burg.state! : burg.i!;
  const key = completedHullKey(owner, ownerId, shipClassId);
  _completedHulls.set(key, (_completedHulls.get(key) ?? 0) + 1);

  // Wartime navies launch straight into a docked/mobilized state; everything else
  // (peacetime navies and all merchant hulls) heads straight out to sea rather than
  // sitting idle — see docs/plan/ships.md "航海訓練・偽装通商・諜報（暫定案）".
  const staysDocked = owner === "state" && isStateAtWar(ownerId, states);
  const hull: ShipHull = {
    id: _nextHullId++,
    shipClassId,
    owner,
    ownerId,
    homeBurgId: burg.i!,
    status: staysDocked ? "docked" : "voyage"
  };
  _hulls.set(hull.id, hull);

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
  notifyStrategicProcurementDemand: NotifyStrategicProcurementDemandFn = ignoreStrategicProcurementDemand
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
    _stateTechPoints.set(stateId, getStateTechPoints(stateId) + gained);
  }

  for (const { burgId } of candidates) {
    const burg = burgs[burgId];
    if (!burg || burg.removed) continue;

    const owner = determineOwner(burg);
    const techPoints = burg.state ? getStateTechPoints(burg.state) : 0;
    const unlockedClass = getHighestUnlockedShipClass(techPoints);

    let entry = _queues.get(burgId);
    if (!entry) {
      entry = { shipClassId: unlockedClass.id, owner, progress: 0, pendingWorkPoints: 0 };
      _queues.set(burgId, entry);
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
    advanceQueueWithMaterials(entry, burg, classDef, deltaYears, requestMaterials, states);
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
): void {
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
      return;
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
      return;
    }

    entry.blockedReason = undefined;
    entry.missingMaterials = undefined;
    entry.progress += requestedWorkPoints;
    availableWorkPoints -= requestedWorkPoints;

    if (entry.progress + EPSILON < shipClass.buildPointsRequired) continue;

    entry.progress = 0;
    completeHull(burg, entry.owner, shipClass.id, states);
  }
}

export function clearShipyardQueues(): void {
  _queues.clear();
  _stateTechPoints.clear();
  _completedHulls.clear();
  _hulls.clear();
  _nextHullId = 1;
}
