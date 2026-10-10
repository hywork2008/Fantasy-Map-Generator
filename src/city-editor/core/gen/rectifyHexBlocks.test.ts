import { describe, expect, it } from "vitest";
import { createGridDocument } from "../document";
import { defaultGenerationSettings, generateCityOnDocument } from "../generate";
import { facePoints, faceVertices } from "../mesh";
import type { Point } from "../types";
import { polygonArea, polygonCentroid } from "./geom";
import { isHexagonalDocument, rectifyHexBlocks } from "./rectifyHexBlocks";

describe("rectifyHexBlocks", () => {
  const hexDoc = createGridDocument({ size: "small", grid: "hex", seed: "hex-test" });
  const voronoiDoc = createGridDocument({ size: "small", grid: "voronoi", seed: "voronoi-test" });

  it("identifies hexagonal documents vs voronoi documents", () => {
    expect(isHexagonalDocument(hexDoc)).toBe(true);
    expect(isHexagonalDocument(voronoiDoc)).toBe(false);
  });

  it("shrinks hex cell diagonals without pushing any corner inside its neighbours' line (no concavity)", () => {
    const settings = defaultGenerationSettings();
    settings.config.rivers = [];
    const rawCity = generateCityOnDocument(hexDoc, { ...settings, streets: { foldSmoothing: false } }, "rectify-seed");
    expect(rawCity).toBeTruthy();
    if (!rawCity) return;
    // Later passes intentionally bend hexes (rounded curtains, squared gate arms),
    // so measure what rectification itself does to a generated city.
    const rectified = rectifyHexBlocks(rawCity, "rectify-pass");

    /** Deepest corner on the centroid side of the line joining its two neighbours. */
    const inwardDepth = (pts: Point[]): number => {
      const centroid = polygonCentroid(pts);
      let deepest = 0;
      for (let i = 0; i < pts.length; i++) {
        const pPrev = pts[(i + pts.length - 1) % pts.length];
        const pk = pts[i];
        const pNext = pts[(i + 1) % pts.length];
        const lineDx = pNext[0] - pPrev[0];
        const lineDy = pNext[1] - pPrev[1];
        const lineLen = Math.hypot(lineDx, lineDy);
        if (lineLen < 1e-4) continue;
        const distK = (lineDx * (pk[1] - pPrev[1]) - lineDy * (pk[0] - pPrev[0])) / lineLen;
        const distC = (lineDx * (centroid[1] - pPrev[1]) - lineDy * (centroid[0] - pPrev[0])) / lineLen;
        if (distK * distC > 0) deepest = Math.max(deepest, Math.abs(distK));
      }
      return deepest;
    };

    let checkedCells = 0;
    let movedVertices = 0;
    for (const face of Object.values(rectified.mesh.faces)) {
      if (face.properties.water !== "land" || !face.properties.buildable) continue;
      const before = rawCity.mesh.faces[face.id];
      if (!before || faceVertices(rectified.mesh, face).length !== 6) continue;
      const pts = facePoints(rectified.mesh, face);
      expect(Math.abs(polygonArea(pts))).toBeGreaterThan(50);
      expect(inwardDepth(pts), face.id).toBeLessThanOrEqual(inwardDepth(facePoints(rawCity.mesh, before)) + 0.1);
      checkedCells++;
    }
    for (const [id, vertex] of Object.entries(rectified.mesh.vertices)) {
      const was = rawCity.mesh.vertices[id]?.point;
      if (was && Math.hypot(vertex.point[0] - was[0], vertex.point[1] - was[1]) > 0.01) movedVertices++;
    }
    expect(checkedCells).toBeGreaterThan(20);
    expect(movedVertices).toBeGreaterThan(0);
  });

  it("produces rectangular-like blocks with natural jitter (edges are not mathematically flat collinear)", () => {
    const settings = defaultGenerationSettings();
    settings.config.rivers = [];
    const city = generateCityOnDocument(hexDoc, settings, "jitter-seed");
    expect(city).toBeTruthy();
    if (!city) return;

    const { mesh } = city;
    let maxCurvatureDeviation = 0;

    for (const face of Object.values(mesh.faces)) {
      if (face.properties.water !== "land" || !face.properties.buildable) continue;
      const vIds = faceVertices(mesh, face);
      if (vIds.length !== 6) continue;

      const pts = facePoints(mesh, face);
      for (let i = 0; i < 6; i++) {
        const pPrev = pts[(i + 5) % 6];
        const pk = pts[i];
        const pNext = pts[(i + 1) % 6];

        const lineDx = pNext[0] - pPrev[0];
        const lineDy = pNext[1] - pPrev[1];
        const lineLen = Math.hypot(lineDx, lineDy);
        if (lineLen < 1e-4) continue;

        // Distance from pk to the line connecting pPrev and pNext
        const dist = Math.abs(lineDx * (pPrev[1] - pk[1]) - (pPrev[0] - pk[0]) * lineDy) / lineLen;
        maxCurvatureDeviation = Math.max(maxCurvatureDeviation, dist);
      }
    }

    // Because of jitter, vertices do not lie at exactly distance 0.0000 from the line
    expect(maxCurvatureDeviation).toBeGreaterThan(0.5);
  });

  it("is fully deterministic with the same seed", () => {
    const settings = defaultGenerationSettings();
    const city1 = generateCityOnDocument(hexDoc, settings, "determinism-check");
    const city2 = generateCityOnDocument(hexDoc, settings, "determinism-check");
    expect(city1).toEqual(city2);
  });
});
