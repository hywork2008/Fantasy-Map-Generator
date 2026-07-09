import { describe, expect, it } from "vitest";
import type { ViewContext } from "../../../context/viewContext";
import type { WorldContext } from "../../../context/worldContext";
import { useLayerState } from "../../../store/layerState";
import { buildDeckLayers } from "../buildDeckLayers";
import { buildBiomesPolygons, buildLandPolygonsBase, buildRoutePaths } from "./deckDataAdapters";

function createWorldContext(): WorldContext {
  return {
    graphWidth: 100,
    graphHeight: 100,
    biomesData: { color: ["#000000", "#55aa55"] },
    grid: { cells: { temp: new Int8Array([12]), prec: new Uint8Array([40]) } },
    pack: {
      cells: {
        i: new Uint8Array([0, 1]),
        c: [[1], [0]],
        v: [
          [0, 1, 2],
          [1, 3, 2]
        ],
        p: [
          [5, 5],
          [8, 5]
        ],
        h: new Uint8Array([30, 10]),
        g: new Uint8Array([0, 0]),
        biome: new Uint8Array([1, 0]),
        culture: new Uint8Array([0, 0]),
        religion: new Uint8Array([0, 0]),
        state: new Uint8Array([0, 0]),
        province: new Uint8Array([0, 0]),
        danger: new Uint8Array([0, 0]),
        pop: new Uint8Array([0, 0]),
        routes: {}
      },
      vertices: {
        c: [
          [0, -1, -1],
          [0, 1, -1],
          [0, 1, -1],
          [1, -1, -1]
        ],
        p: [
          [0, 0],
          [10, 0],
          [0, 10],
          [10, 10]
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
    expect(polygons[0]).toMatchObject({ id: "biome-cell-0", kind: "biome", cellId: 0 });
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
      cellId: 0,
      path: [
        [0, 0],
        [10, 10]
      ]
    });
  });

  it("builds base land polygons separately from water cells", () => {
    const worldContext = createWorldContext();

    const polygons = buildLandPolygonsBase(worldContext, null);

    expect(polygons).toHaveLength(1);
    expect(polygons[0]).toMatchObject({ id: "land-cell-0", kind: "land", cellId: 0 });
    expect(polygons[0].fillColor).toEqual([238, 246, 251, 255]);
  });

  it("uses active layer state to build deck.gl layer ids in draw order", () => {
    const worldContext = createWorldContext();
    const viewContext = { focusScope: null } as ViewContext;
    useLayerState.getState().setAllActiveLayers({ toggleBiomes: true, toggleRoutes: true });

    const layers = buildDeckLayers(worldContext, viewContext).filter(Boolean);

    expect(layers.map(layer => layer.id)).toEqual([
      "fmg-webgl-background",
      "fmg-webgl-land",
      "fmg-webgl-biomes",
      "fmg-webgl-routes"
    ]);
    expect(layers.every(layer => layer.props.visible !== false)).toBe(true);
  });

  it("omits inactive migrated layers from deck.gl layer list", () => {
    const worldContext = createWorldContext();
    const viewContext = { focusScope: null } as ViewContext;
    useLayerState.getState().setAllActiveLayers({ toggleBiomes: false, toggleRoutes: true, toggleStates: false });

    const layers = buildDeckLayers(worldContext, viewContext).filter(Boolean);

    expect(layers.map(layer => layer.id)).toEqual(["fmg-webgl-background", "fmg-webgl-land", "fmg-webgl-routes"]);
  });
});
