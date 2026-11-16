import { describe, expect, it } from "vitest";
import goth from "../../../data/fixtures/gothengsfeld-20261012.json";
import type { BurgSiteDescriptor } from "../../../types/contracts/burgSiteDescriptor";
import { defaultGenerationSettings } from "../../generation/settings";
import { defaultPopulationSettings } from "../../populationPlan";
import { overlapsOccupiedSites } from "../occupancy";
import { validateVectorUrban } from "../validation/urban";
import { vectorInputFromEditor } from "./editorInput";
import { vectorInputFromDescriptor } from "./input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";

describe("water points by the mesh editor's rules (feature parity P7d)", () => {
  it("places a plaza basin and spaced wells on vacant ground with a walk to a street", () => {
    const d = structuredClone(goth.descriptor) as unknown as BurgSiteDescriptor,
      skeleton = generateVectorSkeleton(vectorInputFromDescriptor(d), {
        ...DEFAULT_VECTOR_GENERATION,
        seed: "p"
      }).document,
      doc = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: d.burg.population }),
      wells = doc.urban!.wells ?? [];
    expect(validateVectorUrban(doc)).toEqual([]);
    expect(wells.filter(w => w.use === "domestic").length).toBeGreaterThan(1);
    const domestic = wells.filter(w => w.placement === "neighborhood");
    for (const [i, a] of domestic.entries()) {
      expect(overlapsOccupiedSites(doc, { outer: a.footprint, holes: [] })).toBe(false);
      for (const b of domestic.slice(i + 1))
        expect(Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1])).toBeGreaterThanOrEqual(55);
    }
  });

  // A village green keeps the public basin in its middle; a larger Christian square has a market cross there instead.
  it.each([
    [600, 1],
    [3000, 0]
  ] as const)("a town of %i sets %i public basin on the civic plaza", (population, basins) => {
    const base = defaultGenerationSettings(),
      seed = "p7d-water",
      input = vectorInputFromEditor({
        settings: {
          ...base,
          population: defaultPopulationSettings(population),
          historicalPeriod: "lateMedieval" as const,
          buildingPattern: "medieval" as const
        },
        seed,
        frame: { extentMeters: 1200, cityRadiusMeters: 396, blockSizeMeters: 50 },
        lotOccupancy: 1
      }),
      doc = generateVectorUrban(
        generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, wall: "ellipse" }).document,
        { ...DEFAULT_VECTOR_URBAN, population, lotOccupancy: 1 }
      ),
      wells = doc.urban!.wells ?? [];
    expect(doc.environment?.features["feature:civic-plaza"]).toBeDefined();
    expect(wells.filter(w => w.kind === "publicBasin" && w.placement === "plaza")).toHaveLength(basins);
    expect(doc.placements["civic:plaza-furniture"]?.modelId).toBe(
      basins ? "pillory-and-stocks" : "market-cross-canopied"
    );
    expect(validateVectorUrban(doc)).toEqual([]);
  });
});
