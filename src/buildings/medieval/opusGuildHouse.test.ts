import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { placementDefinition, placementFootprint } from "../placementModels";
import { ENCLOSED_GUILD_TRADES } from "./enclosedGuildTrades";
import {
  createOpusGuildHouse,
  OPUS_GUILD_HOUSE_PRESET_ENVELOPE,
  type OpusGuildHouseSpec,
  opusGuildHouseHeight,
  opusGuildHouseLayout,
  opusGuildHouseModelId,
  opusGuildHousePreset
} from "./opusGuildHouse";
import { OPUS_WORKHOME_CULTURES } from "./opusWorkhomeProfiles";

const triangles = (model: CityStructureMeshes) => {
  let n = 0;
  model.group.traverse(o => {
    const g = (o as THREE.Mesh).geometry;
    if (g) n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return n;
};

function measure(spec: OpusGuildHouseSpec, quality: "low" | "high") {
  const model = createOpusGuildHouse(spec, quality);
  try {
    return { box: new THREE.Box3().setFromObject(model.group, true), triangles: triangles(model) };
  } finally {
    model.dispose();
  }
}

describe("Opus guild house (docs/plan/bv-workhome-facade-variation.md §6.1 W5b)", () => {
  it("keeps every culture, frontage and storey count inside its plot envelope and a town house's budget", () => {
    let worstLow = 0,
      worstHigh = 0;
    for (const culture of OPUS_WORKHOME_CULTURES)
      for (const widthMeters of [6, 8, 10])
        for (const storeys of [2, 3] as const)
          for (const entranceFace of ["gable", "eave"] as const) {
            const spec = opusGuildHousePreset("metallurgy", { culture, widthMeters, storeys, entranceFace }),
              low = measure(spec, "low"),
              high = measure(spec, "high");
            for (const { box } of [low, high]) {
              expect(box.min.x).toBeGreaterThanOrEqual(-widthMeters / 2 - 0.01);
              expect(box.max.x).toBeLessThanOrEqual(widthMeters / 2 + 0.01);
              expect(box.min.z).toBeGreaterThanOrEqual(-spec.depthMeters / 2 - 0.01);
              expect(box.max.z).toBeLessThanOrEqual(spec.depthMeters / 2 + 0.01);
              expect(box.min.y).toBeGreaterThan(-0.01);
              expect(box.max.x - box.min.x).toBeGreaterThan(widthMeters - 0.2);
            }
            expect(high.box.max.y).toBeCloseTo(low.box.max.y, 5);
            worstLow = Math.max(worstLow, low.triangles);
            worstHigh = Math.max(worstHigh, high.triangles);
          }
    // The shop-house's budget (plan §7.1); the enclosed hall it replaces in the row is a detached 12.8 x 9 m hall.
    expect(worstLow).toBeLessThanOrEqual(1800);
    expect(worstHigh).toBeLessThanOrEqual(7000);
  });

  it("lays the portal, the barred windows and the Stube's row of windows clear of each other and the corners", () => {
    for (const culture of OPUS_WORKHOME_CULTURES)
      for (const widthMeters of [6, 10])
        for (const mirror of [false, true]) {
          const l = opusGuildHouseLayout(opusGuildHousePreset("textiles", { culture, widthMeters, mirror }));
          expect(l.door.a).toBeGreaterThanOrEqual(l.x0 + 0.2);
          expect(l.door.b).toBeLessThanOrEqual(l.x1 - 0.2);
          for (const u of l.groundWindows) expect(u + 0.35 <= l.door.a - 0.2 || u - 0.35 >= l.door.b + 0.2).toBe(true);
          expect(l.stubeWindows.length).toBeGreaterThanOrEqual(5);
          expect(Math.min(...l.stubeWindows) - 0.31).toBeGreaterThan(l.x0 + 0.2);
          expect(Math.max(...l.stubeWindows) + 0.31).toBeLessThan(l.x1 - 0.2);
          expect(l.entrance.position[0]).toBeCloseTo((l.door.a + l.door.b) / 2, 2);
        }
  });

  it("is placeable in CE for every guild on its declared envelope, its height the same at both tiers", () => {
    for (const { id: role } of ENCLOSED_GUILD_TRADES) {
      const id = opusGuildHouseModelId(role),
        footprint = placementFootprint(id, "low")!;
      expect(footprint.halfX * 2).toBeCloseTo(OPUS_GUILD_HOUSE_PRESET_ENVELOPE[0], 5);
      expect(footprint.halfZ * 2).toBeCloseTo(OPUS_GUILD_HOUSE_PRESET_ENVELOPE[1], 5);
      expect(placementDefinition(id, "high")?.variant).toContain("claude-opus-5.5");
    }
    const spec = opusGuildHousePreset("baking");
    expect(opusGuildHouseHeight(spec)).toBeCloseTo(measure(spec, "high").box.max.y, 5);
  });
});
