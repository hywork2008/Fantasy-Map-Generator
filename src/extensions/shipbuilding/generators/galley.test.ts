import { describe, expect, it } from "vitest";
import { getTransportAllocations } from "../../economy/generators/tradeCargo";
import { galleysForStateHulls, planStateFleet, splitHullsByOwner } from "./initialFleet";
import { getHighestUnlockedShipClass, getShipClass, getShipSizeTier } from "./shipClasses";

describe("galley (antiquity warship)", () => {
  it("is a state-only warship: never the next shipyard tier nor a cargo carrier", () => {
    const galley = getShipClass("galley");
    expect(galley?.role).toBe("warship");
    expect(getShipSizeTier(galley!)).toBe("medium");
    expect(getHighestUnlockedShipClass(0, 0).id).toBe("sloop");
    expect(getHighestUnlockedShipClass(1000).id).toBe("steamship");
    for (const slots of [1, 30, 10_000]) {
      const [allocation] = getTransportAllocations([{ type: "sea", points: [] }] as never, slots, "horse");
      expect(allocation.transportId).not.toBe("galley");
    }
  });

  it("turns the state share of an antiquity fleet into galleys and leaves merchants sailing", () => {
    const plan = galleysForStateHulls(planStateFleet("earlyMedieval", "major_maritime", 5, 7));
    expect(plan.galley).toBe(plan.stateHulls);
    expect(plan.sloop + plan.caravel + plan.galleon + (plan.galley ?? 0)).toBe(plan.total);
    const hulls = splitHullsByOwner(plan);
    expect(hulls.filter(h => h.owner === "state").every(h => h.shipClassId === "galley")).toBe(true);
    expect(hulls.filter(h => h.owner === "market").some(h => h.shipClassId === "galley")).toBe(false);
  });
});
