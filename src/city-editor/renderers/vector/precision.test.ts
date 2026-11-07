import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { VectorRenderData } from "./renderData";
import { createVectorScene } from "./scene3d";

describe("metre precision at a translated local frame", () => {
  it("preserves millimetre plan detail and absolute elevations in world space and exports", () => {
    const center: [number, number] = [1e6, -1e6],
      outer: [number, number][] = [
        [center[0] + 0.001, center[1] + 0.003],
        [center[0] + 6.123, center[1] + 0.003],
        [center[0] + 6.123, center[1] + 4.987],
        [center[0] + 0.001, center[1] + 4.987]
      ],
      datum = 4000;
    const data: VectorRenderData = {
      revision: 1,
      stage: "regions",
      center,
      extentMeters: 100,
      paths: [],
      nodes: [],
      warnings: [],
      terrain: {
        points: [
          [center[0], datum, center[1]],
          [center[0] + 100, datum, center[1]],
          [center[0], datum, center[1] + 100]
        ],
        indices: [0, 1, 2]
      },
      surfaces: [
        {
          id: "translated",
          kind: "road",
          polygons: [{ outer, holes: [] }],
          color: "#aabbcc",
          heightMeters: 0,
          elevationMeters: 0.02,
          heightAt: () => datum
        }
      ]
    };
    data.surfaces.push({
      id: "level-pad",
      kind: "feature",
      polygons: [{ outer, holes: [] }],
      color: "#aabbcc",
      heightMeters: 2,
      elevationMeters: datum + 7
    });
    const scene = createVectorScene(data);
    try {
      scene.group.updateMatrixWorld(true);
      const mesh = scene.group.children.find(o => o.userData.id === "translated") as THREE.Mesh;
      const bounds = new THREE.Box3().setFromObject(mesh);
      expect(Math.abs(bounds.min.x - outer[0][0])).toBeLessThan(0.00001);
      expect(Math.abs(bounds.max.x - outer[1][0])).toBeLessThan(0.00001);
      expect(Math.abs(bounds.min.z + outer[2][1])).toBeLessThan(0.00001);
      expect(Math.abs(bounds.min.y - (datum + 0.02))).toBeLessThan(0.00001);
      const pad = scene.group.children.find(o => o.userData.id === "level-pad")!;
      expect(new THREE.Box3().setFromObject(pad).max.y).toBeCloseTo(datum + 9, 5);
      expect(scene.group.userData.originEastNorth).toEqual(center);
    } finally {
      scene.dispose();
    }
  });
});
