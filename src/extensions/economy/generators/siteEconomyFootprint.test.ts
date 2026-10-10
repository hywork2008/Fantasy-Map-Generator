import { describe, expect, it } from "vitest";
import { storageFormOf, storageYardsFromStock } from "./siteEconomyFootprint";

describe("storage yards", () => {
  it("prices livestock by the animal and keeps timber out of the fuel stack", () => {
    expect(storageFormOf({ name: "Grain", units: 1, tags: ["stapleFood"], unit: "wain" })).toBeNull();
    const yards = storageYardsFromStock({
      urbanAreaM2: 100_000,
      marketCenter: false,
      lines: [
        { name: "Cattle", units: 10, tags: ["liveAnimal"], unit: "head" },
        { name: "Sheep", units: 10, tags: ["liveAnimal"], unit: "head" },
        { name: "Chicken", units: 10, tags: ["liveAnimal"], unit: "head" },
        { name: "Wood", units: 2, tags: ["construction", "fuel"], unit: "pile" },
        { name: "Charcoal", units: 4, tags: ["fuel"], unit: "sack" },
        { name: "Oil", units: 10, tags: ["fuel"], unit: "barrel", handlingClass: "barreled" },
        { name: "Salt", units: 5, tags: ["mineral"], unit: "bag" },
        { name: "Grain", units: 9000, tags: ["stapleFood"], unit: "wain" }
      ]
    });
    expect(yards).toEqual([
      {
        form: "livestockPen",
        areaM2: 58,
        mainGoods: ["Cattle", "Sheep", "Chicken"],
        inflowAzimuthDeg: null,
        waterborne: false
      },
      { form: "timberYard", areaM2: 12, mainGoods: ["Wood"], inflowAzimuthDeg: null, waterborne: false },
      { form: "fuelStack", areaM2: 8, mainGoods: ["Charcoal"], inflowAzimuthDeg: null, waterborne: false },
      { form: "cellar", areaM2: 2, mainGoods: ["Oil"], inflowAzimuthDeg: null, waterborne: false },
      { form: "warehouse", areaM2: 4, mainGoods: ["Salt"], inflowAzimuthDeg: null, waterborne: false }
    ]);
  });

  it("shrinks a market center's yards to a quarter of the town and keeps their mix", () => {
    const yards = storageYardsFromStock({
      urbanAreaM2: 1000,
      marketCenter: true,
      lines: [
        { name: "Maize", units: 1000, tags: ["stapleCrop"], unit: "wain" },
        { name: "Wood", units: 100, tags: ["construction"], unit: "pile" }
      ],
      partners: [{ mainGoods: ["Wood"], annualSlots: 20, mode: "river", azimuthDeg: 90 }]
    });
    // 1200 + 600 = 1800, cap 250, scale 250/1800.
    expect(yards).toEqual([
      { form: "timberYard", areaM2: 83, mainGoods: ["Wood"], inflowAzimuthDeg: 90, waterborne: true },
      { form: "granary", areaM2: 167, mainGoods: ["Maize"], inflowAzimuthDeg: null, waterborne: false }
    ]);
  });

  it("leaves a quiet capital under the town cap", () => {
    const yards = storageYardsFromStock({
      urbanAreaM2: 315_696,
      marketCenter: false,
      lines: [
        { name: "Rice", units: 264, tags: ["stapleCrop"], unit: "wain" },
        { name: "Pig", units: 8, tags: ["liveAnimal"], unit: "head" }
      ]
    });
    expect(yards.map(yard => [yard.form, yard.areaM2])).toEqual([
      ["livestockPen", 12],
      ["granary", 317]
    ]);
    const share = yards.reduce((sum, yard) => sum + yard.areaM2, 0) / 315_696;
    expect(share).toBeLessThan(0.15);
  });
});
