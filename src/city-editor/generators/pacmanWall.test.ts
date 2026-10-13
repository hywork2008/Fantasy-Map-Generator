import { expect, it } from "vitest";
import { createGridDocument } from "./document";
import { featureGroupVertices } from "./features";
import { generateStageOnDocument } from "./generation/previews";
import { defaultGenerationSettings } from "./generation/settings";
import { polygonArea } from "./geom";
import { validate } from "./mesh";

it("preserves the outer curtain around a shared river boundary", () => {
  const input = createGridDocument({ size: "small", grid: "voronoi", seed: "k54xfe" });
  const settings = defaultGenerationSettings();
  settings.config.coast = "none";
  settings.config.rivers = ["through"];
  settings.config.relief = false;
  settings.config.features = { walls: true, plaza: true, temple: true, citadel: false, port: false, shanty: true };
  settings.config.layout = "organic";
  settings.buildingPattern = "medieval";
  settings.townWallRings = "double";
  settings.historicalPeriod = "ageOfExploration";
  const raw = generateStageOnDocument(input, settings, "us4eii:junction-retry:1", 4, undefined, "walls")!;
  const repaired = generateStageOnDocument(input, settings, "us4eii:junction-retry:1", 4, undefined, "riverPassages")!;
  expect(raw).not.toBeNull();
  expect(repaired).not.toBeNull();
  const area = (doc: typeof raw) => {
    const wall = doc.featureGroups.find(g => g.kind === "wall")!;
    return Math.abs(polygonArea(featureGroupVertices(doc, wall).map(id => doc.mesh.vertices[id].point)));
  };
  expect(area(repaired) / area(raw)).toBeGreaterThan(0.9);
  const wall = repaired.featureGroups.find(g => g.kind === "wall")!;
  const vertices = featureGroupVertices(repaired, wall);
  expect(vertices[0]).toBe(vertices.at(-1));
  expect(wall.riverPassages?.length).toBeGreaterThanOrEqual(2);
  expect(validate(repaired)).toEqual([]);
});
