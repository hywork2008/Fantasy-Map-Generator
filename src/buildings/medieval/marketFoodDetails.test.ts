import * as THREE from "three";
import { expect, it } from "vitest";
import { collectModelMetrics } from "../../building-viewer/modelMetrics";
import type { CityElement } from "../../city-editor/types/document";
import { createTownObjects } from "../../city3d/three/objectMeshes";
import { modelParts } from "../modelParts";
import { placementDefinition, placementFootprint } from "../placementModels";
import { MARKET_PALETTES } from "./marketAppearance";
import { createMarketFoodStall, MARKET_FOOD_IDS } from "./marketFoodDetails";

it.each(MARKET_FOOD_IDS)("%s keeps its envelope and vendor passage across palettes and quality levels", id => {
  for (const quality of ["low", "high"] as const) {
    let base: THREE.Box3 | undefined;
    for (const palette of MARKET_PALETTES) {
      const model = createMarketFoodStall(id, quality, palette);
      try {
        model.group.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(model.group, true);
        if (base) expect(bounds).toEqual(base);
        base = bounds;
        const footprint = placementFootprint(id, quality)!;
        expect(bounds.max.x - bounds.min.x).toBeCloseTo(footprint.halfX * 2, 5);
        expect(bounds.max.z - bounds.min.z).toBeCloseTo(footprint.halfZ * 2, 5);
        expect(bounds.min.y).toBeCloseTo(0, 5);
        expect(collectModelMetrics(model.group).triangles).toBeLessThan(25000);
        expect(modelParts(model.group).map(part => part.id)).toEqual([
          "stall-shell",
          "display-goods",
          "stock-and-storage"
        ]);
        const aisle = new THREE.Raycaster(new THREE.Vector3(-2.1, 1.55, 0), new THREE.Vector3(1, 0, 0), 0, 3.6);
        expect(aisle.intersectObjects(model.pickables)).toHaveLength(0);
        const rearEntrance = new THREE.Raycaster(new THREE.Vector3(1.2, 1.4, -1.6), new THREE.Vector3(0, 0, 1), 0, 1.6);
        expect(rearEntrance.intersectObjects(model.pickables)).toHaveLength(0);
        const goods = new THREE.Raycaster(
          new THREE.Vector3(id === "market-bread-stall" ? -1.35 : -1.05, 1.5, 0.84),
          new THREE.Vector3(0, -1, 0)
        );
        expect(goods.intersectObjects(model.pickables)[0].point.y).toBeGreaterThan(1.05);
        if (id.endsWith("table")) {
          const top = new THREE.Raycaster(new THREE.Vector3(0, 4, 0), new THREE.Vector3(0, -1, 0));
          expect(top.intersectObjects(model.pickables)).toHaveLength(0);
        }
      } finally {
        model.dispose();
      }
    }
  }
});

it("bakes different palettes into distinct CE batches without changing cached factory materials", () => {
  const id = "market-bread-stall";
  const before = placementDefinition(id, "high", "ochre")!.create();
  const colors = () => before.pickables.map(mesh => (mesh.material as THREE.MeshLambertMaterial).color.getHex());
  const oldColors = colors();
  const elements: CityElement[] = MARKET_PALETTES.map((palette, i) => ({
    id: palette,
    kind: "object",
    faceIds: [],
    locked: false,
    point: [i * 10, 0],
    objectType: id,
    objectQuality: "high",
    objectPalette: palette
  }));
  const layer = createTownObjects(elements);
  try {
    expect(layer.accepted).toHaveLength(3);
    const batches = layer.group.children as THREE.Mesh[];
    expect(batches).toHaveLength(3);
    const bakedColors = batches.map(mesh => Array.from(mesh.geometry.getAttribute("color").array));
    expect(bakedColors[0]).not.toEqual(bakedColors[1]);
    expect(bakedColors[1]).not.toEqual(bakedColors[2]);
    expect(colors()).toEqual(oldColors);
  } finally {
    layer.dispose();
    before.dispose();
  }
});
