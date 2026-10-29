import { expect, it, vi } from "vitest";
import { meshIsClosed } from "../../city3d/core/massingGeometry";
import { model } from "./floatingIsland";
import { checkLandmark } from "./landmarkTestSupport";
import { generateIslandTerrain } from "./terrain/floatingIslandTerrain";

checkLandmark(model, assembly => {
  const rock = assembly.pickables.find(mesh => mesh.name === "inverted-mountains")!;
  const grass = assembly.pickables.find(mesh => mesh.name === "grass-surface")!;
  const normals = rock.geometry.getAttribute("normal");
  for (let i = 0; i < normals.count; i++) expect(normals.getY(i)).toBeLessThan(0);
  const upperNormals = grass.geometry.getAttribute("normal");
  for (let i = 0; i < upperNormals.count; i++) expect(upperNormals.getY(i)).toBeGreaterThan(0);
  const positions = new Float32Array(
    assembly.pickables.flatMap(mesh => Array.from(mesh.geometry.getAttribute("position").array))
  );
  expect(meshIsClosed(positions)).toBe(true);
});

it("rerolls both surfaces reproducibly", () => {
  const first = generateIslandTerrain("island-a", "terrain");
  expect(generateIslandTerrain("island-a", "terrain")).toEqual(first);
  const second = generateIslandTerrain("island-b", "terrain");
  expect(second.points).not.toEqual(first.points);
  expect(second.depths).not.toEqual(first.depths);
  expect(second.heights).not.toEqual(first.heights);
  expect([1, 2]).toContain(first.peakIndices.length);
  for (const i of first.peakIndices) {
    expect(first.depths[i]).toBeCloseTo(Math.max(...first.depths));
  }
});

it("keeps terrain generation independent of the global random stream", () => {
  const random = vi.spyOn(Math, "random");
  try {
    generateIslandTerrain("isolated-island", "terrain");
    expect(random).not.toHaveBeenCalled();
  } finally {
    random.mockRestore();
  }
});

it("joins flat or generated upper terrain to the same boundary and inverted foundation", () => {
  const terrain = generateIslandTerrain("island-a", "terrain");
  const flat = generateIslandTerrain("island-a", "flat");
  expect(flat.points).toEqual(terrain.points);
  expect(flat.depths).toEqual(terrain.depths);
  expect(flat.heights.every(value => value === 0)).toBe(true);
  expect(Math.max(...terrain.heights)).toBeGreaterThan(18);
  expect(Math.max(...terrain.depths)).toBeGreaterThan(100);
  for (const i of terrain.boundary) {
    expect(terrain.heights[i]).toBe(0);
    expect(terrain.depths[i]).toBe(0);
  }
});
