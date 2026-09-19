import { describe, expect, it } from "vitest";
import { createGridDocument } from "../document";
import { defaultGenerationSettings, generateCityOnDocument } from "../generate";
import { facePoints, faceVertices } from "../mesh";
import { polygonArea, polygonCentroid } from "./geom";
import { isHexagonalDocument, rectifyHexBlocks } from "./rectifyHexBlocks";

describe("rectifyHexBlocks", () => {
  const hexDoc = createGridDocument({ size: "small", grid: "hex", seed: "hex-test" });
  const voronoiDoc = createGridDocument({ size: "small", grid: "voronoi", seed: "voronoi-test" });

  it("identifies hexagonal documents vs voronoi documents", () => {
    expect(isHexagonalDocument(hexDoc)).toBe(true);
    expect(isHexagonalDocument(voronoiDoc)).toBe(false);
  });

  it("shrinks hex cell diagonals while keeping all corners strictly outside/on neighbouring lines (no concavity)", () => {
    const settings = defaultGenerationSettings();
    settings.config.rivers = [];
    const rawCity = generateCityOnDocument(hexDoc, { ...settings, streets: { foldSmoothing: false } }, "rectify-seed");
    expect(rawCity).toBeTruthy();
    if (!rawCity) return;

    const { mesh } = rawCity;
    let checkedCells = 0;

    for (const face of Object.values(mesh.faces)) {
      if (face.properties.water !== "land" || !face.properties.buildable) continue;
      const vIds = faceVertices(mesh, face);
      if (vIds.length !== 6) continue;

      const pts = facePoints(mesh, face);
      const centroid = polygonCentroid(pts);
      const area = Math.abs(polygonArea(pts));
      expect(area).toBeGreaterThan(50);

      // Check strictly that every vertex k is on or outside the line connecting its two neighbours.
      // With respect to the line (pPrev -> pNext), the centroid C is inside.
      // Therefore, pk must be on the opposite side of C (cross(pk) and cross(C) have opposite signs,
      // i.e. cross(pk) * cross(C) <= 0), or collinear (cross(pk) == 0).
      for (let i = 0; i < 6; i++) {
        const pPrev = pts[(i + 5) % 6];
        const pk = pts[i];
        const pNext = pts[(i + 1) % 6];

        const lineDx = pNext[0] - pPrev[0];
        const lineDy = pNext[1] - pPrev[1];
        const lineLen = Math.hypot(lineDx, lineDy);
        if (lineLen < 1e-4) continue;

        // Signed distance from line to pk and to centroid
        const distK = (lineDx * (pk[1] - pPrev[1]) - lineDy * (pk[0] - pPrev[0])) / lineLen;
        const distC = (lineDx * (centroid[1] - pPrev[1]) - lineDy * (centroid[0] - pPrev[0])) / lineLen;

        // Inward depth towards centroid: positive if on the centroid side of the line
        const inwardDepth = distK * distC > 0 ? Math.abs(distK) : 0;
        expect(inwardDepth).toBeLessThanOrEqual(0.1);
      }
      checkedCells++;
    }

    expect(checkedCells).toBeGreaterThan(20);
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
