import type { Burg, State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getShipClass } from "./shipClasses";
import { berthHullAtPort, getHulls, isStateAtWar, type ShipHull, setHullStatus } from "./shipyardQueue";

// Placeholder balance constants — see docs/plan/ships.md ("航海訓練・偽装通商・諜報（暫定案）").
const GOLD_PER_BUILD_POINT_PER_YEAR = 4;
const INTEL_GAIN_PER_YEAR = 3;

/** Priority order for picking a voyage's "watched rival" — the closest thing to a live threat. */
const RELATION_WATCH_PRIORITY = ["Enemy", "Rival", "Suspicion"];

/**
 * State-navy patrol / recall tick. Merchant hulls no longer earn abstract voyage gold —
 * they wait idle in port and earn via Economy cargo deals
 * (docs/plan/vessel-itinerary-and-finite-trade-fleet.md P1).
 */
export function runVoyageTick(burgs: readonly Burg[], states: readonly State[], deltaYears: number): void {
  if (deltaYears <= 0) return;

  for (const hull of getHulls()) {
    if (hull.status === "cargo") continue;
    // OverseasRelations owns this hull until the escorting expedition resolves.
    if (hull.duty === "overseas") continue;

    if (hull.status === "maintenance") {
      const remainingDays = Math.max(0, (hull.maintenanceDays ?? 0) - deltaYears * 365.2425);
      hull.maintenanceDays = remainingDays;
      if (remainingDays > 0) continue;
      // Merchants return to an idle berth; navy resumes patrol below.
      if (hull.owner === "market") {
        berthHullAtPort(hull.id, hull.currentBurgId ?? hull.homeBurgId);
        continue;
      }
      setHullStatus(hull.id, "voyage");
      hull.duty = "patrol";
      hull.currentBurgId = null;
    }

    // Merchant ships: no abstract voyage income; do not auto-undock.
    if (hull.owner === "market") continue;

    const stateId = resolveHullStateId(hull, burgs);
    const atWar = Boolean(stateId) && isStateAtWar(stateId!, states);

    if (atWar) {
      if (hull.status === "voyage") {
        setHullStatus(hull.id, "docked");
        hull.duty = "idle";
        hull.currentBurgId = hull.homeBurgId;
        hull.nextBurgId = null;
        hull.routeProgress = 0;
      }
      continue; // mobilized — no income, no intel
    }

    if (hull.status === "docked") {
      setHullStatus(hull.id, "voyage");
      hull.duty = "patrol";
      hull.currentBurgId = null;
    }
    if (!stateId) continue;

    dispatchVoyageIncome(hull, stateId, deltaYears);
    dispatchVoyageIntel(stateId, states, deltaYears);
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
