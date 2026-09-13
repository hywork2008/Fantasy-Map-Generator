import { describe, expect, it } from "vitest";
import { DEFAULT_FUNERAL_RITE, FUNERAL_RITES } from "../data/funeralRites";
import { defaultFuneralRiteForType, getCultureFuneralRite, rollCultureFuneralRite } from "./cultureFuneralRite";

describe("cultureFuneralRite", () => {
  it("samples a valid rite for every culture type", () => {
    const types = [
      "Generic",
      "Highland",
      "Nomadic",
      "Desert",
      "Naval",
      "River",
      "Lake",
      "Hunting",
      "Marsh",
      "Industrial",
      "Colonial"
    ] as const;
    for (const type of types) {
      const rite = rollCultureFuneralRite(type, () => 0.5);
      expect(FUNERAL_RITES).toContain(rite);
    }
  });

  it("is deterministic for a fixed rng stream", () => {
    let i = 0;
    const rng = () => {
      i += 1;
      return (i % 10) / 10;
    };
    const first = rollCultureFuneralRite("Highland", rng, "human");
    i = 0;
    const second = rollCultureFuneralRite("Highland", rng, "human");
    expect(first).toBe(second);
  });

  it("returns undefined for Wildlands and stored rites otherwise", () => {
    expect(getCultureFuneralRite({ i: 0, type: "Generic" })).toBeUndefined();
    expect(getCultureFuneralRite({ i: 1, type: "Naval", funeralRite: "waterBurial" })).toBe("waterBurial");
    expect(getCultureFuneralRite({ i: 2, type: "Industrial" })).toBe(defaultFuneralRiteForType("Industrial"));
  });

  it("uses inhumation as the Generic modal fallback", () => {
    expect(defaultFuneralRiteForType("Generic")).toBe(DEFAULT_FUNERAL_RITE);
    expect(defaultFuneralRiteForType("Industrial")).toBe("cremation");
    expect(defaultFuneralRiteForType("Desert")).toBe("mummification");
    expect(defaultFuneralRiteForType("Highland")).toBe("skyBurial");
  });
});
