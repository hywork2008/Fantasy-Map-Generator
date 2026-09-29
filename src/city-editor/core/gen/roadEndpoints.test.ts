import { describe, expect, it } from "vitest";
import { createGridDocument } from "../document";
import { featureGroupVertices } from "../features";
import { defaultGenerationSettings, generateCityOnDocument } from "../generate";
import { validate } from "../mesh";

describe("external road endpoints", () => {
  it("stops gc:road-1 at its first frame contact from town in the shared 1o564jj city", () => {
    const input = createGridDocument({
      size: "small",
      grid: "evolution",
      seed: "1wnd0y0",
      patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
    });
    const settings = defaultGenerationSettings();
    settings.config = {
      ...settings.config,
      coast: "straight",
      rivers: [],
      relief: true,
      features: { walls: true, citadel: true, plaza: false, temple: false, port: true, shanty: false },
      wall: { envelope: "auto", coast: "auto", line: "auto" },
      layout: "auto"
    };
    settings.layout = "organic";
    settings.walledAreaShare = 1;
    settings.streets = { farNode: "descriptorEnd", avoidSea: true, foldSmoothing: true };
    const city = generateCityOnDocument(input, settings, "1o564jj")!;
    expect(city).not.toBeNull();
    const road = city.featureGroups.find(g => g.id === "gc:road-1");
    expect(road?.kind).toBe("road");
    if (!road) return;
    const vertices = featureGroupVertices(city, road);
    const half = city.frame.extentMeters / 2;
    const frameVertices = vertices.filter(id => city.mesh.vertices[id].point.some(v => Math.abs(v) >= half - 0.01));
    expect(frameVertices, vertices.map(id => `${id}: ${city.mesh.vertices[id].point}`).join("; ")).toHaveLength(1);
    expect(frameVertices[0]).toBe(vertices[0]);
    expect(city.gates.some(gate => gate.vertexId === vertices.at(-1))).toBe(true);
    expect(validate(city)).toEqual([]);
  });
});
