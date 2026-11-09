import * as THREE from "three";
import { describe, expect, it } from "vitest";
import saved from "../../../../docs/analytics/ce-meshless-m5-synthetic-20261107.json";
import { LAND_Y, WATER_Y } from "../../../city3d/core/waterGeometry";
import { createVectorExample } from "../../generators/vector/document";
import { evaluateAnchor } from "../../generators/vector/geometry/curves";
import { containsRegion, regionArea } from "../../generators/vector/geometry/regions";
import { parseVectorDocument } from "../../services/io/vector/documentCodec";
import { serializeVectorSvg } from "../../services/io/vector/exports";
import { vectorRenderData } from "./renderData";
import { createVectorScene } from "./scene3d";

describe("one adopted geometry contract", () => {
  it("uses the same saved building IDs for SVG and 3D at each actual checkpoint", () => {
    const doc = parseVectorDocument(JSON.stringify(saved))!,
      before = JSON.stringify(doc);
    for (const [stage, facilities, houses] of [
      ["blocksAndLanes", 0, 0],
      ["facilities", 28, 0],
      ["housing", 28, 99]
    ] as const) {
      const data = vectorRenderData(doc, stage),
        buildings = data.surfaces.filter(s => s.kind === "building");
      expect(buildings.filter(s => s.buildingKind === "facility")).toHaveLength(facilities);
      expect(buildings.filter(s => s.buildingKind === "housing")).toHaveLength(houses);
      const scene = createVectorScene(data),
        ids = scene.group.children.filter(o => o.userData.kind === "building").map(o => o.userData.id);
      expect(new Set(ids)).toEqual(new Set(buildings.map(b => b.id)));
      const svg = serializeVectorSvg(doc, stage),
        parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
      expect(parsed.querySelector("parsererror")).toBeNull();
      expect(parsed.querySelectorAll("[data-vector-placement]")).toHaveLength(buildings.length);
      expect(parsed.querySelector("[data-vector-node],[data-handle],[data-vector-path]")).toBeNull();
      scene.dispose();
      scene.dispose();
    }
    expect(JSON.stringify(doc)).toBe(before);
  });
  it("cuts the wall opening in 2D and 3D without moving the bridge or source curves", () => {
    const doc = createVectorExample(),
      data = vectorRenderData(doc),
      gate = doc.connections.gates.east,
      point = evaluateAnchor(doc.paths.outer, gate.anchor),
      wall = data.surfaces.find(s => s.id === "outer" && s.kind === "wall")!;
    expect(containsRegion(wall.polygons, point)).toBe(false);
    expect(wall.polygons.reduce((n, p) => n + regionArea(p), 0)).toBeGreaterThan(0);
    const scene = createVectorScene(data),
      box = new THREE.Box3().setFromObject(scene.group);
    // Nothing sinks past the water, which lies 1 m below the land as in the mesh editor.
    expect(box.min.y).toBeGreaterThanOrEqual(WATER_Y - LAND_Y - 0.02);
    expect(box.max.y).toBeGreaterThan(6);
    scene.dispose();
  });
});
