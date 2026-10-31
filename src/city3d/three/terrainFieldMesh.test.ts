import { describe, expect, it } from "vitest";
import { createDocument } from "../../city-editor/generators/document";
import { cityTerrain } from "../../city-editor/generators/terrainElevation";
import { buildDrawGrid, terrainChunkGeometry } from "../../city-editor/generators/terrainField/drawGrid";
import type { Point } from "../../city-editor/types/document";
import { terrainFieldMeshes } from "./terrainFieldMesh";

describe("terrain chunk shading", () => {
  it.each([false, true])("keeps flat ground normals vertical at internal seams (water clipped: %s)", clipped => {
    const document = createDocument("flat-chunk-seams", 1200);
    document.terrain = {
      version: 1,
      features: [],
      field: { version: 1, template: "noise", seed: 0, sampleMeters: 10, parts: [{ kind: "offset", meters: 1 }] }
    };
    const water: Point[][] = clipped
      ? [
          [
            [-100, -600],
            [100, -600],
            [100, 600],
            [-100, 600]
          ]
        ]
      : [];
    const meshes = terrainFieldMeshes(document, cityTerrain(document), water);
    expect(meshes.length).toBeGreaterThan(1);
    let maxError = 0,
      triangles = 0;
    for (const mesh of meshes) {
      const positions = mesh.geometry.getAttribute("position");
      const normals = mesh.geometry.getAttribute("normal");
      expect(normals.count).toBe(positions.count);
      const indices = mesh.geometry.index!;
      for (let i = 0; i < indices.count; i += 3) {
        const ids = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)];
        // Skirt triangles have one or two lowered vertices; ground triangles stay level.
        if (ids.some(id => Math.abs(positions.getY(id) - positions.getY(ids[0])) > 0.001)) continue;
        triangles++;
        for (const id of ids)
          maxError = Math.max(
            maxError,
            Math.abs(normals.getX(id)),
            Math.abs(normals.getY(id) - 1),
            Math.abs(normals.getZ(id))
          );
      }
      mesh.geometry.dispose();
      (mesh.material as import("three").Material).dispose();
    }
    expect(triangles).toBeGreaterThan(0);
    expect(maxError).toBeLessThan(1e-6);
  });

  it("stitches mixed-LOD edges without any internal skirt faces", () => {
    const grid = buildDrawGrid(1200, 2, ([x, y]) => x * x * 0.0004 + y * y * 0.0002);
    const chunks = terrainChunkGeometry(grid, () => 0, 200, 2);
    let internalWalls = 0;
    for (const chunk of chunks)
      for (let i = 0; i < chunk.positions.length; i += 3)
        if (
          chunk.normals![i + 1] === 0 &&
          Math.abs(chunk.positions[i]) < 599.99 &&
          Math.abs(chunk.positions[i + 2]) < 599.99
        )
          internalWalls++;
    expect(internalWalls).toBe(0);
    const edge = (chunk: (typeof chunks)[number]) => {
      const heights = new Map<number, number>();
      for (let i = 0; i < chunk.positions.length; i += 3)
        if (chunk.normals![i + 1] > 0 && chunk.positions[i] === -90)
          heights.set(chunk.positions[i + 2], chunk.positions[i + 1]);
      return [...heights.entries()].sort((a, b) => a[0] - b[0]);
    };
    // Row 1: column 0 is coarse, column 1 is fine. Both must carry every boundary sample.
    expect(edge(chunks[3])).toHaveLength(256);
    expect(edge(chunks[3])).toEqual(edge(chunks[4]));
    for (const chunk of chunks) {
      let projectedArea = 0,
        wrongWinding = 0;
      for (let i = 0; i < chunk.indices.length; i += 3) {
        const [a, b, c] = [chunk.indices[i], chunk.indices[i + 1], chunk.indices[i + 2]].map(id => [
          chunk.positions[id * 3],
          chunk.positions[id * 3 + 2]
        ]);
        const area = ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
        // Ground faces point up; vertical outer skirts have zero projected area.
        if (area > 0) wrongWinding++;
        projectedArea -= area;
      }
      expect(wrongWinding).toBe(0);
      const x = chunk.positions.filter((_, i) => i % 3 === 0);
      const z = chunk.positions.filter((_, i) => i % 3 === 2);
      const extent = (values: Float32Array) =>
        values.reduce(
          (result, value) => [Math.min(result[0], value), Math.max(result[1], value)],
          [Infinity, -Infinity]
        );
      const [minX, maxX] = extent(x),
        [minZ, maxZ] = extent(z);
      expect(projectedArea).toBeCloseTo((maxX - minX) * (maxZ - minZ), 3);
    }
  });

  it("shares the same hillside normal across chunks with different draw spacing", () => {
    const grid = buildDrawGrid(1200, 2, ([x, y]) => x * x * 0.0004 + y * 0.01);
    const chunks = terrainChunkGeometry(grid, () => 0, 200, 2);
    const seen = new Map<string, number[]>();
    let shared = 0,
      maxError = 0;
    for (const chunk of chunks)
      for (let i = 0; i < chunk.positions.length; i += 3) {
        const normal = Array.from(chunk.normals!.subarray(i, i + 3));
        if (normal[1] === 0) continue;
        const key = `${chunk.positions[i]},${chunk.positions[i + 2]}`;
        const previous = seen.get(key);
        if (previous) {
          shared++;
          for (let channel = 0; channel < 3; channel++)
            maxError = Math.max(maxError, Math.abs(normal[channel] - previous[channel]));
        } else seen.set(key, normal);
      }
    expect(new Set(chunks.map(chunk => chunk.positions.length)).size).toBeGreaterThan(1);
    expect(shared).toBeGreaterThan(100);
    expect(maxError).toBeLessThan(1e-7);
  });
});
