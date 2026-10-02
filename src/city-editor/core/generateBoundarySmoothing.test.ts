import { describe, expect, it } from "vitest";
import { createGridDocument } from "./document";
import { featureGroupVertices } from "./features";
import { finishCityGeometry } from "./gen/finishCityGeometry";
import { isSimplePolygon, polygonArea } from "./gen/geom";
import { defaultGenerationSettings, generateStageOnDocument } from "./generate";
import { facePoints, validate } from "./mesh";
import type { CityDocument, Point } from "./types";

function points(document: CityDocument, kind: "wall" | "river"): Point[] {
  const group = document.featureGroups.find(g => g.kind === kind)!;
  return featureGroupVertices(document, group).map(id => document.mesh.vertices[id].point);
}

function turning(line: Point[]): number {
  let sum = 0;
  for (let i = 1; i + 1 < line.length; i++) {
    const a = line[i - 1],
      b = line[i],
      c = line[i + 1];
    const ax = b[0] - a[0],
      ay = b[1] - a[1],
      bx = c[0] - b[0],
      by = c[1] - b[1];
    sum += Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by));
  }
  return sum;
}

function circularity(line: Point[]): number {
  const ring = line.slice(0, -1);
  const perimeter = ring.reduce((sum, p, i) => {
    const q = ring[(i + 1) % ring.length];
    return sum + Math.hypot(p[0] - q[0], p[1] - q[1]);
  }, 0);
  return (4 * Math.PI * Math.abs(polygonArea(ring))) / perimeter ** 2;
}

function minimumCorner(ring: Point[]): number {
  return Math.min(
    ...ring.map((p, i) => {
      const a = ring[(i + ring.length - 1) % ring.length],
        b = ring[(i + 1) % ring.length];
      const ax = a[0] - p[0],
        ay = a[1] - p[1],
        bx = b[0] - p[0],
        by = b[1] - p[1];
      return Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by)))));
    })
  );
}

describe("boundary preparation before river/wall routing", () => {
  for (const grid of ["hex", "voronoi", "evolution"] as const) {
    it(`rounds rivers and walls together on the ${grid} grid without folding cells`, () => {
      const input = createGridDocument({ size: "tiny", grid, seed: "boundary-smoothing" });
      const settings = defaultGenerationSettings();
      settings.layout = "classic";
      settings.config.coast = "none";
      settings.config.rivers = ["meander"];
      settings.config.features.citadel = false;
      const raw = generateStageOnDocument(input, settings, "boundary-smoothing", 4, undefined, "walls")!;
      expect(raw).not.toBeNull();
      const before = structuredClone(raw);
      const rounded = finishCityGeometry(raw, "boundaries");
      expect(turning(points(rounded, "river"))).toBeLessThan(turning(points(raw, "river")));
      expect(circularity(points(rounded, "wall"))).toBeGreaterThan(circularity(points(raw, "wall")));
      expect(points(rounded, "river")[0]).toEqual(points(raw, "river")[0]);
      expect(points(rounded, "river").at(-1)).toEqual(points(raw, "river").at(-1));
      for (const face of Object.values(rounded.mesh.faces)) {
        const polygon = facePoints(rounded.mesh, face);
        const original = facePoints(raw.mesh, raw.mesh.faces[face.id]);
        expect(isSimplePolygon(polygon)).toBe(true);
        expect(minimumCorner(polygon)).toBeGreaterThanOrEqual(Math.min(Math.PI / 12, minimumCorner(original)) - 1e-5);
        expect(
          polygonArea(polygon) / polygonArea(facePoints(raw.mesh, raw.mesh.faces[face.id]))
        ).toBeGreaterThanOrEqual(grid === "evolution" ? 0.5 : 0.12);
      }
      expect(validate(rounded)).toEqual([]);
      expect(raw).toEqual(before);
      // Isolate preparation from the feasibility of a particular curtain's
      // river detour: unwalled cities must receive channel smoothing too.
      settings.config.features.walls = false;
      const prepared = generateStageOnDocument(input, settings, "boundary-smoothing", 4, undefined, "riverPassages")!;
      expect(prepared).not.toBeNull();
      expect(turning(points(prepared, "river"))).toBeLessThan(turning(points(raw, "river")));
      expect(validate(prepared)).toEqual([]);
      const finished = finishCityGeometry(prepared);
      expect(points(finished, "river")).toEqual(points(prepared, "river"));
      const locked = structuredClone(raw);
      const river = locked.featureGroups.find(g => g.kind === "river")!;
      river.locked = true;
      expect(points(finishCityGeometry(locked, "boundaries"), "river")).toEqual(points(locked, "river"));
    });
  }
});
