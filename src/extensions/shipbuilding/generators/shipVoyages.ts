import type { Burg, State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getShipClass } from "./shipClasses";
import { getHulls, isStateAtWar, type ShipHull, setHullStatus } from "./shipyardQueue";

// Placeholder balance constants — see docs/plan/ships.md ("航海訓練・偽装通商・諜報（暫定案）").
const GOLD_PER_BUILD_POINT_PER_YEAR = 4;
const INTEL_GAIN_PER_YEAR = 3;

/** Priority order for picking a voyage's "watched rival" — the closest thing to a live threat. */
const RELATION_WATCH_PRIORITY = ["Enemy", "Rival", "Suspicion"];

/**
 * Docked hulls not needed for war put to sea disguised as merchants — training crews,
 * earning gold, and (state-navy hulls only) gathering intelligence on a rival state —
 * instead of sitting idle filling up the port. Merchant-owned hulls have no war-recall
 * condition at all: they're civilian craft, always out trading once launched. See
 * docs/plan/ships.md ("航海訓練・偽装通商・諜報（暫定案）") for the full design.
 */
export function runVoyageTick(burgs: readonly Burg[], states: readonly State[], deltaYears: number): void {
  if (deltaYears <= 0) return;

  for (const hull of getHulls()) {
    // `state`/`ownerId` use 0 as the "no state" sentinel throughout this codebase
    // (e.g. `determineOwner()` in shipyardQueue.ts), so falsy — not just undefined —
    // means "no treasury to credit."
    const stateId = resolveHullStateId(hull, burgs);
    const atWar = Boolean(stateId) && isStateAtWar(stateId!, states);

    if (hull.owner === "state" && atWar) {
      if (hull.status === "voyage") setHullStatus(hull.id, "docked");
      continue; // recalled/mobilized for the war effort — no income, no intel, no berth freed
    }

    if (hull.status === "docked") setHullStatus(hull.id, "voyage");
    if (!stateId) continue; // stateless free-city hull — no treasury to credit

    dispatchVoyageIncome(hull, stateId, deltaYears);
    if (hull.owner === "state") dispatchVoyageIntel(stateId, states, deltaYears);
  }
}

function resolveHullStateId(hull: ShipHull, burgs: readonly Burg[]): number | undefined {
  if (hull.owner === "state") return hull.ownerId;
  return burgs[hull.ownerId]?.state;
}

function dispatchVoyageIncome(hull: ShipHull, stateId: number, deltaYears: number): void {
  const shipClass = getShipClass(hull.shipClassId);
  if (!shipClass) return;

  const amount = rn(shipClass.buildPointsRequired * GOLD_PER_BUILD_POINT_PER_YEAR * deltaYears, 2);
  if (amount <= 0) return;

  document.dispatchEvent(
    new CustomEvent("fmg:shipbuilding-voyage-income", {
      detail: { stateId, owner: hull.owner, amount, deltaYears }
    })
  );
}

function dispatchVoyageIntel(observerStateId: number, states: readonly State[], deltaYears: number): void {
  const targetStateId = pickIntelTarget(observerStateId, states);
  if (targetStateId === undefined) return;

  const amount = rn(INTEL_GAIN_PER_YEAR * deltaYears, 2);
  if (amount <= 0) return;

  document.dispatchEvent(
    new CustomEvent("fmg:shipbuilding-voyage-intel", {
      detail: { observerStateId, targetStateId, amount, deltaYears }
    })
  );
}

/** The most-watched rival state (Enemy > Rival > Suspicion), or undefined if there's no one worth spying on. */
function pickIntelTarget(observerStateId: number, states: readonly State[]): number | undefined {
  const observer = states[observerStateId];
  if (!observer?.diplomacy) return undefined;

  const diplomacy = observer.diplomacy as unknown[];
  for (const relation of RELATION_WATCH_PRIORITY) {
    const targetId = diplomacy.indexOf(relation);
    if (targetId >= 0 && states[targetId] && !states[targetId].removed) return targetId;
  }
  return undefined;
}
