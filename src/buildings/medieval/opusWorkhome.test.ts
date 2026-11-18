import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { adoptedVariant } from "../../city3d/adoption";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { models } from "./51-trade-workhomesModels";
import {
  createOpusWorkhome,
  OPUS_WORKHOME_CULTURES,
  type OpusWorkhomeSpec,
  opusWorkhomeLayout,
  opusWorkhomePreset,
  opusWorkhomeSpecKey,
  opusWorkhomeStoreys
} from "./opusWorkhome";
import { WORKHOME_TRADES } from "./workhomeTradeProfiles";

const triangles = (model: CityStructureMeshes) => {
  let n = 0;
  model.group.traverse(o => {
    const g = (o as THREE.Mesh).geometry;
    if (g) n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return n;
};

function measure(spec: OpusWorkhomeSpec, quality: "low" | "high") {
  const model = createOpusWorkhome(spec, quality);
  try {
    return { box: new THREE.Box3().setFromObject(model.group, true), triangles: triangles(model) };
  } finally {
    model.dispose();
  }
}

const WIDTHS = [3, 4.5, 6.44, 7.7];

describe("Opus shop-house workhome (docs/plan/bv-workhome-facade-variation.md W1, W2)", () => {
  it("keeps every culture, frontage and storey count inside its plot envelope and its triangle budget", () => {
    let worstLow = 0,
      worstHigh = 0;
    for (const culture of OPUS_WORKHOME_CULTURES)
      for (const widthMeters of WIDTHS)
        for (const storeys of [2, 3] as const) {
          const spec = opusWorkhomePreset("tailoring", "standard", {
            culture,
            widthMeters,
            storeys,
            fronts: 2,
            entranceFace: "gable"
          });
          const low = measure(spec, "low"),
            high = measure(spec, "high");
          for (const { box } of [low, high]) {
            expect(box.min.x).toBeGreaterThanOrEqual(-widthMeters / 2 - 0.01);
            expect(box.max.x).toBeLessThanOrEqual(widthMeters / 2 + 0.01);
            expect(box.min.z).toBeGreaterThanOrEqual(-spec.depthMeters / 2 - 0.01);
            expect(box.max.z).toBeLessThanOrEqual(spec.depthMeters / 2 + 0.01);
            expect(box.min.y).toBeGreaterThan(-0.01);
            // The plot is used to within a hand's breadth of its edges.
            expect(box.max.x - box.min.x).toBeGreaterThan(widthMeters - 0.2);
          }
          worstLow = Math.max(worstLow, low.triangles);
          worstHigh = Math.max(worstHigh, high.triangles);
        }
    // Plan §7.1: about 1.5 times a regional craft house at Low; the Codex workhome took 4,428–6,444.
    expect(worstLow).toBeLessThanOrEqual(1800);
    expect(worstHigh).toBeLessThanOrEqual(7000);
  });

  it("keeps every trade's open shop and its goods inside the budget, and builds no shop room behind shutters", () => {
    for (const { id: role } of WORKHOME_TRADES)
      for (const culture of ["atlantic", "mediterranean"] as const) {
        const open = opusWorkhomePreset(role, "standard", { culture, widthMeters: 7.7, fronts: 2, storeys: 3 }),
          low = measure(open, "low"),
          high = measure(open, "high"),
          closed = measure({ ...open, shop: "closed" }, "low");
        expect(low.triangles).toBeLessThanOrEqual(1800);
        expect(high.triangles).toBeLessThanOrEqual(7000);
        // The shop room and its wares are what opening the shutters adds.
        expect(low.triangles - closed.triangles).toBeGreaterThan(100);
        for (const { box } of [low, high]) expect(box.max.z).toBeLessThanOrEqual(open.depthMeters / 2 + 0.01);
      }
  });

  it("raises a third storey only from the late Middle Ages and on frontages of 5 m or more", () => {
    expect(opusWorkhomeStoreys("highMedieval", 7, 0)).toBe(2);
    expect(opusWorkhomeStoreys("lateMedieval", 4.9, 0)).toBe(2);
    expect(opusWorkhomeStoreys("lateMedieval", 5, 0)).toBe(3);
    expect(opusWorkhomeStoreys("ageOfExploration", 6, 0.9)).toBe(2);
    // A narrow plot never takes three storeys, whatever the spec asks.
    expect(
      opusWorkhomeLayout(opusWorkhomePreset("tailoring", "standard", { widthMeters: 4, storeys: 3 })).spec.storeys
    ).toBe(2);
  });

  it("lays a door and its shop windows on the street front apart, from 3 m plots to double fronts", () => {
    for (const culture of OPUS_WORKHOME_CULTURES)
      for (const widthMeters of [3, 3.6, 4.5, 6, 7.7])
        for (const fronts of [1, 2] as const)
          for (const mirror of [false, true]) {
            const l = opusWorkhomeLayout(
              opusWorkhomePreset("shoemaking", "standard", { culture, widthMeters, fronts, mirror })
            );
            const openings = [l.door, ...l.shops].sort((p, q) => p.a - q.a);
            expect(l.shops.length).toBe(widthMeters >= 6 ? fronts : 1);
            for (const o of openings) {
              expect(o.b - o.a).toBeGreaterThanOrEqual(0.9 - 1e-9);
              expect(o.a).toBeGreaterThanOrEqual(l.x0 + 0.2);
              expect(o.b).toBeLessThanOrEqual(l.x1 - 0.2);
            }
            for (let i = 1; i < openings.length; i++)
              expect(openings[i].a - openings[i - 1].b).toBeGreaterThanOrEqual(0.2 - 1e-9);
            // The entrance is the door, on the ground-storey front.
            expect(l.entrance.position[0]).toBeCloseTo((l.door.a + l.door.b) / 2, 2);
            expect(l.entrance.position[2]).toBeCloseTo(l.z1, 2);
            if (fronts === 1) expect(mirror ? l.door.b > l.shops[0].b : l.door.a < l.shops[0].a).toBe(true);
          }
  });

  it("shares a model only between equal specs on their grids, and lets the culture fix its street face", () => {
    const a = opusWorkhomePreset("joinery", "wide", { widthMeters: 4.504 }),
      b = opusWorkhomePreset("joinery", "wide", { widthMeters: 4.5 });
    expect(opusWorkhomeSpecKey(a)).toBe(opusWorkhomeSpecKey(b));
    expect(opusWorkhomeSpecKey(a)).not.toBe(opusWorkhomeSpecKey({ ...b, shop: "closed" }));
    expect(opusWorkhomeLayout({ ...b, culture: "northern-urban", entranceFace: "eave" }).ridge).toBe("z");
    expect(opusWorkhomeLayout({ ...b, culture: "mediterranean", entranceFace: "gable" }).ridge).toBe("x");
    // A narrow plot cannot take a double front.
    expect(opusWorkhomeLayout({ ...b, fronts: 2 }).shops).toHaveLength(1);
  });

  it("registers Low and High Opus variants on every trade workhome, previewed in MV while CE keeps Codex", () => {
    expect(models).toHaveLength(13);
    for (const model of models) {
      const opus = model.variants!.filter(v => v.author === "Claude Opus 5.5");
      expect(opus.map(v => v.level).sort()).toEqual(["high", "low"]);
      for (const v of opus) expect(model.presentation!.applies(v.id)).toBe(true);
      expect(model.presentation!.applies(model.variants![0].id)).toBe(false);
      for (const level of ["low", "high"])
        expect(adoptedVariant(model.variants![0].family, level).author).toBe("Codex GPT-6.1 Sol");
      expect(model.parts!(opus[0].id)).toEqual([]);
    }
  });
});
