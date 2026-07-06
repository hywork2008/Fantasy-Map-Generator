import { describe, expect, it } from "vitest";
import { getHighestUnlockedShipClass, getShipClass, SHIP_CLASSES } from "./shipClasses";

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

  it("unlocks galleon once tech points clear its threshold", () => {
    expect(getHighestUnlockedShipClass(150).id).toBe("galleon");
  });

  it("never exceeds the highest defined tier", () => {
    expect(getHighestUnlockedShipClass(1_000_000).id).toBe(SHIP_CLASSES[SHIP_CLASSES.length - 1].id);
  });

  it("getShipClass returns undefined for an unknown id", () => {
    expect(getShipClass("dreadnought")).toBeUndefined();
  });
});
