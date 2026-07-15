import { describe, expect, it } from "vitest";
import {
  getAnnualShipbuildingMaterialDemand,
  getHighestUnlockedShipClass,
  getMaterialsForWork,
  getShipClass,
  SHIP_CLASSES
} from "./shipClasses";

describe("shipClasses", () => {
  it("unlocks sloop by default (0 tech points)", () => {
    expect(getHighestUnlockedShipClass(0).id).toBe("sloop");
  });

  it("stays on the current tier just below the next threshold", () => {
    expect(getHighestUnlockedShipClass(49).id).toBe("sloop");
  });

  it("unlocks caravel exactly at its tech threshold", () => {
    expect(getHighestUnlockedShipClass(50).id).toBe("caravel");
  });

  it("unlocks galleon once tech points clear the threshold", () => {
    expect(getHighestUnlockedShipClass(150).id).toBe("galleon");
  });

  it("never exceeds the highest defined tier", () => {
    expect(getHighestUnlockedShipClass(1_000_000).id).toBe(SHIP_CLASSES[SHIP_CLASSES.length - 1].id);
  });

  it("getShipClass returns undefined for an unknown id", () => {
    expect(getShipClass("dreadnought")).toBeUndefined();
  });

  it("uses the Economy Ships recipe for a full Sloop", () => {
    expect(getMaterialsForWork(SHIP_CLASSES[0], 10)).toEqual({ Wood: 2, Sails: 2, Ropes: 2, Tar: 1 });
  });

  it("scales material requirements by construction work", () => {
    expect(getMaterialsForWork(SHIP_CLASSES[1], 25)).toEqual({ Wood: 5, Sails: 5, Ropes: 5, Tar: 2.5 });
    expect(getMaterialsForWork(SHIP_CLASSES[2], 60)).toEqual({ Wood: 12, Sails: 12, Ropes: 12, Tar: 6 });
  });

  it("does not request negative work", () => {
    expect(getMaterialsForWork(SHIP_CLASSES[0], -5)).toEqual({ Wood: 0, Sails: 0, Ropes: 0, Tar: 0 });
  });

  it("derives one shipyard's annual material forecast from its build rate", () => {
    expect(getAnnualShipbuildingMaterialDemand(SHIP_CLASSES[0])).toEqual({
      Wood: 0.4,
      Sails: 0.4,
      Ropes: 0.4,
      Tar: 0.2
    });
  });
});
