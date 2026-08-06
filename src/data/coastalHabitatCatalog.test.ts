import { describe, expect, it } from "vitest";
import { COASTAL_HABITAT_KEYS, NEARSHORE_HABITAT_KEYS } from "../types/coastalHabitat";
import {
  getCoastalHabitatCode,
  getCoastalHabitatKey,
  getNearshoreHabitatCode,
  isSandyBeach
} from "./coastalHabitatCatalog";

describe("coastalHabitatCatalog", () => {
  it("maps keys to stable codes", () => {
    expect(getCoastalHabitatCode("none")).toBe(0);
    expect(getCoastalHabitatCode("sandyBeach")).toBe(1);
    expect(getCoastalHabitatKey(1)).toBe("sandyBeach");
    expect(getNearshoreHabitatCode("coralReef")).toBe(2);
    expect(COASTAL_HABITAT_KEYS).toHaveLength(5);
    expect(NEARSHORE_HABITAT_KEYS).toHaveLength(4);
  });

  it("identifies sandy beach substrate", () => {
    expect(isSandyBeach(getCoastalHabitatCode("sandyBeach"))).toBe(true);
    expect(isSandyBeach(getCoastalHabitatCode("rockyIntertidal"))).toBe(false);
  });

  // Formal-harbor suitability by substrate (previously `allowsFormalHarbor()`, a hard
  // sandyBeach-only gate) now lives in `evaluateHarborCoastalHabitat()`
  // (src/generators/harborSiteConditions.ts) as a graded capacity factor — see its tests there.
});
