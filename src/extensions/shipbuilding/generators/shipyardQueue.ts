import type { Burg } from "../../hostTypes";
import { getHighestUnlockedShipClass, getShipClass } from "./shipClasses";
import type { ShipyardCandidate } from "./shipyardCandidates";

export type ShipyardOwner = "state" | "market";

export interface ShipyardQueueEntry {
  shipClassId: string;
  owner: ShipyardOwner;
  progress: number;
}

const TECH_POINTS_PER_YEAR_PER_SHIPYARD = 1;
const BUILD_POINTS_PER_YEAR = 2;

const _queues = new Map<number, ShipyardQueueEntry>(); // burgId -> active queue entry
const _stateTechPoints = new Map<number, number>(); // stateId -> accumulated tech points
// "state:<stateId>:<shipClassId>" or "market:<burgId>:<shipClassId>" -> completed hull count
const _completedHulls = new Map<string, number>();

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

function completeHull(burg: Burg, owner: ShipyardOwner, shipClassId: string): void {
  const ownerId = owner === "state" ? burg.state! : burg.i!;
  const key = completedHullKey(owner, ownerId, shipClassId);
  _completedHulls.set(key, (_completedHulls.get(key) ?? 0) + 1);

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
  deltaYears: number
): void {
  if (candidates.length === 0 || deltaYears <= 0) return;

  const shipyardCountByState = new Map<number, number>();
  for (const { burgId } of candidates) {
    const stateId = burgs[burgId]?.state;
    if (stateId) shipyardCountByState.set(stateId, (shipyardCountByState.get(stateId) ?? 0) + 1);
  }
  for (const [stateId, shipyardCount] of shipyardCountByState) {
    const gained = TECH_POINTS_PER_YEAR_PER_SHIPYARD * shipyardCount * deltaYears;
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
      entry = { shipClassId: unlockedClass.id, owner, progress: 0 };
      _queues.set(burgId, entry);
    } else {
      entry.owner = owner;
    }

    entry.progress += BUILD_POINTS_PER_YEAR * deltaYears;

    const classDef = getShipClass(entry.shipClassId) ?? unlockedClass;
    // A large deltaYears (e.g. from a big "advance time" jump) can complete several
    // hulls in one tick, so drain all of them rather than crediting only one.
    while (entry.progress >= classDef.buildPointsRequired) {
      entry.progress -= classDef.buildPointsRequired;
      completeHull(burg, owner, classDef.id);
    }
    // Re-evaluate the target class for the next hull — tech may have advanced.
    entry.shipClassId = unlockedClass.id;
  }
}

export function clearShipyardQueues(): void {
  _queues.clear();
  _stateTechPoints.clear();
  _completedHulls.clear();
}
