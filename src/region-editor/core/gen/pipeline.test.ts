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

  it("FMG 記述子から街道と川幅情報を受け取り、橋梁を生成してドキュメントに反映すること", () => {
    const mockDescriptor: RegionSiteDescriptor = {
      version: 1,
      sourceSeed: "seed-routes-test",
      provinceId: 5,
      provinceName: "Sword Coast North",
      boundsMapUnits: [0, 0, 100, 100],
      metersPerMapUnit: 1000,
      extentMeters: { width: 100000, height: 100000 },
      coastlines: [],
      lakes: [],
      rivers: [
        {
          id: 1,
          name: "Chionthar",
          // (20, 50) から (80, 50) へ東西に流れる川
          points: [
            [20, 50],
            [50, 50],
            [80, 50]
          ],
          widthMeters: 200,
          widthsMeters: [80, 180, 280],
          dischargeM3s: 200
        }
      ],
      burgs: [],
      roads: [
        {
          routeId: 101,
          name: "Coast Highway",
          type: "highway",
          // (50, 20) から (50, 80) へ南北に走り、河川 (50, 50) と直角交差する道路
          points: [
            [50, 20],
            [50, 80]
          ]
        },
        {
          routeId: 102,
          name: "East Path",
          type: "trail",
          points: [
            [10, 10],
            [30, 30]
          ]
        }
      ],
      cells: []
    };

    const doc = generateFromFmgDescriptor(mockDescriptor);

    // 河川の検証
    expect(doc.rivers.length).toBe(1);
    const river = doc.rivers[0];
    expect(river.name).toBe("Chionthar");
    expect(river.widths).toEqual([80, 180, 280]); // 川幅配列がそのまま反映されていること

    // 街道の検証
    expect(doc.routes.length).toBe(2);
    const highway = doc.routes.find(r => r.kind === "highway");
    expect(highway).toBeDefined();
    expect(highway!.name).toBe("Coast Highway");

    const trail = doc.routes.find(r => r.kind === "trail");
    expect(trail).toBeDefined();
    expect(trail!.name).toBe("East Path");

    // 直角橋の生成検証（交差箇所に規約通りの直角橋が生成されていること）
    expect(doc.bridges.length).toBe(1);
    const bridge = doc.bridges[0];
    expect(bridge.riverId).toBe(river.id);
    expect(bridge.routeId).toBe(highway!.id);
    expect(bridge.style).toBe("stone_arch"); // highway なので石造アーチ
    expect(bridge.lengthMeters).toBeGreaterThan(0);
    // 直角検証（東西の川に対して南北の橋 = 90度または-90度）
    expect(Math.abs(Math.abs(bridge.angleDeg) - 90)).toBeLessThan(1);
  });
});
