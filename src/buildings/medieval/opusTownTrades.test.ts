import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { adoptedVariant } from "../../city3d/adoption";
import { createOpusButchery } from "./opusButchery";
import { createOpusTownTrade } from "./opusTownTrades";
import { OPUS_BUTCHERY, OPUS_TOWN_TRADES, type OpusTownTrade } from "./opusTradeProfiles";

const cases = [
  { id: "dedicated-butchery", profile: OPUS_BUTCHERY, create: createOpusButchery },
  ...(Object.keys(OPUS_TOWN_TRADES) as OpusTownTrade[]).map(trade => ({
    id: `dedicated-${trade}`,
    profile: OPUS_TOWN_TRADES[trade],
    create: (quality: "low" | "high") => createOpusTownTrade(trade, quality)
  }))
];

function triangles(model: ReturnType<typeof createOpusButchery>) {
  return model.pickables.reduce((sum, mesh) => {
    const g = mesh.geometry;
    return sum + (g.index ? g.index.count : g.getAttribute("position").count) / 3;
  }, 0);
}

describe.each(cases)("Opus $id", ({ id, profile, create }) => {
  it("fills exactly its CE plot in both tiers, with every part inside it and the entrance on the street edge", () => {
    const counts: number[] = [];
    for (const quality of ["low", "high"] as const) {
      const model = create(quality);
      const bounds = new THREE.Box3().setFromObject(model.group, true);
      expect(bounds.min.y).toBeCloseTo(0, 4);
      expect(bounds.min.x).toBeCloseTo(-profile.width / 2, 4);
      expect(bounds.max.x).toBeCloseTo(profile.width / 2, 4);
      expect(bounds.min.z).toBeCloseTo(-profile.depth / 2, 4);
      expect(bounds.max.z).toBeCloseTo(profile.depth / 2, 4);
      expect(bounds.max.y).toBeLessThanOrEqual(profile.height);
      for (const mesh of model.pickables)
        expect(Array.from(mesh.geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
      counts.push(triangles(model));
      model.dispose();
    }
    // Low is the CE distance tier: same envelope, a fraction of the High geometry.
    expect(counts[0]).toBeLessThan(4000);
    expect(counts[0] * 2.5).toBeLessThan(counts[1]);
    const [x, , z] = profile.entrance.position;
    expect(z).toBe(profile.depth / 2);
    expect(Math.abs(x) + profile.entrance.clearWidth / 2).toBeLessThanOrEqual(profile.width / 2);
  });

  it("is the variant CE adopts at both tiers", () => {
    for (const level of ["low", "high"])
      expect(adoptedVariant(`medieval.trade-workshop.${id}`, level).author).toBe("Claude Opus 5.5");
  });
});
