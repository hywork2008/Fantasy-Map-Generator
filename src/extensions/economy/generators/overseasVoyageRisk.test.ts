import { describe, expect, it } from "vitest";
import { computeRoundTripLossRisk } from "./overseasVoyageRisk";

describe("overseas voyage escort risk", () => {
  it("reduces only piracy-related round-trip loss risk when escorts accompany the convoy", () => {
    const unescorted = computeRoundTripLossRisk({
      distanceBand: "remote",
      shipTier: 1,
      climateSteps: 3,
      escortRatio: 0
    });
    const escorted = computeRoundTripLossRisk({
      distanceBand: "remote",
      shipTier: 1,
      climateSteps: 3,
      escortRatio: 0.5
    });

    expect(escorted.shipwreckRisk).toBe(unescorted.shipwreckRisk);
    expect(escorted.piracyRisk).toBeLessThan(unescorted.piracyRisk);
    expect(escorted.roundTripLossRisk).toBeLessThan(unescorted.roundTripLossRisk);
  });
});
