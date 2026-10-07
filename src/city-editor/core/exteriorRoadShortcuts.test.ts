import { describe, expect, it } from "vitest";
import { createDocument, createGridDocument } from "./document";
import { featureGroupVertices } from "./features";
import { shortcutExteriorRoads } from "./gateApproaches";
import { defaultGenerationSettings, generateCityOnDocument } from "./generate";
import { faceVertices, validate } from "./mesh";

function fixture() {
  const document = createDocument("shortcut", 900, 110);
  const face = Object.values(document.mesh.faces).find(f => faceVertices(document.mesh, f).length >= 4)!;
  face.properties = { ...face.properties, water: "land", buildable: false, ward: "empty" };
  document.featureGroups = [
    {
      id: "gc:road-0",
      kind: "road",
      name: "Approach",
      locked: false,
      segments: face.boundary.slice(0, 3),
      style: { widthMeters: 5, color: "#735238" }
    }
  ];
  return { document, face };
}

describe("exterior road shortcuts", () => {
  it("replaces an empty cell perimeter detour with a valid mesh chord", () => {
    const { document } = fixture();
    const before = featureGroupVertices(document, document.featureGroups[0]);
    const result = shortcutExteriorRoads(document);
    const after = featureGroupVertices(result, result.featureGroups[0]);
    expect(after.length).toBeLessThan(before.length);
    expect(after[0]).toBe(before[0]);
    expect(after.at(-1)).toBe(before.at(-1));
    expect(validate(result)).toEqual([]);
    expect(document.featureGroups[0].kind === "road" && document.featureGroups[0].segments.length).toBe(3);
  });

  it.each(["buildable", "water", "wall", "junction"])("preserves %s obstacles", obstacle => {
    const { document, face } = fixture();
    if (obstacle === "buildable") face.properties.buildable = true;
    if (obstacle === "water") face.properties.water = "sea";
    if (obstacle === "wall")
      document.featureGroups.push({
        id: "wall",
        kind: "wall",
        name: "Wall",
        locked: false,
        segments: [face.boundary[1]],
        style: { widthMeters: 3, color: "#000" }
      });
    if (obstacle === "junction") document.mesh.vertices[faceVertices(document.mesh, face)[1]].locked = true;
    if (obstacle === "junction")
      document.featureGroups.push({
        id: "branch",
        kind: "road",
        name: "Branch",
        locked: false,
        segments: [face.boundary[1]],
        style: { widthMeters: 3, color: "#000" }
      });
    expect(shortcutExteriorRoads(document).featureGroups[0]).toEqual(document.featureGroups[0]);
  });
});

it("routes the reported evolution town with valid exterior chords", () => {
  const input = createGridDocument({
    size: "tiny",
    grid: "evolution",
    seed: "129qlvp",
    patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
  });
  const settings = defaultGenerationSettings();
  settings.layout = "organic";
  settings.walledAreaShare = 1;
  settings.config.coast = "none";
  settings.config.rivers = ["meander", "beside"];
  settings.config.relief = false;
  settings.config.features = { walls: true, citadel: false, plaza: false, temple: true, port: false, shanty: false };
  const city = generateCityOnDocument(input, settings, "1y9mu1o");
  expect(city).not.toBeNull();
  expect(validate(city!)).toEqual([]);
  // The reported detour hugged an empty exterior cell. Mesh ids drift with the
  // generator, so assert the property: no generated road is left to shorten.
  const roads = (doc: typeof city) =>
    doc!.featureGroups.flatMap(group => (group.kind === "road" ? [[group.id, group.segments]] : []));
  expect(roads(shortcutExteriorRoads(city!))).toEqual(roads(city));
});
