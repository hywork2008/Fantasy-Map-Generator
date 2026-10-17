import { simEvents } from "../../../simulation/events";
import type { Burg, State } from "../../hostTypes";
import { rn } from "../../hostUtils";
import { getShipClass } from "./shipClasses";
import { berthHullAtPort, getHulls, isStateAtWar, type ShipHull, setHullStatus } from "./shipyardQueue";

// Placeholder balance constant — see docs/plan/ships.md ("航海訓練・偽装通商・諜報（暫定案）").
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
    // The crew is on the State's payroll in war and peace, at sea or in the yard.
    if (hull.owner === "state") dispatchNavyPayroll(hull, resolveHullStateId(hull, burgs), deltaYears);
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

    dispatchVoyageTrade(hull, stateId, deltaYears);
    dispatchVoyageIntel(stateId, states, deltaYears);
  }
}

function resolveHullStateId(hull: ShipHull, burgs: readonly Burg[]): number | undefined {
  if (hull.owner === "state") return hull.ownerId;
  return burgs[hull.ownerId]?.state;
}

/**
 * A patrolling state ship trades under a merchant flag (docs/plan/ships.md §4.5): Economy buys
 * export goods from its home port's market, sells them abroad and brings back luxuries the market
 * buys at a markup (docs/plan/initial-wealth-calibration.md §8). This only reports the voyage;
 * the goods and money move in Economy.
 */
function dispatchVoyageTrade(hull: ShipHull, stateId: number, deltaYears: number): void {
  const shipClass = getShipClass(hull.shipClassId);
  if (!shipClass) return;
  simEvents.dispatchEvent(
    new CustomEvent("fmg:shipbuilding-voyage-trade", {
      detail: { stateId, homeBurgId: hull.homeBurgId, buildPoints: shipClass.buildPointsRequired, deltaYears }
    })
  );
}

/** Crew wages, paid by Economy from the State treasury into the home port's households. */
function dispatchNavyPayroll(hull: ShipHull, stateId: number | undefined, deltaYears: number): void {
  const crew = getShipClass(hull.shipClassId)?.navalCrewCapacity ?? 0;
  if (!stateId || !(crew > 0) || !(deltaYears > 0)) return;
  simEvents.dispatchEvent(
    new CustomEvent("fmg:shipbuilding-navy-payroll", {
      detail: { stateId, homeBurgId: hull.homeBurgId, crew, deltaYears }
    })
  );
}

function dispatchVoyageIntel(observerStateId: number, states: readonly State[], deltaYears: number): void {
  const targetStateId = pickIntelTarget(observerStateId, states);
  if (targetStateId === undefined) return;

  const amount = rn(INTEL_GAIN_PER_YEAR * deltaYears, 2);
  if (amount <= 0) return;

  simEvents.dispatchEvent(
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
