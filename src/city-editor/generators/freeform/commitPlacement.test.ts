import { describe, expect, it } from "vitest";
import { facingFromRotation } from "../../../buildings/placementContract";
import { createGridDocument } from "../document";
import { cityTerrain } from "../terrainElevation";
import { buildTerrainFieldRecipe } from "../terrainField/build";
import { validateTerrainLayer } from "../terrainValidation";
import { commitPlacement, isPlotPlacement, previewPlacement, removePlacement } from "./commitPlacement";
import { facingToward, snapFacing } from "./facing";
import { terrainRayPoint } from "./groundPick";

const footprint = { halfX: 4, halfZ: 6, centerX: 0, centerZ: 0, groundY: 0 };

function domeDocument() {
  const document = createGridDocument({ size: "micro", seed: "freeform-f1", grid: "hex" });
  document.terrain = {
    version: 1,
    features: [],
    field: buildTerrainFieldRecipe({
      template: "dome",
      seed: 3,
      extentMeters: document.frame.extentMeters,
      sampleMeters: 8
    })
  };
  return document;
}

describe("freeform placement", () => {
  it("lays a level pad and keeps the building on it", () => {
    const document = domeDocument();
    const placed = commitPlacement(document, {
      id: "house-1",
      modelId: "house:mediterranean",
      position: [0, 0],
      facingDegrees: 0,
      footprint
    });
    expect(placed.preview.ok).toBe(true);
    expect(placed.preview.level).toBeGreaterThan(4);
    const element = placed.document.elements.find(item => item.id === "house-1");
    expect(element?.objectType).toBe("house:mediterranean");
    expect(facingFromRotation("+z", element?.rotation ?? 99)).toBeCloseTo(0, 5);
    const terrain = cityTerrain(placed.document);
    const local = placed.preview.level - terrain.datumMeters;
    expect(terrain.heightAt([0, 0])).toBeCloseTo(local, 1);
    expect(terrain.heightAt([2, 1])).toBeCloseTo(terrain.heightAt([0, 0]), 2);
    expect(Math.abs(terrain.heightAt([40, 0]) - local)).toBeGreaterThan(0.5);
  });

  it("accepts a flush pad where the ground is already level", () => {
    const document = createGridDocument({ size: "micro", seed: "freeform-flat", grid: "hex" });
    document.terrain = {
      version: 1,
      features: [],
      field: {
        version: 1,
        template: "noise",
        seed: 1,
        sampleMeters: 8,
        parts: [{ kind: "offset", meters: 4 }]
      }
    };
    const placed = commitPlacement(document, {
      id: "house-flat",
      modelId: "house:mediterranean",
      position: [0, 0],
      facingDegrees: 0,
      footprint
    });
    expect(placed.preview.ok).toBe(true);
    expect(placed.preview.edge).toEqual({ kind: "slope", runMeters: 0 });
    expect(validateTerrainLayer(placed.document)).toEqual([]);
    const terrain = cityTerrain(placed.document);
    expect(terrain.heightAt([0, 0])).toBeCloseTo(placed.preview.level - terrain.datumMeters, 2);
  });

  it("rejects a plot that overlaps another, and remove clears the pad", () => {
    const first = commitPlacement(domeDocument(), {
      id: "house-1",
      modelId: "house:mediterranean",
      position: [0, 0],
      facingDegrees: 90,
      footprint
    }).document;
    const second = previewPlacement(first, {
      id: "house-2",
      modelId: "house:mediterranean",
      position: [2, 0],
      facingDegrees: 0,
      footprint
    });
    expect(second.ok).toBe(false);
    expect(second.reason).toBe("overlap");
    const beside = commitPlacement(first, {
      id: "house-2",
      modelId: "house:mediterranean",
      position: [30, 0],
      facingDegrees: 180,
      footprint
    });
    expect(beside.preview.ok).toBe(true);
    const removed = removePlacement(beside.document, "house-1");
    expect(isPlotPlacement(removed, "house-1")).toBe(false);
    expect(removed.elements.some(item => item.id === "house-1")).toBe(false);
    expect(isPlotPlacement(removed, "house-2")).toBe(true);
  });

  it("needs a height field and snaps facing to the cardinal directions", () => {
    const bare = createGridDocument({ size: "micro", seed: "freeform-flat", grid: "hex" });
    expect(
      previewPlacement(bare, { id: "a", modelId: "trebuchet", position: [0, 0], facingDegrees: 10, footprint }).reason
    ).toBe("field");
    expect(facingToward([0, 0], [0, 10])).toBeCloseTo(0, 5);
    expect(facingToward([0, 0], [10, 0])).toBeCloseTo(90, 5);
    expect(snapFacing(2, null)).toBe(0);
    expect(snapFacing(16, 15)).toBe(15);
    expect(terrainRayPoint(() => 5, { origin: [0, 0, 20], direction: [0, 1, -1] }, 40)?.[1]).toBeGreaterThan(10);
  });
});
