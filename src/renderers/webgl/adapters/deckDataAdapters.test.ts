import { describe, expect, it } from "vitest";
import type { ViewContext } from "../../../context/viewContext";
import type { WorldContext } from "../../../context/worldContext";
import { useLayerState } from "../../../store/layerState";
import { buildDeckLayers } from "../buildDeckLayers";
import { buildBiomesPolygons, buildRoutePaths } from "./deckDataAdapters";

function createWorldContext(): WorldContext {
  return {
    graphWidth: 100,
    graphHeight: 100,
    biomesData: { color: ["#000000", "#55aa55"] },
    grid: { cells: { temp: new Int8Array([12]), prec: new Uint8Array([40]) } },
    pack: {
      cells: {
        i: new Uint8Array([0]),
        c: [[]],
        v: [[0, 1, 2]],
        p: [[5, 5]],
        h: new Uint8Array([30]),
        g: new Uint8Array([0]),
        biome: new Uint8Array([1]),
        culture: new Uint8Array([0]),
        religion: new Uint8Array([0]),
        state: new Uint8Array([0]),
        province: new Uint8Array([0]),
        danger: new Uint8Array([0]),
        pop: new Uint8Array([0]),
        routes: {}
      },
      vertices: {
        c: [
          [0, -1, -1],
          [0, -1, -1],
          [0, -1, -1]
        ],
        p: [
          [0, 0],
          [10, 0],
          [0, 10]
        ]
      },
      cultures: [],
      religions: [],
      states: [],
      provinces: [],
      zones: [],
      rivers: [],
      routes: [
        {
          i: 1,
          group: "roads",
          feature: 1,
          points: [
            [0, 0, 0],
            [10, 10, 0]
          ],
          cells: [0]
        }
      ]
    }
  } as unknown as WorldContext;
}

describe("deck.gl data adapters", () => {
  it("builds cell polygons without mutating world context", () => {
    const worldContext = createWorldContext();
    const originalVertices = worldContext.pack.vertices.p.map(point => [...point]);

    const polygons = buildBiomesPolygons(worldContext, null);

    expect(polygons).toHaveLength(1);
    expect(polygons[0].polygon).toEqual([
      [0, 0],
      [10, 0],
      [0, 10]
    ]);
    expect(worldContext.pack.vertices.p).toEqual(originalVertices);
  });

  it("builds route paths from route points", () => {
    const worldContext = createWorldContext();

    const paths = buildRoutePaths(worldContext, null);

    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatchObject({
      id: "route-1",
      kind: "route",
      path: [
        [0, 0],
        [10, 10]
      ]
    });
  });

  it("uses active layer state to build deck.gl layer ids", () => {
    const worldContext = createWorldContext();
    const viewContext = { focusScope: null } as ViewContext;
    useLayerState.getState().setAllActiveLayers({ toggleBiomes: true, toggleRoutes: true });

    const layers = buildDeckLayers(worldContext, viewContext).filter(Boolean);

    expect(layers.map(layer => layer.id)).toEqual(["fmg-webgl-background", "fmg-webgl-biomes", "fmg-webgl-routes"]);
  });
});
