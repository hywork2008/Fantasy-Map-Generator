import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../context/worldContext";
import { generateFromFmgDescriptor } from "../region-editor/core/gen/pipeline";
import type { Province } from "../types/models";
import { buildRegionSiteDescriptor } from "./region-editor-handshake";

describe("buildRegionSiteDescriptor", () => {
  const originalGrid = worldContext.grid;
  const originalPopulationRate = worldContext.populationRate;
  const originalUrbanization = worldContext.urbanization;
  beforeEach(() => {
    worldContext.grid = { cells: {}, points: [] } as unknown as typeof worldContext.grid;
  });
  afterEach(() => {
    worldContext.grid = originalGrid;
    worldContext.populationRate = originalPopulationRate;
    worldContext.urbanization = originalUrbanization;
  });
  it("存在しない Province ID の場合は null を返すこと", () => {
    worldContext.pack = {
      provinces: [],
      states: [],
      cells: { i: [], p: [], c: [], h: [], r: [], province: [], state: [], biomeCode: [] },
      burgs: [],
      rivers: []
    } as any;

    expect(buildRegionSiteDescriptor(999)).toBeNull();
  });

  it("対象 Province とその周辺セルの標高データを収集し、等高線生成用パラメータとして渡すこと", () => {
    // 州1（低地セル0, 1）と州2（高山セル2, 3）を設定
    // セル0: [100, 100], h=25 (平地, 標高約40m)
    // セル1: [110, 105], h=30 (丘陵, 標高約100m)
    // セル2: [125, 105], h=80 (高山, 標高約1900m) -> 境界標高差 80-30 = 50 (急峻な崖/山脈)
    // セル3: [140, 110], h=85 (高峰)
    const province1: Province = {
      i: 1,
      name: "Valedale",
      state: 1,
      color: "#ff0000",
      burg: 0,
      center: 0
    };

    worldContext.seed = "handshake-seed-1";
    worldContext.distanceScale = 1; // 1 map unit = 1 km
    worldContext.graphWidth = 1000;
    worldContext.graphHeight = 1000;
    worldContext.options = { heightExponent: 1.8 } as any;
    worldContext.biomesData = {
      name: ["Water", "Grassland", "Forest", "Hills", "Mountains"]
    } as any;

    worldContext.pack = {
      provinces: [undefined, province1],
      states: [undefined, { i: 1, name: "Kingdom of the North" }],
      cells: {
        i: [0, 1, 2, 3],
        p: [
          [100, 100],
          [110, 105],
          [125, 105],
          [140, 110]
        ],
        c: [
          [1], // 0 の隣接は 1
          [0, 2], // 1 の隣接は 0 と 2 (2は州外の高山セル！)
          [1, 3], // 2 の隣接は 1 と 3
          [2] // 3 の隣接は 2
        ],
        h: [25, 30, 80, 85],
        province: [1, 1, 2, 2],
        state: [1, 1, 1, 1],
        biomeCode: [1, 1, 4, 4],
        r: []
      },
      burgs: [],
      rivers: []
    } as any;

    const descriptor = buildRegionSiteDescriptor(1);

    expect(descriptor).not.toBeNull();
    expect(descriptor!.provinceId).toBe(1);
    expect(descriptor!.provinceName).toBe("Valedale");

    // 境界の標高差（80 - 30 = 50）が検出されていること
    expect(descriptor!.elevationStats).toBeDefined();
    expect(descriptor!.elevationStats!.maxBorderRelief).toBe(50);
    expect(descriptor!.elevationStats!.maxElevationMeters).toBeGreaterThan(1000);

    // セル情報に Province セルだけでなく、周辺セル（セル2など）も含まれていること
    expect(descriptor!.cells.length).toBeGreaterThan(2);

    const provCells = descriptor!.cells.filter(c => c.inProvince);
    const outerCells = descriptor!.cells.filter(c => !c.inProvince);

    expect(provCells.length).toBe(2);
    expect(outerCells.length).toBeGreaterThan(0);

    // セル2（高山セル）が周辺セルとして収集されていること
    const mountainCell = outerCells.find(c => c.point[0] === 125);
    expect(mountainCell).toBeDefined();
    expect(mountainCell!.height).toBe(80);
    expect(mountainCell!.elevationMeters).toBeGreaterThan(1000);

    // 標高差が大きいため、マージンが通常よりも大きく設定されていること
    const [minX, , maxX] = descriptor!.boundsMapUnits;
    expect(maxX - minX).toBeGreaterThanOrEqual(35);
  });

  it("FMG の都市間街道（Routes）と河川の川幅（widthsMeters）が抽出されること", () => {
    const province1: Province = {
      i: 1,
      name: "Riverland",
      state: 1,
      color: "#0000ff",
      burg: 1,
      center: 0
    };

    worldContext.seed = "handshake-seed-2";
    worldContext.distanceScale = 1; // 1 map unit = 1000m
    worldContext.graphWidth = 1000;
    worldContext.graphHeight = 1000;
    worldContext.options = { heightExponent: 1.8 } as any;
    worldContext.biomesData = {
      name: ["Water", "Grassland"]
    } as any;

    worldContext.pack = {
      provinces: [undefined, province1],
      states: [undefined, { i: 1, name: "The Kingdom" }],
      cells: {
        i: [0, 1, 2],
        p: [
          [200, 200],
          [240, 210],
          [280, 220]
        ],
        c: [[1], [0, 2], [1]],
        h: [30, 28, 25],
        fl: [100, 250, 600],
        r: [1, 1, 1],
        conf: [0, 0, 0],
        province: [1, 1, 1],
        state: [1, 1, 1],
        biomeCode: [1, 1, 1]
      },
      burgs: [
        undefined,
        {
          i: 1,
          name: "High Capital",
          x: 200,
          y: 200,
          cell: 0,
          capital: 1,
          population: 30,
          group: "capital"
        },
        {
          i: 2,
          name: "Rivertown",
          x: 280,
          y: 220,
          cell: 2,
          capital: 0,
          population: 5,
          group: "town"
        }
      ],
      rivers: [
        {
          i: 1,
          name: "Great River",
          cells: [0, 1, 2],
          points: [
            [200, 180],
            [240, 210],
            [280, 240]
          ],
          widthFactor: 1.5,
          sourceWidth: 0.2,
          discharge: 300,
          width: 8
        }
      ],
      routes: [
        // 首都と接続する幹線道路 -> highway
        {
          i: 10,
          name: "The Royal Highway",
          group: "roads",
          points: [
            [190, 195, 0],
            [200, 200, 0],
            [240, 210, 1],
            [280, 220, 2],
            [290, 225, 2]
          ]
        },
        // 小道 -> trail
        {
          i: 20,
          name: "Forest Path",
          group: "trails",
          points: [
            [210, 205, 0],
            [230, 215, 1]
          ]
        },
        // 海上航路 -> 除外されるべき
        {
          i: 30,
          name: "Sea Route",
          group: "searoutes",
          points: [
            [200, 200, 0],
            [250, 250, 1]
          ]
        }
      ]
    } as any;

    worldContext.populationRate = 1000;
    worldContext.urbanization = 2;
    worldContext.pack.cells.g = new Uint16Array(worldContext.pack.cells.i.length);
    worldContext.grid = { cells: { prec: new Uint8Array([12]) } } as typeof worldContext.grid;
    const descriptor = buildRegionSiteDescriptor(1);
    expect(descriptor).not.toBeNull();
    expect(descriptor!.cells[0].annualPrecipitationMm).toBe(1200);
    for (const burg of descriptor!.burgs) {
      expect(burg.population).toBe(worldContext.pack.burgs[burg.id].population * 2000);
    }

    // 1. 河川とその太さの検証
    expect(descriptor!.rivers.length).toBeGreaterThanOrEqual(1);
    const river = descriptor!.rivers.find(r => r.name === "Great River");
    expect(river).toBeDefined();
    expect(river!.points.length).toBeGreaterThanOrEqual(2);
    expect(river!.widthMeters).toBeGreaterThan(0);
    expect(river!.widthsMeters).toBeDefined();
    expect(river!.widthsMeters!.length).toBe(river!.points.length);
    // 上流から下流へ向かって川幅が広がる（または相応の幅を持つ）こと
    expect(river!.widthsMeters![river!.widthsMeters!.length - 1]).toBeGreaterThanOrEqual(river!.widthsMeters![0]);

    // 2. 街道の検証
    expect(descriptor!.roads.length).toBe(2); // 陸上ルート2本（海上ルートは除外）
    const highway = descriptor!.roads.find(r => r.routeId === 10);
    expect(highway).toBeDefined();
    expect(highway!.name).toBe("The Royal Highway");
    expect(highway!.type).toBe("highway");
    expect(highway!.points.length).toBeGreaterThanOrEqual(2);

    const trail = descriptor!.roads.find(r => r.routeId === 20);
    expect(trail).toBeDefined();
    expect(trail!.name).toBe("Forest Path");
    expect(trail!.type).toBe("trail");

    // 海上航路が含まれていないこと
    expect(descriptor!.roads.some(r => r.routeId === 30)).toBe(false);
  });

  it("REに受け渡されるBurg情報にsiteDescriptorが含まれ、CEに無変性で中継できること", () => {
    // 州1 と Burg 1 の設定
    const province: Province = {
      i: 1,
      name: "Coast Province",
      state: 1,
      color: "#ff0000",
      burg: 1,
      center: 0
    };

    worldContext.seed = "parity-seed-1";
    worldContext.distanceScale = 1;
    worldContext.pack = {
      provinces: [undefined, province],
      states: [undefined, { i: 1, name: "State 1" }],
      cells: {
        i: [0],
        p: [[200, 200]],
        c: [[]],
        h: [20],
        province: [1],
        state: [1],
        biomeCode: [1],
        r: []
      },
      burgs: [
        undefined,
        {
          i: 1,
          name: "Waterdeep",
          x: 200,
          y: 200,
          cell: 0,
          population: 15,
          capital: 1,
          port: 1,
          walls: 1,
          citadel: 1,
          group: "cities"
        }
      ],
      rivers: [],
      routes: []
    } as any;

    const descriptor = buildRegionSiteDescriptor(1);
    expect(descriptor).not.toBeNull();
    const burg = descriptor!.burgs.find(b => b.id === 1);
    expect(burg).toBeDefined();

    // 擬似的な完全な siteDescriptor をセットして、パイプライン経由でも変性なく維持されることを確認
    const mockFullSiteDescriptor = {
      version: 4,
      burg: { id: 1, name: "Waterdeep", seed: "test-seed" },
      roads: [
        {
          id: "r1",
          points: [
            [0, 0],
            [10, 10]
          ]
        }
      ],
      rivers: [
        {
          id: "rv1",
          points: [
            [5, 0],
            [5, 10]
          ],
          widthMeters: 50
        }
      ]
    };
    burg!.siteDescriptor = mockFullSiteDescriptor;

    // pipeline を通しても siteDescriptor が保持されること
    const doc = generateFromFmgDescriptor(descriptor!);
    const settlement = doc.settlements.find(s => s.burgId === 1);
    expect(settlement).toBeDefined();
    // 参照が同一であり、一切の変性がないこと
    expect(settlement!.siteDescriptor).toBe(mockFullSiteDescriptor);
    expect(JSON.stringify(settlement!.siteDescriptor)).toBe(JSON.stringify(mockFullSiteDescriptor));
  });
});
