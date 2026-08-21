import { describe, expect, it } from "vitest";
import {
  computeCoercionSuccessChance,
  computeColonizationSuccessChance,
  computeColonyGarrisonRequirement,
  computeColonyOutputFactor,
  computeRoundTripLossRisk
} from "./overseasVoyageRisk";

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

describe("overseas colony math", () => {
  it("rewards escorts during establishment, charges more for remote garrisons, and decays output after shortages", () => {
    expect(computeColonizationSuccessChance({ defenseScore: 50, escortCount: 2, relationScore: 0 })).toBeGreaterThan(
      computeColonizationSuccessChance({ defenseScore: 50, escortCount: 1, relationScore: 0 })
    );
    expect(computeColonyGarrisonRequirement({ defenseScore: 50, distanceBand: "remote" })).toBeGreaterThan(
      computeColonyGarrisonRequirement({ defenseScore: 50, distanceBand: "nearAbroad" })
    );
    expect(computeColonyOutputFactor(2)).toBeLessThan(1);
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
