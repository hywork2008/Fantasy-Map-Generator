import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createOpusVillageHouse,
  VILLAGE_HOUSE_KINDS,
  VILLAGE_HOUSE_PROFILES,
  villageHouseDefinition
} from "./opusVillageHouses";

describe("Opus village houses (roadside village plan §14.4)", () => {
  // CE fits a model to each house's footprint: it must stand on the ground and cover the footprint with no more
  // than its roof's overhang, in every region, size and quality.
  it("stands on the ground within its footprint and roof overhang, and stays single-storey", () => {
    for (const kind of VILLAGE_HOUSE_KINDS)
      for (const profile of VILLAGE_HOUSE_PROFILES)
        for (const quality of ["low", "high"] as const)
          for (const entrance of ["eave", "gable"] as const)
            for (const [length, width] of [
              [5, 3.5],
              [12, 5],
              [19, 6]
            ] as const) {
              const model = createOpusVillageHouse({ kind, profile, length, width, variant: 1, entrance }, quality),
                bounds = new THREE.Box3().setFromObject(model.group, true),
                size = bounds.getSize(new THREE.Vector3());
              expect(Math.abs(bounds.min.y)).toBeLessThan(1e-4);
              expect(size.x).toBeGreaterThanOrEqual(length);
              expect(size.x).toBeLessThanOrEqual(length + 0.8);
              expect(size.z).toBeGreaterThanOrEqual(width);
              expect(size.z).toBeLessThanOrEqual(width + 0.8);
              expect(Math.abs(bounds.min.x + bounds.max.x)).toBeLessThan(0.05);
              // Low walls under the roof: no upper floor (Hound Tor's walls stood about 2 m).
              expect(size.y).toBeLessThan(width * 1.4 + 3);
              model.dispose();
            }
  });

  it("shares one definition per spec and quality, so CE instances its houses", () => {
    const spec = { kind: "cottage", profile: "atlantic", length: 7, width: 4.25, variant: 0 } as const;
    expect(villageHouseDefinition(spec, "low")).toBe(villageHouseDefinition({ ...spec }, "low"));
    expect(villageHouseDefinition(spec, "low")).not.toBe(villageHouseDefinition(spec, "high"));
  });
});
