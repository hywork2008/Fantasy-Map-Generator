import { describe, expect, it } from "vitest";
import { gateAimBearing } from "./storageYardPlacement";

describe("storage yard gates", () => {
  const gates = [
    { bearing: 10, along: 4 },
    { bearing: 100, along: 40 },
    { bearing: 200, along: 12 }
  ];

  it("sends land timber to the gate nearest the forest", () => {
    expect(gateAimBearing("timberYard", false, 90, 200, gates)).toEqual({ bearing: 100, pinned: true });
  });

  it("keeps a waterborne stone yard on the trade bearing", () => {
    expect(gateAimBearing("stoneYard", true, 90, 200, gates)).toEqual({ bearing: 200, pinned: false });
  });

  it("puts the livestock market at the downstream gate", () => {
    expect(gateAimBearing("livestockPen", false, null, 10, gates)).toEqual({ bearing: 100, pinned: true });
  });

  it("keeps a quiet livestock market on the trade bearing when no river reaches a gate", () => {
    expect(
      gateAimBearing(
        "livestockPen",
        false,
        null,
        10,
        gates.map(gate => ({ ...gate, along: 0 }))
      )
    ).toEqual({ bearing: 10, pinned: false });
  });
});
