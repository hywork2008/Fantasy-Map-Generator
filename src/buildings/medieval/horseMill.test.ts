import { describe, expect, it } from "vitest";
import { placementFootprint } from "../placementModels";

describe("horse mill", () => {
  it("keeps Low's envelope at High, so a generated mill draws at the viewer's quality", () => {
    const low = placementFootprint("trade-workshop.dedicated-horse-mill", "low")!,
      high = placementFootprint("trade-workshop.dedicated-horse-mill", "high")!;
    // The City Editor draws a generated facility at High only where the two envelopes agree within 5 mm.
    expect(Math.abs(high.halfX - low.halfX)).toBeLessThan(0.005);
    expect(Math.abs(high.halfZ - low.halfZ)).toBeLessThan(0.005);
  });
});
