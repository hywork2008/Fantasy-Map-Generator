import { describe, expect, it } from "vitest";
import { createDefaultBiomesData, getBiomeCode } from "../data/biomeCatalog";
import { forestConditionKey, landCoverKey } from "../types/biomeAttributes";
import type { PackedGraph } from "../types/PackedGraph";
import { initializeBiomeAttributes } from "./biomeAttributes";

describe("initializeBiomeAttributes", () => {
  it("seeds forest cover and naturalForest land cover on forest biomes only", () => {
    const biomesData = createDefaultBiomesData();
    const forest = getBiomeCode(biomesData, "centralEuropeanGreatForest")!;
    const grass = getBiomeCode(biomesData, "grassland")!;
    const pack = {
      cells: {
        i: new Uint16Array([0, 1]),
        biomeCode: new Uint8Array([forest, grass])
      }
    } as unknown as PackedGraph;

    initializeBiomeAttributes(pack, biomesData);

    expect(pack.cells.forestCover![0]).toBeGreaterThan(0.8);
    expect(forestConditionKey(pack.cells.forestCondition![0]!)).toBe("ancient");
    expect(landCoverKey(pack.cells.landCover![0]!)).toBe("naturalForest");
    expect(pack.cells.forestCover![1]).toBe(0);
    expect(pack.cells.specialFeature![0]).toBe(0); // never invent fantasy specials
  });
});
