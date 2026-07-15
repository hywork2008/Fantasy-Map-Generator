import { describe, expect, it } from "vitest";
import { getHeightmapTemplateWeights, heightmapLandmassThresholds, heightmapTemplates } from "./heightmap-templates";

describe("getHeightmapTemplateWeights", () => {
  it("keeps every template in the unrestricted random pool", () => {
    expect(Object.keys(getHeightmapTemplateWeights("all"))).toEqual(Object.keys(heightmapTemplates));
  });

  it("keeps only templates whose mean land coverage is at least the land-rich boundary", () => {
    const ids = Object.keys(getHeightmapTemplateWeights("landRich"));

    expect(ids).not.toHaveLength(0);
    expect(
      ids.every(id => heightmapTemplates[id].averageLandPercentage >= heightmapLandmassThresholds.landRichMinimum)
    ).toBe(true);
  });

  it("keeps only templates whose mean ocean coverage is at least the ocean-rich boundary", () => {
    const ids = Object.keys(getHeightmapTemplateWeights("oceanRich"));

    expect(ids).not.toHaveLength(0);
    expect(
      ids.every(id => heightmapTemplates[id].averageLandPercentage <= heightmapLandmassThresholds.oceanRichMaximum)
    ).toBe(true);
  });
});
