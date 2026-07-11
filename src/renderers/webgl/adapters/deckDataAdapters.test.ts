import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewContext } from "../../../context/viewContext";
import type { WorldContext } from "../../../context/worldContext";
import { Rivers } from "../../../generators/river-generator";
import { useLayerState } from "../../../store/layerState";
import { buildDeckLayers, clearDeckLayerDataCache, getDeckLayerDataCacheSize } from "../buildDeckLayers";
import * as deckDataAdapters from "./deckDataAdapters";
import {
  buildBiomesPolygons,
  buildBorderPaths,
  buildBurgIconSymbols,
  buildCoastlinePaths,
  buildDivisionBoundaryPaths,
  buildEmblemIcons,
  buildHeightPolygons,
  buildIcePolygons,
  buildLabelSymbols,
  buildLakePolygons,
  buildLandMaskPolygons,
  buildLandPolygonsBase,
  buildMarkerSymbols,
  buildMilitaryBoxPolygons,
  buildMilitaryRegimentSymbols,
  buildRiverPolygons,
  buildRoutePaths
} from "./deckDataAdapters";

const appServices = {} as Parameters<typeof buildDeckLayers>[2];

function createWorldContext(): WorldContext {
  return {
    graphWidth: 100,
    graphHeight: 100,
    biomesData: { color: ["#000000", "#55aa55"] },
    options: {
      burgs: {
        groups: [
          { name: "town", active: true, order: 1 },
          { name: "city", active: true, order: 2 }
        ]
      },
      military: [{ name: "infantry", icon: "⚔️", type: "melee" }]
    },
    style: {
      burgIcons: {},
      anchors: {}
    },
    grid: {
      cells: {
        i: new Uint32Array([0, 1]),
        c: [[1], [0]],
        v: [
          [0, 1, 2],
          [1, 3, 2]
        ],
        b: new Uint8Array([0, 0]),
        h: new Uint8Array([45, 10]),
        t: new Uint8Array([0, 0]),
        f: new Uint8Array([0, 0]),
        temp: new Int8Array([12, 10]),
        prec: new Uint8Array([40, 20])
      },
      vertices: {
        c: [
          [0, -1, -1],
          [0, 1, -1],
          [0, 1, -1],
          [1, -1, -1]
        ],
        v: [
          [1, 2],
          [0, 3, 2],
          [0, 1, 3],
          [1, 2]
        ],
        p: [
          [0, 0],
          [10, 0],
          [0, 10],
          [10, 10]
        ]
      }
    },
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
      burgs: [],
      markers: [],
      zones: [],
      rivers: [],
      ice: [],
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
  beforeEach(() => {
    clearDeckLayerDataCache();
  });

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

  it("builds tapered river ribbons with downstream flow-based colour depth", () => {
    const worldContext = createWorldContext();
    worldContext.pack.rivers = [
      { i: 7, cells: [0, 1], widthFactor: 1, sourceWidth: 0.1 }
    ] as unknown as WorldContext["pack"]["rivers"];
    const meanderSpy = vi.spyOn(Rivers, "addMeandering").mockReturnValue([
      [0, 0, 10],
      [10, 0, 100],
      [20, 0, 400]
    ]);

    try {
      const ribbons = buildRiverPolygons(worldContext, null, [80, 140, 200, 200]);

      expect(ribbons).toHaveLength(2);
      expect(ribbons.map(ribbon => ribbon.id)).toEqual(["river-segment-0-7", "river-segment-1-7"]);
      expect(Math.abs(ribbons[0].polygon[0][1] - ribbons[0].polygon[3][1])).toBeLessThan(
        Math.abs(ribbons[1].polygon[1][1] - ribbons[1].polygon[2][1])
      );
      expect(ribbons[1].fillColor[3]).toBeGreaterThan(ribbons[0].fillColor[3]);
      expect(ribbons[1].fillColor[0]).toBeLessThan(ribbons[0].fillColor[0]);
    } finally {
      meanderSpy.mockRestore();
    }
  });

  it("normalizes SVG dash lengths for deck.gl border and route paths", () => {
    const worldContext = createWorldContext();
    worldContext.pack.cells.h[1] = 30;
    worldContext.pack.cells.state[0] = 1;
    worldContext.pack.cells.state[1] = 2;
    worldContext.pack.routes.push({
      i: 2,
      group: "trails",
      feature: 1,
      points: [
        [0, 0, 0],
        [10, 10, 0]
      ],
      cells: [0]
    });
    worldContext.pack.routes.push({
      i: 3,
      group: "searoutes",
      feature: 1,
      points: [
        [0, 0, 0],
        [10, 10, 0]
      ],
      cells: [0]
    });

    const borders = buildBorderPaths(
      worldContext,
      null,
      { state: [2, 2], province: [0, 2] },
      { state: [86, 86, 109, 204], province: [86, 86, 109, 204] }
    );
    const divisionBoundaries = buildDivisionBoundaryPaths(worldContext, null, "state", [2, 2]);
    const routes = buildRoutePaths(
      worldContext,
      null,
      { roads: [2, 2], trails: [0.8, 1.6], searoutes: [1, 2] },
      { roads: [208, 99, 36, 230], trails: [208, 99, 36, 230], searoutes: [255, 255, 255, 230] }
    );

    expect(borders).toHaveLength(1);
    expect(borders[0].dashArray).toEqual([2 / 1.1, 2 / 1.1]);
    expect(borders[0].color).toEqual([86, 86, 109, 102]);
    expect(divisionBoundaries[0].dashArray).toEqual([2 / 0.9, 2 / 0.9]);
    expect(routes.find(route => route.id === "route-1")?.dashArray).toEqual([2 / 1.1, 2 / 1.1]);
    expect(routes.find(route => route.id === "route-2")?.dashArray).toEqual([0.8 / 0.65, 1.6 / 0.65]);
    expect(routes.find(route => route.id === "route-1")?.color).toEqual([208, 99, 36, 115]);
    expect(routes.find(route => route.id === "route-3")?.color).toEqual([255, 255, 255, 77]);
  });

  it("filters land, route, and height adapters to the active focus scope", () => {
    const worldContext = createWorldContext();
    worldContext.pack.cells.h[1] = 30;
    const focusScope = {
      kind: "state",
      id: 1,
      stateId: 1,
      cellIds: new Set([0]),
      gridCellIds: new Set([0])
    } as ViewContext["focusScope"];

    expect(buildLandPolygonsBase(worldContext, focusScope).map(polygon => polygon.cellId)).toEqual([0]);
    expect(buildRoutePaths(worldContext, focusScope).map(path => path.cellId)).toEqual([0]);
    expect(buildHeightPolygons(worldContext, focusScope).map(polygon => polygon.id)).toEqual(["height-grid-cell-0"]);
  });

  it("omits removed entities from emblem, burg icon, military, and label adapters", () => {
    const worldContext = createWorldContext();
    worldContext.pack.states = [
      { i: 0, name: "Neutral", expansionism: 0, capital: 0, type: "", center: 0, culture: 0, coa: null },
      {
        i: 1,
        name: "Removed",
        expansionism: 0,
        capital: 0,
        type: "",
        center: 0,
        culture: 0,
        coa: { size: 1 },
        pole: [5, 5],
        removed: true,
        military: [
          {
            i: 0,
            name: "Removed army",
            a: 100,
            s: 1,
            t: 1,
            cell: 0,
            x: 5,
            y: 5,
            bx: 5,
            by: 5,
            u: { infantry: 100 },
            n: 0,
            type: "land",
            state: 1
          }
        ]
      }
    ] as WorldContext["pack"]["states"];
    worldContext.pack.burgs = [
      { i: 1, cell: 0, x: 5, y: 5, name: "Removed burg", coa: { size: 1 }, group: "town", removed: true }
    ];

    expect(buildEmblemIcons(worldContext, null, { state: 1, province: 1, burg: 1 }, 1, appServices)).toEqual([]);
    expect(
      buildBurgIconSymbols(worldContext, null, {
        burgIcons: { town: { fill: "#000000", opacity: 1, size: 4, icon: "#icon-circle" } },
        anchors: { town: { fill: "#ffffff", opacity: 1, size: 1, icon: "#icon-anchor" } },
        visibleGroups: new Set(["town"])
      })
    ).toEqual([]);
    expect(buildMilitaryRegimentSymbols(worldContext, null, 6)).toEqual([]);
    expect(
      buildLabelSymbols(worldContext, null, {
        state: { fill: "#000000", opacity: 1, size: 10, dx: 0, dy: 0, fontFamily: "sans-serif", haloColor: "white" },
        burgLabels: {
          town: { fill: "#000000", opacity: 1, size: 4, dx: 0, dy: 0, fontFamily: "sans-serif", haloColor: "white" }
        },
        visibleBurgGroups: new Set(["town"])
      })
    ).toEqual([]);
  });

  it("omits malformed persisted route paths instead of passing invalid coordinates to deck.gl", () => {
    const worldContext = createWorldContext();
    worldContext.pack.routes = [
      {
        i: 1,
        group: "roads",
        feature: 1,
        cells: [0],
        points: [
          [0, 0, 0],
          [10, 10, 0]
        ]
      },
      {
        i: 2,
        group: "roads",
        feature: 1,
        cells: [0],
        points: [
          [0, 0, 0],
          [Number.NaN, 10, 0]
        ] as unknown as [number, number, number][]
      },
      {
        i: 3,
        group: "roads",
        feature: 1,
        cells: [0],
        points: [[0, 0, 0], [10] as unknown as [number, number, number]]
      }
    ];

    expect(buildRoutePaths(worldContext, null).map(route => route.id)).toEqual(["route-1"]);
  });

  it("builds base land polygons separately from water cells", () => {
    const worldContext = createWorldContext();

    const polygons = buildLandPolygonsBase(worldContext, null);

    expect(polygons).toHaveLength(1);
    expect(polygons[0]).toMatchObject({ id: "land-cell-0", kind: "land", cellId: 0 });
    expect(polygons[0].fillColor).toEqual([238, 246, 251, 255]);
  });

  it("builds height polygons from grid cells using the selected terrain color scheme", () => {
    const worldContext = createWorldContext();

    const polygons = buildHeightPolygons(worldContext, null, { scheme: "bright", opacity: 0.5, includeOcean: false });

    expect(polygons).toHaveLength(1);
    expect(polygons[0]).toMatchObject({ id: "height-grid-cell-0", kind: "height", cellId: -1 });
    expect(polygons[0].polygon).toEqual([
      [0, 0],
      [10, 0],
      [0, 10]
    ]);
    expect(polygons[0].fillColor[3]).toBe(128);
  });

  it("builds lake polygons and coastline paths from packed features", () => {
    const worldContext = createWorldContext();
    worldContext.pack.features = [
      0,
      {
        i: 1,
        type: "lake",
        group: "freshwater",
        firstCell: 0,
        vertices: [0, 1, 3, 2]
      },
      {
        i: 2,
        type: "island",
        group: "sea_island",
        firstCell: 0,
        vertices: [0, 1, 3, 2]
      }
    ] as never;

    const lakes = buildLakePolygons(worldContext, null, appServices, () => [10, 20, 30, 128]);
    const coastline = buildCoastlinePaths(
      worldContext,
      null,
      appServices,
      () => [1, 2, 3, 255],
      () => 0.5
    );

    expect(lakes).toHaveLength(1);
    expect(lakes[0]).toMatchObject({ id: "lake-1", kind: "lake", cellId: 0, group: "freshwater" });
    expect(lakes[0].fillColor).toEqual([10, 20, 30, 128]);
    expect(coastline).toHaveLength(1);
    expect(coastline[0]).toMatchObject({ id: "coastline-2", kind: "coastline", cellId: 0, width: 0.5 });
  });

  it("builds ice polygons with offsets and grid-cell focus filtering", () => {
    const worldContext = createWorldContext();
    worldContext.pack.ice = [
      {
        i: 1,
        type: "glacier",
        points: [
          [0, 0],
          [10, 0],
          [0, 10]
        ],
        offset: [2, 3]
      },
      {
        i: 2,
        type: "iceberg",
        cellId: 0,
        size: 5,
        points: [
          [20, 20],
          [30, 20],
          [20, 30]
        ]
      },
      {
        i: 3,
        type: "iceberg",
        cellId: 1,
        size: 5,
        points: [
          [40, 40],
          [50, 40],
          [40, 50]
        ]
      }
    ];
    const focusScope = {
      kind: "state",
      id: 1,
      stateId: 1,
      cellIds: new Set([0]),
      gridCellIds: new Set([0])
    } as ViewContext["focusScope"];

    const ice = buildIcePolygons(worldContext, focusScope, [1, 2, 3, 200], [4, 5, 6, 200], 0.5);

    expect(ice).toHaveLength(2);
    expect(ice[0]).toMatchObject({ id: "glacier-1", kind: "ice", cellId: null, iceType: "glacier" });
    expect(ice[0].polygon).toEqual([
      [2, 3],
      [12, 3],
      [2, 13]
    ]);
    expect(ice[1]).toMatchObject({ id: "iceberg-2", kind: "ice", cellId: 0, iceType: "iceberg" });
  });

  it("builds emblem icons for states, provinces, and burgs", () => {
    const worldContext = createWorldContext();
    worldContext.pack.cells.state[0] = 1;
    worldContext.pack.states = [
      { i: 0, name: "Neutral", expansionism: 0, capital: 0, type: "", center: 0, culture: 0, coa: null },
      {
        i: 1,
        name: "North",
        expansionism: 0,
        capital: 1,
        type: "",
        center: 0,
        culture: 0,
        color: "#ff0000",
        coa: { size: 1 }
      }
    ];
    worldContext.pack.provinces = [
      {
        i: 1,
        state: 1,
        center: 0,
        burg: 1,
        name: "Northland",
        formName: "Province",
        fullName: "Northland Province",
        color: "#00ff00",
        coa: { size: 1 }
      }
    ];
    worldContext.pack.burgs = [
      {
        i: 1,
        cell: 0,
        state: 1,
        x: 5,
        y: 5,
        name: "Northburg",
        coa: { size: 1 }
      }
    ];

    const emblems = buildEmblemIcons(worldContext, null, { state: 1, province: 1, burg: 1 }, 0.9, appServices);

    expect(emblems.map(emblem => emblem.id)).toEqual(["burg-1", "province-1", "state-1"]);
    expect(emblems.every(emblem => emblem.kind === "emblem")).toBe(true);
    expect(emblems.every(emblem => emblem.size > 0)).toBe(true);
  });

  it("builds burg and anchor icon symbols from burg groups", () => {
    const worldContext = createWorldContext();
    worldContext.pack.burgs = [
      { i: 1, cell: 0, x: 5, y: 5, name: "Portburg", group: "city", port: 1 },
      { i: 2, cell: 1, x: 8, y: 5, name: "Waterburg", group: "town" }
    ];

    const icons = buildBurgIconSymbols(worldContext, null, {
      burgIcons: {
        city: { fill: "#111111", opacity: 1, size: 5, icon: "#icon-circle" },
        town: { fill: "#222222", opacity: 0.8, size: 4, icon: "#icon-circle" }
      },
      anchors: {
        city: { fill: "#ffffff", opacity: 0.9, size: 1.5, icon: "#icon-anchor" },
        town: { fill: "#ffffff", opacity: 0.9, size: 1, icon: "#icon-anchor" }
      },
      visibleGroups: new Set(["city", "town"])
    });

    expect(icons.map(icon => icon.id)).toEqual(["burg-1", "anchor-1", "burg-2"]);
    expect(icons[0]).toMatchObject({ kind: "burgIcon", type: "burg", burgId: 1, cellId: 0, group: "city" });
    expect(icons[1]).toMatchObject({ kind: "burgIcon", type: "anchor", burgId: 1, cellId: 0, group: "city" });
    expect(icons[0].color).toEqual([17, 17, 17, 255]);
    expect(icons[1].size).toBe(1.5);
  });

  it("builds marker symbols with pinned filtering and rescaled size", () => {
    const worldContext = createWorldContext();
    worldContext.pack.markers = [
      {
        i: 1,
        type: "volcano",
        icon: "🌋",
        cell: 0,
        x: 5,
        y: 5,
        size: 30,
        pinned: true,
        fill: "#ffffff",
        stroke: "#000000"
      },
      { i: 2, type: "cave", icon: "○", cell: 0, x: 6, y: 6, pinned: false }
    ];

    const markers = buildMarkerSymbols(worldContext, null, { pinnedOnly: true, rescale: true, scale: 2 });

    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({
      id: "marker-1",
      kind: "marker",
      markerId: 1,
      cellId: 0,
      icon: "🌋",
      size: 18
    });
  });

  it("builds military regiment symbols and box polygons", () => {
    const worldContext = createWorldContext();
    worldContext.pack.states = [
      { i: 0, name: "Neutral", expansionism: 0, capital: 0, type: "", center: 0, culture: 0, coa: null },
      {
        i: 1,
        name: "North",
        expansionism: 0,
        capital: 0,
        type: "",
        center: 0,
        culture: 0,
        coa: null,
        color: "#ff0000",
        military: [
          {
            i: 0,
            name: "1st Army",
            a: 1200,
            s: 1,
            t: 1,
            cell: 0,
            x: 5,
            y: 5,
            bx: 5,
            by: 5,
            u: { infantry: 1200 },
            n: 0,
            type: "land",
            state: 1
          }
        ]
      }
    ];

    const regiments = buildMilitaryRegimentSymbols(worldContext, null, 6);
    const boxes = buildMilitaryBoxPolygons(worldContext, null, 6);

    expect(regiments).toHaveLength(1);
    expect(regiments[0]).toMatchObject({
      id: "regiment-1-0",
      kind: "military",
      regimentId: 0,
      stateId: 1,
      cellId: 0,
      total: "1200",
      unitIcon: "⚔️"
    });
    expect(boxes).toHaveLength(3);
    expect(boxes.map(box => box.part)).toEqual(["main", "unit", "action"]);
    expect(boxes[0]).toMatchObject({ id: "regiment-1-0-main", kind: "military", stateId: 1 });
  });

  it("builds state and burg label symbols", () => {
    const worldContext = createWorldContext();
    worldContext.pack.states = [
      { i: 0, name: "Neutral", expansionism: 0, capital: 0, type: "", center: 0, culture: 0, coa: null },
      {
        i: 1,
        name: "North",
        fullName: "Kingdom of North",
        expansionism: 0,
        capital: 0,
        type: "",
        center: 0,
        culture: 0,
        coa: null,
        pole: [5, 5]
      }
    ];
    worldContext.pack.burgs = [{ i: 1, cell: 0, x: 6, y: 6, name: "Northburg", group: "town" }];

    const labels = buildLabelSymbols(worldContext, null, {
      state: { fill: "#111111", opacity: 1, size: 20, dx: 0, dy: 0, fontFamily: "Almendra SC", haloColor: "white" },
      burgLabels: {
        town: { fill: "#222222", opacity: 0.9, size: 4, dx: 1, dy: -0.5, fontFamily: "Almendra SC", haloColor: "white" }
      },
      visibleBurgGroups: new Set(["town"])
    });

    expect(labels.map(label => label.id)).toEqual(["state-label-1", "burg-label-1"]);
    expect(labels[0]).toMatchObject({ kind: "label", type: "state", itemId: 1, text: "North" });
    expect(labels[1]).toMatchObject({ kind: "label", type: "burg", itemId: 1, text: "Northburg" });
    expect(labels[1].position).toEqual([10, 4]);
    expect(labels[1].angle).toBe(0);
  });

  it("approximates a state label's rotation from its cells' principal axis", () => {
    const labelStyleOptions = {
      state: { fill: "#111111", opacity: 1, size: 20, dx: 0, dy: 0, fontFamily: "Almendra SC", haloColor: "white" },
      burgLabels: {},
      visibleBurgGroups: new Set<string>()
    };

    function angleForCellPoints(points: [number, number][]): number {
      const worldContext = createWorldContext();
      worldContext.pack.cells.state = new Uint8Array(points.map(() => 1));
      worldContext.pack.cells.p = points;
      worldContext.pack.states = [
        { i: 0, name: "Neutral", expansionism: 0, capital: 0, type: "", center: 0, culture: 0, coa: null },
        { i: 1, name: "North", expansionism: 0, capital: 0, type: "", center: 0, culture: 0, coa: null, pole: [1, 1] }
      ];
      const [label] = buildLabelSymbols(worldContext, null, labelStyleOptions);
      return label.angle;
    }

    // A diagonal spread of cells has its principal axis at ~45°.
    expect(
      angleForCellPoints([
        [0, 0],
        [1, 1],
        [2, 2],
        [3, 3]
      ])
    ).toBeCloseTo(45, 5);

    // A horizontal spread has its principal axis at 0°.
    expect(
      angleForCellPoints([
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0]
      ])
    ).toBeCloseTo(0, 5);

    // Fewer than 2 cells can't define an axis — falls back to unrotated.
    expect(angleForCellPoints([[0, 0]])).toBe(0);
  });

  it("uses active layer state to build deck.gl layer ids in draw order", () => {
    const worldContext = createWorldContext();
    const viewContext = { focusScope: null } as ViewContext;
    useLayerState.getState().setAllActiveLayers({ toggleBiomes: true, toggleRoutes: true });

    const layers = buildDeckLayers(worldContext, viewContext, appServices).filter(Boolean);

    expect(layers.map(layer => layer.id)).toEqual([
      "fmg-webgl-background",
      "fmg-webgl-land",
      "fmg-webgl-biomes",
      "fmg-webgl-routes",
      "fmg-webgl-coastline"
    ]);
    expect(layers.every(layer => layer.props.visible !== false)).toBe(true);
  });

  it("omits inactive migrated layers from deck.gl layer list", () => {
    const worldContext = createWorldContext();
    const viewContext = { focusScope: null } as ViewContext;
    useLayerState.getState().setAllActiveLayers({ toggleBiomes: false, toggleRoutes: true, toggleStates: false });

    const layers = buildDeckLayers(worldContext, viewContext, appServices).filter(Boolean);

    expect(layers.map(layer => layer.id)).toEqual([
      "fmg-webgl-background",
      "fmg-webgl-land",
      "fmg-webgl-routes",
      "fmg-webgl-coastline"
    ]);
  });

  it("clips land-derived WebGL fills and rivers with the fractalized island mask", () => {
    const worldContext = createWorldContext();
    worldContext.pack.features = [
      {
        i: 1,
        type: "island",
        group: "sea_island",
        firstCell: 0,
        vertices: [0, 1, 2]
      }
    ] as unknown as WorldContext["pack"]["features"];
    const viewContext = { focusScope: null } as ViewContext;
    useLayerState.getState().setAllActiveLayers({ toggleStates: true, toggleRivers: true });

    const layers = buildDeckLayers(worldContext, viewContext, appServices).filter(Boolean);
    const maskLayer = layers.find(layer => layer.id === "fmg-webgl-land-mask");
    const statesLayer = layers.find(layer => layer.id === "fmg-webgl-states");
    const riversLayer = layers.find(layer => layer.id === "fmg-webgl-rivers");

    expect(maskLayer?.props.operation).toBe("mask");
    expect((statesLayer?.props as { maskId?: string } | undefined)?.maskId).toBe("fmg-webgl-land-mask");
    expect((riversLayer?.props as { maskId?: string } | undefined)?.maskId).toBe("fmg-webgl-land-mask");
  });

  it("cuts lake holes out of the WebGL land mask", () => {
    const worldContext = createWorldContext();
    worldContext.pack.vertices.p = [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
      [5, 5],
      [10, 5],
      [5, 10]
    ];
    worldContext.pack.features = [
      {
        i: 1,
        type: "island",
        group: "sea_island",
        firstCell: 0,
        vertices: [0, 1, 2, 3]
      },
      {
        i: 2,
        type: "lake",
        group: "freshwater",
        firstCell: 0,
        vertices: [4, 5, 6]
      }
    ] as unknown as WorldContext["pack"]["features"];

    const [mask] = buildLandMaskPolygons(worldContext, null, appServices);

    expect(mask.polygon).toHaveLength(2);
    expect(mask.polygon[0].length).toBeGreaterThanOrEqual(3);
    expect(mask.polygon[1].length).toBeGreaterThanOrEqual(3);
  });

  it("adds active ice as a deck.gl polygon layer", () => {
    const worldContext = createWorldContext();
    worldContext.pack.ice = [
      {
        i: 1,
        type: "iceberg",
        cellId: 0,
        size: 5,
        points: [
          [0, 0],
          [10, 0],
          [0, 10]
        ]
      }
    ];
    const viewContext = { focusScope: null } as ViewContext;
    useLayerState.getState().setAllActiveLayers({ toggleIce: true });

    const layers = buildDeckLayers(worldContext, viewContext, appServices).filter(Boolean);

    expect(layers.map(layer => layer.id)).toEqual([
      "fmg-webgl-background",
      "fmg-webgl-land",
      "fmg-webgl-ice",
      "fmg-webgl-coastline"
    ]);
    expect(layers.find(layer => layer.id === "fmg-webgl-ice")?.props.data).toHaveLength(1);
  });

  it("adds active emblems as a deck.gl icon layer", () => {
    const worldContext = createWorldContext();
    worldContext.pack.states = [
      { i: 0, name: "Neutral", expansionism: 0, capital: 0, type: "", center: 0, culture: 0, coa: null },
      {
        i: 1,
        name: "North",
        expansionism: 0,
        capital: 1,
        type: "",
        center: 0,
        culture: 0,
        color: "#ff0000",
        coa: { size: 1 }
      }
    ];
    const viewContext = { focusScope: null } as ViewContext;
    useLayerState.getState().setAllActiveLayers({ toggleEmblems: true });

    const layers = buildDeckLayers(worldContext, viewContext, appServices).filter(Boolean);

    expect(layers.map(layer => layer.id)).toEqual([
      "fmg-webgl-background",
      "fmg-webgl-land",
      "fmg-webgl-emblems",
      "fmg-webgl-coastline"
    ]);
    expect(layers.find(layer => layer.id === "fmg-webgl-emblems")?.props.data).toHaveLength(1);
  });

  it("adds active burg icons as a deck.gl icon layer", () => {
    const worldContext = createWorldContext();
    worldContext.pack.burgs = [{ i: 1, cell: 0, x: 5, y: 5, name: "Northburg", group: "town", port: 1 }];
    const viewContext = { focusScope: null } as ViewContext;
    useLayerState.getState().setAllActiveLayers({ toggleBurgIcons: true });

    const layers = buildDeckLayers(worldContext, viewContext, appServices).filter(Boolean);

    expect(layers.map(layer => layer.id)).toEqual([
      "fmg-webgl-background",
      "fmg-webgl-land",
      "fmg-webgl-burg-icons",
      "fmg-webgl-coastline"
    ]);
    expect(layers.find(layer => layer.id === "fmg-webgl-burg-icons")?.props.data).toHaveLength(2);
  });

  it("adds active markers as deck.gl pin and icon layers", () => {
    const worldContext = createWorldContext();
    worldContext.pack.markers = [{ i: 1, type: "volcano", icon: "🌋", cell: 0, x: 5, y: 5 }];
    const viewContext = {
      focusScope: null,
      scale: 1,
      markers: {
        attr: (name: string) => (name === "rescale" ? "1" : null)
      }
    } as ViewContext;
    useLayerState.getState().setAllActiveLayers({ toggleMarkers: true });

    const layers = buildDeckLayers(worldContext, viewContext, appServices).filter(Boolean);

    expect(layers.map(layer => layer.id)).toEqual([
      "fmg-webgl-background",
      "fmg-webgl-land",
      "fmg-webgl-markers",
      "fmg-webgl-marker-icons",
      "fmg-webgl-marker-images",
      "fmg-webgl-coastline"
    ]);
    expect(layers.find(layer => layer.id === "fmg-webgl-markers")?.props.data).toHaveLength(1);
    expect(layers.find(layer => layer.id === "fmg-webgl-marker-icons")?.props.data).toHaveLength(1);
  });

  it("adds active military as deck.gl box and text layers", () => {
    const worldContext = createWorldContext();
    worldContext.pack.states = [
      { i: 0, name: "Neutral", expansionism: 0, capital: 0, type: "", center: 0, culture: 0, coa: null },
      {
        i: 1,
        name: "North",
        expansionism: 0,
        capital: 0,
        type: "",
        center: 0,
        culture: 0,
        coa: null,
        color: "#ff0000",
        military: [
          {
            i: 0,
            name: "1st Army",
            a: 1200,
            s: 1,
            t: 1,
            cell: 0,
            x: 5,
            y: 5,
            bx: 5,
            by: 5,
            u: { infantry: 1200 },
            n: 0,
            type: "land",
            state: 1
          }
        ]
      }
    ];
    const viewContext = {
      focusScope: null,
      armies: {
        attr: (name: string) => (name === "box-size" ? "6" : null)
      }
    } as ViewContext;
    useLayerState.getState().setAllActiveLayers({ toggleMilitary: true });

    const layers = buildDeckLayers(worldContext, viewContext, appServices).filter(Boolean);

    expect(layers.map(layer => layer.id)).toEqual([
      "fmg-webgl-background",
      "fmg-webgl-land",
      "fmg-webgl-military",
      "fmg-webgl-military-totals",
      "fmg-webgl-military-icons",
      "fmg-webgl-military-images",
      "fmg-webgl-military-actions",
      "fmg-webgl-coastline"
    ]);
    expect(layers.find(layer => layer.id === "fmg-webgl-military")?.props.data).toHaveLength(3);
    expect(layers.find(layer => layer.id === "fmg-webgl-military-totals")?.props.data).toHaveLength(1);
  });

  it("adds active labels as a deck.gl text layer above map features", () => {
    const worldContext = createWorldContext();
    worldContext.pack.states = [
      { i: 0, name: "Neutral", expansionism: 0, capital: 0, type: "", center: 0, culture: 0, coa: null },
      {
        i: 1,
        name: "North",
        expansionism: 0,
        capital: 0,
        type: "",
        center: 0,
        culture: 0,
        coa: null,
        pole: [5, 5]
      }
    ];
    const viewContext = {
      focusScope: null,
      labels: {
        select: () => ({
          empty: () => true,
          attr: () => null,
          style: () => ""
        })
      }
    } as unknown as ViewContext;
    useLayerState.getState().setAllActiveLayers({ toggleLabels: true });

    const layers = buildDeckLayers(worldContext, viewContext, appServices).filter(Boolean);

    expect(layers.map(layer => layer.id)).toEqual([
      "fmg-webgl-background",
      "fmg-webgl-land",
      "fmg-webgl-coastline",
      "fmg-webgl-labels"
    ]);
    expect(layers.find(layer => layer.id === "fmg-webgl-labels")?.props.data).toHaveLength(1);
  });

  it("adds visual boundary paths next to migrated division fills", () => {
    const worldContext = createWorldContext();
    worldContext.pack.cells.h[1] = 30;
    worldContext.pack.cells.state[0] = 1;
    worldContext.pack.cells.state[1] = 2;
    worldContext.pack.states = [
      { i: 0, name: "Neutral", expansionism: 0, capital: 0, type: "", center: 0, culture: 0, coa: null },
      {
        i: 1,
        name: "North",
        expansionism: 0,
        capital: 0,
        type: "",
        center: 0,
        culture: 0,
        coa: null,
        color: "#ff0000"
      },
      { i: 2, name: "South", expansionism: 0, capital: 0, type: "", center: 1, culture: 0, coa: null, color: "#00ff00" }
    ];
    const viewContext = { focusScope: null } as ViewContext;
    useLayerState.getState().setAllActiveLayers({ toggleStates: true });

    const layers = buildDeckLayers(worldContext, viewContext, appServices).filter(Boolean);

    expect(layers.map(layer => layer.id)).toEqual([
      "fmg-webgl-background",
      "fmg-webgl-land",
      "fmg-webgl-states",
      "fmg-webgl-states-boundaries",
      "fmg-webgl-coastline"
    ]);
    expect(layers.find(layer => layer.id === "fmg-webgl-states-boundaries")?.props.pickable).toBe(false);
    expect(layers.find(layer => layer.id === "fmg-webgl-states-boundaries")?.props.data).toHaveLength(1);
  });

  it("reuses cached deck.gl data while the layer signature is stable", () => {
    const worldContext = createWorldContext();
    const viewContext = { focusScope: null } as ViewContext;
    useLayerState.getState().setAllActiveLayers({ toggleBiomes: true });

    const firstLayers = buildDeckLayers(worldContext, viewContext, appServices).filter(Boolean);
    const secondLayers = buildDeckLayers(worldContext, viewContext, appServices).filter(Boolean);

    expect(getDeckLayerDataCacheSize()).toBeGreaterThan(0);
    expect(secondLayers.find(layer => layer.id === "fmg-webgl-biomes")?.props.data).toBe(
      firstLayers.find(layer => layer.id === "fmg-webgl-biomes")?.props.data
    );
  });

  it("computes shared land-cell geometry once for multiple simultaneously active land-based overlays", () => {
    const worldContext = createWorldContext();
    worldContext.pack.cells.h[1] = 30;
    worldContext.pack.cells.state[0] = 1;
    worldContext.pack.cells.state[1] = 2;
    worldContext.pack.states = [
      { i: 0, name: "Neutral", expansionism: 0, capital: 0, type: "", center: 0, culture: 0, coa: null },
      {
        i: 1,
        name: "North",
        expansionism: 0,
        capital: 0,
        type: "",
        center: 0,
        culture: 0,
        coa: null,
        color: "#ff0000"
      },
      { i: 2, name: "South", expansionism: 0, capital: 0, type: "", center: 1, culture: 0, coa: null, color: "#00ff00" }
    ] as WorldContext["pack"]["states"];
    worldContext.pack.provinces = [
      { i: 0, name: "None", state: 0, center: 0, burg: 0, formName: "", color: "" },
      { i: 1, name: "Provincia", state: 1, center: 0, burg: 0, formName: "", color: "#0000ff" }
    ] as WorldContext["pack"]["provinces"];
    worldContext.pack.cells.province[0] = 1;
    const viewContext = { focusScope: null } as ViewContext;
    useLayerState.getState().setAllActiveLayers({ toggleStates: true, toggleProvinces: true, toggleBiomes: true });
    const geometrySpy = vi.spyOn(deckDataAdapters, "buildLandCellGeometry");

    const layers = buildDeckLayers(worldContext, viewContext, appServices).filter(Boolean);

    expect(geometrySpy).toHaveBeenCalledTimes(1);
    expect(layers.find(layer => layer.id === "fmg-webgl-states")?.props.data).toHaveLength(2);
    expect(layers.find(layer => layer.id === "fmg-webgl-provinces")?.props.data).toHaveLength(2);
    expect(layers.find(layer => layer.id === "fmg-webgl-biomes")?.props.data).toHaveLength(2);
    geometrySpy.mockRestore();
  });

  it("keeps deck.gl layer ids and cached data references stable when an unrelated layer is toggled", () => {
    const worldContext = createWorldContext();
    const viewContext = { focusScope: null } as ViewContext;
    useLayerState.getState().setAllActiveLayers({ toggleBiomes: true });

    const firstLayers = buildDeckLayers(worldContext, viewContext, appServices).filter(Boolean);
    const firstIds = firstLayers.map(layer => layer.id);
    const firstBiomeData = firstLayers.find(layer => layer.id === "fmg-webgl-biomes")?.props.data;

    useLayerState.getState().setAllActiveLayers({ toggleBiomes: true, toggleGrid: true });
    const secondLayers = buildDeckLayers(worldContext, viewContext, appServices).filter(Boolean);
    const secondIds = secondLayers.map(layer => layer.id);
    const secondBiomeData = secondLayers.find(layer => layer.id === "fmg-webgl-biomes")?.props.data;

    expect(secondIds).toEqual(expect.arrayContaining(firstIds));
    expect(secondBiomeData).toBe(firstBiomeData);
  });

  it("invalidates cached deck.gl data after in-place world data changes", () => {
    const worldContext = createWorldContext();
    const viewContext = { focusScope: null } as ViewContext;
    useLayerState.getState().setAllActiveLayers({ toggleBiomes: true });

    const firstLayers = buildDeckLayers(worldContext, viewContext, appServices).filter(Boolean);
    const firstBiomeData = firstLayers.find(layer => layer.id === "fmg-webgl-biomes")?.props.data;
    worldContext.biomesData.color[1] = "#336699";
    const secondLayers = buildDeckLayers(worldContext, viewContext, appServices).filter(Boolean);
    const secondBiomeData = secondLayers.find(layer => layer.id === "fmg-webgl-biomes")?.props.data;

    expect(secondBiomeData).not.toBe(firstBiomeData);
    expect(secondBiomeData?.[0].fillColor).toEqual([51, 102, 153, 128]);
  });
});
