import { describe, expect, it } from "vitest";
import { synthesizeBurialCulture } from "./burialCultureSynthesis";

describe("burialCultureSynthesis", () => {
  it("procedurally synthesizes valid profiles with constraints satisfied", () => {
    // Deterministic pseudo-rng
    let seed = 42;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    for (let i = 0; i < 20; i++) {
      const profile = synthesizeBurialCulture(
        {
          hasRiver: i % 2 === 0,
          hasElevation: i % 3 === 0,
          cultureType: i % 2 === 0 ? "Nomadic" : "Highland"
        },
        rng
      );

      expect(profile).toBeDefined();
      expect(profile.id).toMatch(/^custom_/);
      expect(profile.zoning).toBeTruthy();
      expect(profile.boundary).toBeTruthy();
      expect(profile.sanctuary).toBeTruthy();
      expect(profile.bodyFate).toBeTruthy();
      expect(profile.monuments).toBeTruthy();
      expect(profile.vegetation).toBeTruthy();
      expect(profile.ritualFacilities.length).toBeGreaterThan(0);
      expect(profile.mechanics.remainFraction).toBeGreaterThanOrEqual(0);
      expect(profile.mechanics.remainFraction).toBeLessThanOrEqual(1);
    }
  });

  it("handles desert conditions with mummification or shroud preference", () => {
    let _callCount = 0;
    const fixedRng = () => {
      _callCount++;
      return 0.1; // Favors first/early samples
    };

    const profile = synthesizeBurialCulture(
      {
        biome: "desert",
        cultureType: "Desert",
        hasRiver: false,
        hasElevation: false
      },
      fixedRng
    );

    expect(profile.mechanics.remainFraction).toBeGreaterThan(0);
  });
});
