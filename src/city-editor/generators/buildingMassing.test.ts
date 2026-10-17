import { describe, expect, it } from "vitest";
import type { CityDocument } from "../types/document";
import type { BuildingLot } from "./buildingLots.types";
import { assignBuildingMassing } from "./buildingMassing";
import { residentialCapacity } from "./residentialCapacity";

function document(partial: Partial<CityDocument> = {}): CityDocument {
  return {
    historicalPeriod: "highMedieval",
    generationSeed: "massing-seed",
    mesh: { faces: {} },
    ...partial
  } as CityDocument;
}

const house: BuildingLot = {
  faceId: "f",
  id: "house",
  polygon: [
    [0, 0],
    [8, 0],
    [8, 18],
    [0, 18]
  ],
  landmark: false,
  role: "main",
  uses: ["residential"],
  storeys: 2,
  residentialFloorShare: 0.85
};

describe("assignBuildingMassing", () => {
  it("keeps residential storeys and does not change dwelling capacity", () => {
    const before = residentialCapacity(house);
    const [lot] = assignBuildingMassing(document(), [house]);
    expect(lot.storeys).toBe(2);
    expect(lot.massing?.storeys).toBe(2);
    expect(lot.massing?.floors.map(floor => floor.use)).toEqual(["residential", "residential"]);
    expect(lot.residentialFloorShare).toBe(0.85);
    expect(residentialCapacity(lot)).toBe(before);
    expect(lot.massing?.wall).toBe("timber-frame");
    expect(lot.massing?.roof.material).toBe("thatch");
    expect(lot.massing?.roof.form).toBe("gable");
    expect(lot.massing?.jettyMeters).toBe(0.4);
  });

  it("puts a shop on the ground floor and housing above without rewriting the share", () => {
    const shop: BuildingLot = {
      ...house,
      id: "shop",
      uses: ["residential", "retail"],
      storeys: 2,
      residentialFloorShare: 0.55
    };
    const [lot] = assignBuildingMassing(document(), [shop]);
    expect(lot.massing?.floors.map(floor => floor.use)).toEqual(["retail", "residential"]);
    expect(lot.residentialFloorShare).toBe(0.55);
    expect(residentialCapacity(lot)).toBe(residentialCapacity(shop));
  });

  it("builds a classical insula as a shop under rented floors and caps the eaves at 21 m", () => {
    const insula: BuildingLot = {
      ...house,
      id: "insula",
      uses: ["residential", "retail"],
      storeys: 8,
      residentialFloorShare: 0.85,
      archetype: "shop-house"
    };
    const [lot] = assignBuildingMassing(document({ historicalPeriod: "classicalAntiquity" }), [insula]);
    expect(lot.massing?.floors[0].use).toBe("retail");
    expect(lot.massing?.floors.slice(1).every(floor => floor.use === "residential")).toBe(true);
    expect(lot.massing?.eaveHeightMeters).toBeLessThanOrEqual(21);
    expect(lot.massing?.wall).toBe("stone");
    expect(lot.massing?.roof.form).toBe("flat");
    expect(lot.massing?.jettyMeters).toBe(0);
  });

  it("gives an unstored warehouse three storage floors and leaves houses at the capacity fallback", () => {
    const warehouse: BuildingLot = {
      ...house,
      id: "wh",
      storeys: undefined,
      uses: ["storage"],
      role: "store",
      archetype: "warehouse-compound"
    };
    const unsetHouse: BuildingLot = { ...house, id: "unset", storeys: undefined };
    const [stored, residential] = assignBuildingMassing(document(), [warehouse, unsetHouse]);
    expect(stored.storeys).toBe(3);
    expect(stored.massing?.floors.every(floor => floor.use === "storage")).toBe(true);
    expect(residential.storeys).toBeUndefined();
    expect(residential.massing?.storeys).toBe(1);
    expect(residentialCapacity(residential)).toBe(residentialCapacity(unsetHouse));
  });

  it("chooses mudbrick, plaster and slate from biome, faith and period", () => {
    const [desert] = assignBuildingMassing(document({ biome: { id: 1, name: "Hot desert", tags: ["arid"] } }), [house]);
    expect(desert.massing?.wall).toBe("mudbrick");
    expect(desert.massing?.roof.material).toBe("turf");
    expect(desert.massing?.roof.form).toBe("flat");
    const [medina] = assignBuildingMassing(
      document({
        historicalPeriod: "lateMedieval",
        civilization: { faith: "sunni", fortification: "islamic" }
      } as Partial<CityDocument>),
      [{ ...house, archetype: "small-house" }]
    );
    expect(medina.massing?.wall).toBe("plaster");
    expect(medina.massing?.roof.material).toBe("tile");
    const rich: BuildingLot = { ...house, archetype: "patrician-house" };
    const [slate] = assignBuildingMassing(document({ historicalPeriod: "lateMedieval" }), [rich]);
    expect(slate.massing?.wall).toBe("stone");
    expect(slate.massing?.roof.material).toBe("slate");
    expect(slate.massing?.jettyMeters).toBe(0);
  });

  it("repeats the same tint for the same seed and lot id", () => {
    const first = assignBuildingMassing(document(), [house, { ...house, id: "other" }]);
    const second = assignBuildingMassing(document(), [house, { ...house, id: "other" }]);
    expect(first[0].massing).toEqual(second[0].massing);
    expect(first[0].massing?.tint).not.toBe(first[1].massing?.tint);
  });

  it("skips landmarks", () => {
    const landmark: BuildingLot = { ...house, landmark: true };
    const [lot] = assignBuildingMassing(document(), [landmark]);
    expect(lot).toBe(landmark);
    expect(lot.massing).toBeUndefined();
  });
});
