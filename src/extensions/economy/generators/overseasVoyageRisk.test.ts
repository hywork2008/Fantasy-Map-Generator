import { describe, expect, it } from "vitest";
import { computeCoercionSuccessChance, computeRoundTripLossRisk } from "./overseasVoyageRisk";

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

describe("overseas coercion risk", () => {
  it("makes tribute safer than a raid against the same Realm and rewards additional escorts", () => {
    const shared = { powerTier: "comparable" as const, defenseScore: 80, escortCount: 1, relationScore: 0 };
    expect(computeCoercionSuccessChance({ ...shared, purpose: "tribute" })).toBeGreaterThan(
      computeCoercionSuccessChance({ ...shared, purpose: "raid" })
    );
    expect(computeCoercionSuccessChance({ ...shared, purpose: "tribute", escortCount: 2 })).toBeGreaterThan(
      computeCoercionSuccessChance({ ...shared, purpose: "tribute" })
    );
  });
});
