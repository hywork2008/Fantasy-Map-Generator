import { describe, expect, it } from "vitest";
import { getCoastalHabitatCode } from "../data/coastalHabitatCatalog";
import type { PackedGraph } from "../types/PackedGraph";
import { computeShoreFishingSites, isSmallCraftOnlyLanding } from "./shoreFishing";

describe("shoreFishing", () => {
  it("lists shore activities on sandy beach without allowing formal harbor", () => {
    const sandy = getCoastalHabitatCode("sandyBeach");
    const pack = {
      cells: {
        i: new Uint16Array([0, 1]),
        h: new Uint8Array([25, 15]),
        c: [[1], [0]],
        coastalHabitat: new Uint8Array([sandy, 0]),
        nearshoreHabitat: new Uint8Array([0, 0])
      }
    } as unknown as PackedGraph;

    const sites = computeShoreFishingSites(pack);
    expect(sites).toHaveLength(1);
    expect(sites[0]!.coastalHabitatKey).toBe("sandyBeach");
    expect(sites[0]!.activities).toContain("shoreFishing");
    expect(sites[0]!.formalHarborAllowed).toBe(false);
    expect(sites[0]!.smallCraftLanding).toBe(true);
    expect(isSmallCraftOnlyLanding(pack, 0)).toBe(true);
  });
});
