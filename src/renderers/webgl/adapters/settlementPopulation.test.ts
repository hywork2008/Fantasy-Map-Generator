import { afterEach, describe, expect, it } from "vitest";
import type { WorldContext } from "../../../context/worldContext";
import { useOptionsState } from "../../../store/optionsState";
import { buildPopulationPolygons } from "./deckDataAdapters";

function createWorld(population: number, capacity = 100): WorldContext {
  return {
    populationRate: 1,
    urbanization: 1,
    pack: {
      cells: {
        i: new Uint8Array([0]),
        h: new Uint8Array([30]),
        v: [[0, 1, 2]],
        area: new Float32Array([50]),
        pop: new Float32Array([population]),
        capacity: new Float32Array([capacity])
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
  afterEach(() => {
    useOptionsState.getState().setOption("populationColorScale", "capacity");
  });

  it("omits zero-population land (fully transparent, no gray footprint)", () => {
    const polygons = buildPopulationPolygons(createWorld(0), null);

    expect(polygons).toHaveLength(0);
  });

  it("uses the normal population palette once a settlement exists", () => {
    const polygons = buildPopulationPolygons(createWorld(50), null);

    expect(polygons).toHaveLength(1);
    expect(polygons[0]?.fillColor[3]).toBeGreaterThan(0);
  });

  it("capacity scale keeps low-occupancy cells lighter than near-full cells", () => {
    useOptionsState.getState().setOption("populationColorScale", "capacity");
    const low = buildPopulationPolygons(createWorld(10, 100), null)[0]!.fillColor;
    const high = buildPopulationPolygons(createWorld(95, 100), null)[0]!.fillColor;
    // YlOrRd moves yellow → red as occupancy rises; green falls while red stays high.
    expect(high[1]).toBeLessThan(low[1]);
  });
});
