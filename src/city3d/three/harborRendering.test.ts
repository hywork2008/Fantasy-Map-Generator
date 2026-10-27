import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { bounds } from "../../city-editor/generators/parcelGeometry";
import { createBvPrototypeCache } from "./bvInstances";
import { createTownCranes, createTownHarborBarrels } from "./craneMeshes";
import { clipWaterChunk } from "./terrainFieldMesh";

describe("harbor 3D rendering", () => {
  it("cuts water out of a terrain triangle while retaining interpolated height", () => {
    const chunk = {
      positions: Float32Array.from([0, 0, 0, 10, 10, 0, 0, 0, -10]),
      colors: Float32Array.from([1, 1, 1, 1, 1, 1, 1, 1, 1]),
      indices: Uint32Array.from([0, 1, 2])
    };
    const polygon: [number, number][] = [
      [0, 0],
      [5, 0],
      [0, 5]
    ];
    const result = clipWaterChunk(chunk, [{ polygon, box: bounds(polygon) }]);
    let area = 0;
    for (let i = 0; i < result.positions.length; i += 9) {
      const p = result.positions.slice(i, i + 9);
      area += Math.abs((p[3] - p[0]) * (p[8] - p[2]) - (p[6] - p[0]) * (p[5] - p[2])) / 2;
      for (let j = 0; j < 9; j += 3) expect(p[j + 1]).toBeCloseTo(p[j]);
    }
    expect(area).toBeCloseTo(37.5);
  });

  it("places the BV crane at the planned position and points its arm toward water", () => {
    const cache = createBvPrototypeCache();
    const result = createTownCranes(
      [
        {
          id: "c",
          kind: "treadwheel",
          point: [10, 20],
          armAngleRad: Math.PI / 2,
          radiusMeters: 2.8,
          armLengthMeters: 6.5
        }
      ],
      () => 3,
      cache
    );
    expect(result.accepted).toHaveLength(1);
    const transformed = new THREE.Vector3(1, 0, 0).applyMatrix4(result.accepted[0].matrix);
    expect(transformed.x).toBeCloseTo(10);
    expect(transformed.y).toBeCloseTo(2.8);
    expect(transformed.z).toBeCloseTo(-21);
    result.dispose();
    expect(cache.size).toBe(0);
  });
  it("places five BV barrels at the 2D pile locations and releases the prototype", () => {
    const cache = createBvPrototypeCache();
    const barrels = createTownHarborBarrels(
      [{ id: "cargo", kind: "barrels", point: [10, 20], widthMeters: 3.5, heightMeters: 2.2, rotation: 0 }],
      () => 0,
      cache
    );
    expect(barrels.accepted).toHaveLength(5);
    const first = new THREE.Vector3().setFromMatrixPosition(barrels.accepted[0].matrix);
    expect(first.x).toBeCloseTo(8.8);
    expect(first.z).toBeCloseTo(-20.55);
    barrels.dispose();
    expect(cache.size).toBe(0);
  });
});
