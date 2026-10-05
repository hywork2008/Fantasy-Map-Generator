import { describe, expect, it } from "vitest";
import { planRiverCrossing, RIVER_CARGO_VESSEL, SEA_SAILING_VESSEL } from "./riverCrossing";

describe("river crossing feasibility", () => {
  it("uses a fixed bridge when the vessel clears it", () => {
    expect(
      planRiverCrossing({ widthMeters: 97, depthMeters: 3, period: "ageOfExploration", vessel: RIVER_CARGO_VESSEL })
        .kind
    ).toBe("fixedBridge");
  });
  it("uses a movable navigation span only when the era can build that opening", () => {
    const input = { widthMeters: 100, depthMeters: 5, vessel: SEA_SAILING_VESSEL };
    expect(planRiverCrossing({ ...input, period: "ageOfExploration" }).kind).toBe("movableBridge");
    expect(planRiverCrossing({ ...input, period: "earlyMedieval" }).kind).toBe("ferry");
  });
  it("does not require movement for a high modern bridge", () => {
    expect(
      planRiverCrossing({
        widthMeters: 100,
        depthMeters: 5,
        period: "industrialChemistryEra",
        vessel: SEA_SAILING_VESSEL
      }).kind
    ).toBe("fixedBridge");
  });
  it("cannot build multi-span foundations in water beyond its technology", () => {
    expect(
      planRiverCrossing({ widthMeters: 100, depthMeters: 20, period: "ageOfExploration", vessel: RIVER_CARGO_VESSEL })
    ).toMatchObject({ kind: "ferry", reason: "deepFoundations" });
  });
  it("uses a ferry for a 7km river rather than inventing an island", () => {
    expect(
      planRiverCrossing({ widthMeters: 7000, depthMeters: 10, period: "ageOfExploration", vessel: RIVER_CARGO_VESSEL })
    ).toMatchObject({ kind: "ferry", reason: "tooWide" });
  });
  it("does not assume unsurveyed navigable foundations can support a long bridge", () => {
    expect(planRiverCrossing({ widthMeters: 100, period: "earlyMedieval", vessel: RIVER_CARGO_VESSEL })).toMatchObject({
      kind: "ferry",
      reason: "unknownDepth"
    });
  });
  it("honors explicit local technology and total length independently", () => {
    expect(
      planRiverCrossing({
        widthMeters: 100,
        depthMeters: 5,
        period: "earlyMedieval",
        vessel: SEA_SAILING_VESSEL,
        technology: { maxPierDepthMeters: 8, movableOpeningMeters: 15 }
      }).kind
    ).toBe("movableBridge");
    expect(
      planRiverCrossing({
        widthMeters: 100,
        depthMeters: 5,
        period: "steamEra",
        transport: { maxBridgeCrossingMeters: 50 }
      }).kind
    ).toBe("ferry");
  });
});
