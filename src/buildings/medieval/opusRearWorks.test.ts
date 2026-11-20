import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { placementDefinition, placementFootprint } from "../placementModels";
import {
  createOpusRearWorks,
  OPUS_REAR_TRADES,
  OPUS_REAR_WORKS_PRESET_ENVELOPE,
  type OpusRearWorksSpec,
  opusRearWorksHeight,
  opusRearWorksModelId,
  opusRearWorksPreset
} from "./opusRearWorks";
import { createOpusWorkhome, opusShopHouseModelId, opusWorkhomeModel, opusWorkhomePreset } from "./opusWorkhome";
import { OPUS_WORKHOME_CULTURES } from "./opusWorkhomeProfiles";

const triangles = (model: CityStructureMeshes) => {
  let n = 0;
  model.group.traverse(o => {
    const g = (o as THREE.Mesh).geometry;
    if (g) n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return n;
};

function measure(spec: OpusRearWorksSpec, quality: "low" | "high") {
  const model = createOpusRearWorks(spec, quality);
  try {
    return { box: new THREE.Box3().setFromObject(model.group, true), triangles: triangles(model) };
  } finally {
    model.dispose();
  }
}

describe("Opus rear works (docs/plan/ce-town-trade-rear-works.md R1)", () => {
  it("keeps every trade, culture, plot width and depth inside its envelope and a small budget", () => {
    let worstLow = 0,
      worstHigh = 0;
    for (const trade of OPUS_REAR_TRADES)
      for (const culture of OPUS_WORKHOME_CULTURES)
        for (const widthMeters of [3, 5, 8])
          for (const depthMeters of [5, 7, 10])
            for (const mirror of [false, true]) {
              const spec = opusRearWorksPreset(trade, { culture, widthMeters, depthMeters, mirror }),
                low = measure(spec, "low"),
                high = measure(spec, "high");
              for (const { box } of [low, high]) {
                expect(box.min.x).toBeGreaterThanOrEqual(-widthMeters / 2 - 0.01);
                expect(box.max.x).toBeLessThanOrEqual(widthMeters / 2 + 0.01);
                expect(box.min.z).toBeGreaterThanOrEqual(-depthMeters / 2 - 0.01);
                expect(box.max.z).toBeLessThanOrEqual(depthMeters / 2 + 0.01);
                expect(box.min.y).toBeGreaterThan(-0.01);
              }
              expect(high.box.max.y).toBeCloseTo(low.box.max.y, 5);
              worstLow = Math.max(worstLow, low.triangles);
              worstHigh = Math.max(worstHigh, high.triangles);
            }
    // Less than the shop-house in front of it (Low 1,800, High 7,000; bv-workhome-facade-variation.md §7.1).
    expect(worstLow).toBeLessThanOrEqual(1500);
    expect(worstHigh).toBeLessThanOrEqual(5000);
  });

  it("is placeable in CE on its declared envelope, its height the same at both tiers", () => {
    for (const trade of OPUS_REAR_TRADES) {
      const id = opusRearWorksModelId(trade),
        footprint = placementFootprint(id, "low")!;
      expect(footprint.halfX * 2).toBeCloseTo(OPUS_REAR_WORKS_PRESET_ENVELOPE[0], 5);
      expect(footprint.halfZ * 2).toBeCloseTo(OPUS_REAR_WORKS_PRESET_ENVELOPE[1], 5);
      expect(placementDefinition(id, "high")?.variant).toContain("claude-opus-5.5");
    }
    const spec = opusRearWorksPreset("baking");
    expect(opusRearWorksHeight(spec)).toBeCloseTo(measure(spec, "high").box.max.y, 5);
  });

  it("gives each trade's shop-house in front its own wares", () => {
    const count = (role: string) => {
      const model = createOpusWorkhome(opusWorkhomePreset(role as never, "standard", { shop: "open" }), "low");
      try {
        return triangles(model);
      } finally {
        model.dispose();
      }
    };
    // A trade without wares draws the same open shop, empty.
    const empty = count("no-trade");
    for (const trade of OPUS_REAR_TRADES) {
      expect(opusWorkhomeModel(opusShopHouseModelId(trade))).toEqual({ role: trade, form: "standard" });
      expect(count(trade)).toBeGreaterThan(empty);
    }
  });
});
