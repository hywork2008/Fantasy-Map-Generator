import { describe, expect, it } from "vitest";
import type { WorldContext } from "../../../context/worldContext";
import { buildPopulationPolygons } from "./deckDataAdapters";

function createWorld(population: number): WorldContext {
  return {
    populationRate: 1,
    urbanization: 1,
    pack: {
      cells: {
        i: new Uint8Array([0]),
        h: new Uint8Array([30]),
        v: [[0, 1, 2]],
        area: new Float32Array([50]),
        pop: new Float32Array([population])
      },
      vertices: {
        p: [
          [0, 0],
          [10, 0],
          [0, 10]
        ]
      },
      burgs: []
    }
  } as unknown as WorldContext;
}

describe("settlement population WebGL projection", () => {
  it("retains a subdued polygon for suitable land with no settlement", () => {
    const polygons = buildPopulationPolygons(createWorld(0), null);

    expect(polygons).toHaveLength(1);
    expect(polygons[0]?.fillColor).toEqual([92, 88, 112, 40]);
  });

  it("uses the normal population palette once a settlement exists", () => {
    const polygons = buildPopulationPolygons(createWorld(50), null);

    expect(polygons).toHaveLength(1);
    expect(polygons[0]?.fillColor[3]).toBeGreaterThan(40);
  });
});
