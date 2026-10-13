import { afterEach, describe, expect, it, vi } from "vitest";
import { createGridDocument } from "../../core/document";
import { clone } from "../../core/mesh";
import * as pipeline from "./pipeline";
import { clearGenerationPreviewCache, generateWardStep } from "./previews";
import { defaultGenerationSettings } from "./settings";

function request() {
  const document = createGridDocument({ size: "small", grid: "voronoi", seed: "preview-owner-grid" });
  const settings = defaultGenerationSettings();
  settings.config = {
    ...settings.config,
    coast: "none",
    rivers: [],
    features: { walls: false, citadel: false, plaza: true, temple: false, port: false, shanty: false }
  };
  return { document, settings, seed: "preview-owner" };
}
afterEach(() => {
  clearGenerationPreviewCache();
  vi.restoreAllMocks();
});

describe("ward preview ownership", () => {
  it("reuses repaired topology for scrubbing and equivalent sources, while returned documents are independent", () => {
    const { document, settings, seed } = request();
    const before = clone(document);
    const planning = vi.spyOn(pipeline, "runPlan");
    const first = generateWardStep(document, settings, seed, 0);
    expect(first.document).not.toBeNull();
    const last = generateWardStep(document, settings, seed, first.total - 1);
    expect(last.document?.mesh.vertices).toEqual(first.document?.mesh.vertices);
    expect(last.document?.mesh.edges).toEqual(first.document?.mesh.edges);
    expect(Object.values(last.document!.mesh.faces).map(face => face.boundary)).toEqual(
      Object.values(first.document!.mesh.faces).map(face => face.boundary)
    );
    expect(last.document?.featureGroups).toEqual(first.document?.featureGroups);
    first.document!.featureGroups.length = 0;
    first.document!.mesh.vertices[Object.keys(first.document!.mesh.vertices)[0]].point[0] += 100;
    const repeated = generateWardStep(clone(document), settings, seed, last.index);
    expect(repeated).toEqual(last);
    expect(planning).toHaveBeenCalledTimes(1);
    expect(document).toEqual(before);
  });

  it("invalidates on in-place source/settings edits and releases the cached result explicitly", () => {
    const { document, settings, seed } = request();
    const planning = vi.spyOn(pipeline, "runPlan");
    generateWardStep(document, settings, seed, 0);
    Object.values(document.mesh.faces)[0].properties.elevation += 10;
    generateWardStep(document, settings, seed, 0);
    settings.historicalPeriod = "earlyMedieval";
    const edited = generateWardStep(document, settings, seed, 0);
    expect(planning).toHaveBeenCalledTimes(3);
    clearGenerationPreviewCache();
    expect(generateWardStep(document, settings, seed, 0)).toEqual(edited);
    expect(planning).toHaveBeenCalledTimes(4);
  });
});
