import { describe, expect, it } from "vitest";
import { COASTAL_HABITAT_KEYS, NEARSHORE_HABITAT_KEYS } from "../types/coastalHabitat";
import {
  allowsFormalHarbor,
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

  it("blocks formal harbors on sandy beaches only", () => {
    expect(isSandyBeach(getCoastalHabitatCode("sandyBeach"))).toBe(true);
    expect(allowsFormalHarbor(getCoastalHabitatCode("sandyBeach"))).toBe(false);
    expect(allowsFormalHarbor(getCoastalHabitatCode("rockyIntertidal"))).toBe(true);
    expect(allowsFormalHarbor(getCoastalHabitatCode("none"))).toBe(true);
    expect(allowsFormalHarbor(undefined)).toBe(true);
  });
});
