import { describe, expect, it } from "vitest";
import {
  culturesSetUsesFrontierSettlement,
  getThreatSpawnProfile,
  HIGH_FANTASY_THREAT_PROFILE,
  resolveThreatCultureMode
} from "./threatProfiles";

describe("threatProfiles", () => {
  it("enables threats only for highFantasy and darkFantasy", () => {
    expect(resolveThreatCultureMode("highFantasy")).toBe("highFantasy");
    expect(resolveThreatCultureMode("darkFantasy")).toBe("darkFantasy");
    expect(resolveThreatCultureMode("world")).toBe("none");
    expect(getThreatSpawnProfile("european")).toBeNull();
  });

  it("highFantasy has no rarity 4–5 and includes r1–r2 with optional r3", () => {
    const p = HIGH_FANTASY_THREAT_PROFILE;
    const rarities = p.bands.map(b => b.rarity);
    expect(rarities).not.toContain(4);
    expect(rarities).not.toContain(5);
    expect(rarities).toContain(1);
    expect(rarities).toContain(2);
    expect(rarities).toContain(3);
    const r3 = p.bands.find(b => b.rarity === 3)!;
    expect(r3.max).toBeLessThanOrEqual(2);
    const r1 = p.bands.find(b => b.rarity === 1)!;
    const r2 = p.bands.find(b => b.rarity === 2)!;
    expect(r1.min).toBeGreaterThan(0);
    expect(r2.min).toBeGreaterThan(0);
  });

  it("fantasy culture sets use frontier settlement default", () => {
    expect(culturesSetUsesFrontierSettlement("highFantasy")).toBe(true);
    expect(culturesSetUsesFrontierSettlement("darkFantasy")).toBe(true);
    expect(culturesSetUsesFrontierSettlement("world")).toBe(false);
  });
});
