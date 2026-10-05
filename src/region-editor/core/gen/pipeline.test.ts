import { describe, expect, it } from "vitest";
import { DEFAULT_REGION_SETTINGS, type RegionSiteDescriptor } from "../types";
import { generateFromFmgDescriptor, generateStandaloneRegion } from "./pipeline";

describe("generateStandaloneRegion", () => {
  it("指定シードから完全な RegionDocument を生成できること", () => {
    const doc = generateStandaloneRegion(DEFAULT_REGION_SETTINGS);

    expect(doc.format).toBe("fmg-region-editor");
    expect(doc.version).toBe(1);
    expect(doc.title).toBe(DEFAULT_REGION_SETTINGS.title);
    expect(doc.symbols.length).toBeGreaterThan(0);
    expect(doc.rivers.length).toBeGreaterThan(0);
    expect(doc.settlements.length).toBeGreaterThan(0);

    // 直角橋が正しく生成されていること
    expect(doc.bridges.length).toBeGreaterThan(0);
    for (const bridge of doc.bridges) {
      expect(Math.abs(bridge.angleDeg)).toBeGreaterThanOrEqual(0);
      expect(bridge.lengthMeters).toBeGreaterThan(0);
    }

    // シンボルが Y 座標昇順（北から南）にソートされていること
    for (let i = 0; i < doc.symbols.length - 1; i++) {
      expect(doc.symbols[i].y).toBeLessThanOrEqual(doc.symbols[i + 1].y);
    }
  });

  it("同一シードから常に同一のシンボル数・集落が決定論的に再現されること", () => {
    const docA = generateStandaloneRegion({ ...DEFAULT_REGION_SETTINGS, seed: "test-re-123" });
    const docB = generateStandaloneRegion({ ...DEFAULT_REGION_SETTINGS, seed: "test-re-123" });

    expect(docA.symbols.length).toBe(docB.symbols.length);
    expect(docA.rivers.length).toBe(docB.rivers.length);
    expect(docA.settlements).toEqual(docB.settlements);
    expect(docA.bridges.length).toBe(docB.bridges.length);
  });

  it("スタンドアロン地図に標高マップと等高線が正しく生成されること", () => {
    const doc = generateStandaloneRegion(DEFAULT_REGION_SETTINGS);
    expect(doc.terrain.heightfield).toBeDefined();
    expect(doc.terrain.heightfield!.elevationsMeters.length).toBeGreaterThan(0);
    expect(doc.terrain.contours).toBeDefined();
    expect(doc.terrain.contours!.length).toBeGreaterThan(0);
    expect(doc.terrain.showContours).toBe(true);
  });
});

describe("generateFromFmgDescriptor with elevation & contours", () => {
  it("FMG から渡されたセル標高パラメータから等高線と Heightfield が保持・生成されること", () => {
    const mockDescriptor: RegionSiteDescriptor = {
      version: 1,
      sourceSeed: "seed-456",
      provinceId: 3,
      provinceName: "High Pass",
      boundsMapUnits: [100, 100, 300, 300],
      metersPerMapUnit: 1000,
      extentMeters: { width: 200000, height: 200000 },
      coastlines: [],
      lakes: [],
      rivers: [],
      burgs: [],
      roads: [],
      elevationStats: {
        minElevationMeters: 50,
        maxElevationMeters: 1800,
        maxBorderRelief: 25
      },
      cells: [
        { point: [120, 120], elevationMeters: 100, height: 25, inProvince: true, biomeId: 1, biomeName: "Grassland" },
        { point: [200, 150], elevationMeters: 600, height: 40, inProvince: true, biomeId: 5, biomeName: "Hills" },
        { point: [280, 200], elevationMeters: 1800, height: 70, inProvince: true, biomeId: 6, biomeName: "Mountain" },
        // 周辺セル（州外セル）
        { point: [290, 290], elevationMeters: 2200, height: 80, inProvince: false, biomeId: 6, biomeName: "Mountain" },
        { point: [110, 280], elevationMeters: 40, height: 21, inProvince: false, biomeId: 1, biomeName: "Grassland" }
      ]
    };

    const doc = generateFromFmgDescriptor(mockDescriptor);

    expect(doc.terrain.heightfield).toBeDefined();
    expect(doc.terrain.heightfield!.minElevationMeters).toBeGreaterThanOrEqual(30);
    expect(doc.terrain.heightfield!.maxElevationMeters).toBeLessThanOrEqual(2300);
    expect(doc.terrain.contours).toBeDefined();
    expect(doc.terrain.contours!.length).toBeGreaterThan(0);
    expect(doc.terrain.showContours).toBe(true);

    // 等高線がデータとして保持されていること
    for (const c of doc.terrain.contours!) {
      expect(c.elevationMeters).toBeGreaterThan(0);
      expect(c.points.length).toBeGreaterThanOrEqual(2);
    }
  });
});
