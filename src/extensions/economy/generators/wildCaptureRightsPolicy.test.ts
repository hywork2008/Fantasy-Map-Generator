import { describe, expect, it } from "vitest";
import { isWildCaptureAllowed, resolveWildCaptureRight } from "./wildCaptureRightsPolicy";

describe("resolveWildCaptureRight", () => {
  const forestKingdom = { stateId: 1, stateForm: "Monarchy", cultureType: "Generic", biomeTags: ["forest"] as const };

  it("reserves the forest of a monarchy in the forest-law era", () => {
    expect(resolveWildCaptureRight({ ...forestKingdom, historicalPeriod: "highMedieval" })).toBe("lordsForest");
    expect(isWildCaptureAllowed("lordsForest")).toBe(false);
  });

  it("leaves open land, foragers, open forms, unclaimed land and other eras free", () => {
    expect(resolveWildCaptureRight({ ...forestKingdom, biomeTags: ["grassland"] })).toBe("commonsCustom");
    expect(resolveWildCaptureRight({ ...forestKingdom, cultureType: "Nomadic" })).toBe("foragingCulture");
    expect(resolveWildCaptureRight({ ...forestKingdom, stateForm: "Republic" })).toBe("openForm");
    expect(resolveWildCaptureRight({ ...forestKingdom, stateId: 0 })).toBe("noState");
    expect(resolveWildCaptureRight({ ...forestKingdom, historicalPeriod: "classicalAntiquity" })).toBe(
      "outsideForestLawEra"
    );
  });
});
