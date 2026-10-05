import { describe, expect, it } from "vitest";
import { worldContext } from "../context/worldContext";
import type { Province } from "../types/models";
import { buildRegionSiteDescriptor } from "./region-editor-handshake";

describe("buildRegionSiteDescriptor", () => {
  it("存在しない Province ID の場合は null を返すこと", () => {
    worldContext.pack = {
      provinces: [],
      states: [],
      cells: { i: [], p: [], c: [], h: [], province: [], state: [], biomeCode: [] },
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
        biomeCode: [1, 1, 4, 4]
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
});
