import { describe, expect, it } from "vitest";
import { createGridDocument } from "./document";
import { featureGroupVertices } from "./features";
import { nearestOnPolyline, segmentsIntersect } from "./gen/geom";
import { defaultGenerationSettings, generateStageOnDocument } from "./generate";

describe("single river outside the city wall", () => {
  for (const seed of ["outside-river", "near-wall-2", "near-wall-3"]) {
    for (const grid of ["voronoi", "evolution"] as const) {
      for (const placement of ["outsideNear", "outside"] as const) {
        for (const coast of ["none", "straight", "bay"] as const) {
          it(`keeps ${placement} river clear of walls on ${coast} ${grid} sites (${seed})`, () => {
            const base = createGridDocument({ size: "small", seed: "outside-river-mesh", grid });
            const settings = defaultGenerationSettings();
            settings.layout = "organic";
            settings.config.coast = coast;
            settings.config.rivers = [coast === "none" ? "meander" : "toCoast"];
            settings.config.features.walls = true;
            settings.riverPlacement = placement;
            const result = generateStageOnDocument(base, settings, seed, 4);
            expect(result).not.toBeNull();
            const doc = result!;
            const lines = (kind: "river" | "wall") =>
              doc.featureGroups
                .filter(g => g.kind === kind)
                .map(g => featureGroupVertices(doc, g).map(id => doc.mesh.vertices[id].point));
            const rivers = lines("river");
            const walls = lines("wall");
            expect(rivers).toHaveLength(1);
            expect(walls.length).toBeGreaterThan(0);
            const closest = Math.min(
              ...walls.flatMap(wall => wall.map(point => nearestOnPolyline(point, rivers[0]).dist)),
              ...rivers[0].flatMap(point => walls.map(wall => nearestOnPolyline(point, [...wall, wall[0]]).dist))
            );
            expect(closest).toBeLessThan(base.frame.blockSizeMeters * (placement === "outsideNear" ? 2.6 : 3.5));
            for (const wall of walls) {
              for (const point of wall)
                expect(nearestOnPolyline(point, rivers[0]).dist).toBeGreaterThan(base.frame.blockSizeMeters * 0.5);
              for (let i = 1; i < wall.length; i++) {
                for (let j = 1; j < rivers[0].length; j++) {
                  expect(segmentsIntersect(wall[i - 1], wall[i], rivers[0][j - 1], rivers[0][j])).toBe(false);
                }
              }
            }
          });
        }
      }
    }
  }
});
