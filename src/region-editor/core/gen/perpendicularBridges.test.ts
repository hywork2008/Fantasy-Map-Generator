import { describe, expect, it } from "vitest";
import { dot, normalize, pointSub } from "../geometry";
import type { RegionRiver, RegionRoute } from "../types";
import { generatePerpendicularBridges, stripLegacyBridgePoints } from "./perpendicularBridges";

describe("generatePerpendicularBridges", () => {
  it("斜めに横切る道路に対して、河川進行方向と厳格に直角（90度）な橋梁を生成すること", () => {
    // 水平に流れる河川 (x: 0 -> 100, y: 50)
    const river: RegionRiver = {
      id: "river-1",
      name: "Chionthar River",
      points: [
        [0, 50],
        [100, 50]
      ],
      widths: [200],
      dischargeM3s: 150
    };

    // 45度の角度で斜めに横切る街道 (x: 20 -> 80, y: 20 -> 80)
    const route: RegionRoute = {
      id: "route-1",
      kind: "highway",
      name: "Trade Way",
      points: [
        [20, 20],
        [80, 80]
      ]
    };

    const result = generatePerpendicularBridges([river], [route], 100);

    expect(result.bridges).toHaveLength(1);
    const bridge = result.bridges[0];

    // 交点は (50, 50)
    expect(bridge.center[0]).toBeCloseTo(50, 4);
    expect(bridge.center[1]).toBeCloseTo(50, 4);

    // 河川の接線ベクトル T は [1, 0]
    const riverTangent = normalize(pointSub(river.points[1], river.points[0]));
    expect(riverTangent[0]).toBeCloseTo(1, 4);
    expect(riverTangent[1]).toBeCloseTo(0, 4);

    // 橋梁の角度は 90度 (法線方向 [0, 1] または [0, -1])
    expect(Math.abs(bridge.angleDeg)).toBeCloseTo(90, 4);

    // 橋梁の方向ベクトル B
    const angleRad = (bridge.angleDeg * Math.PI) / 180;
    const bridgeDir = [Math.cos(angleRad), Math.sin(angleRad)] as [number, number];

    // 直交判定: T · B === 0
    const dotProduct = dot(riverTangent, bridgeDir);
    expect(Math.abs(dotProduct)).toBeLessThan(1e-6);

    // 描画用ルートには河川法線上に一直線に並ぶ進入点・橋端・橋端・退出点が挿入される
    const adjustedRoute = result.adjustedRoutes[0];
    expect(adjustedRoute.points.length).toBe(6);
    const axis = adjustedRoute.points.slice(1, 5);
    for (const p of axis) expect(p[0]).toBeCloseTo(50, 6);
    // 元のルートは変更しない（保存データに挿入点を書き戻さない）
    expect(route.points).toHaveLength(2);
  });

  it("許容斜角があれば、構造別の上限まで橋軸を道の向きへ寄せること", () => {
    const river: RegionRiver = {
      id: "river-1",
      name: "R",
      points: [
        [0, 50],
        [100, 50]
      ],
      widths: [200],
      dischargeM3s: 150
    };
    // 45度で横切る道路: 直角からのずれ 45° は上限を超えるので上限で止まる
    const route = (kind: RegionRoute["kind"]): RegionRoute => ({
      id: `route-${kind}`,
      kind,
      name: "R",
      points: [
        [20, 20],
        [80, 80]
      ]
    });
    const limits = { stone: 15, timber: 20 };
    const skewOf = (kind: RegionRoute["kind"]) => {
      const result = generatePerpendicularBridges([river], [route(kind)], 100, undefined, [], limits);
      expect(result.bridges).toHaveLength(1);
      const b = result.bridges[0];
      const axis: [number, number] = [Math.cos((b.angleDeg * Math.PI) / 180), Math.sin((b.angleDeg * Math.PI) / 180)];
      // 実際の橋軸と河川法線 [0, 1] のなす角
      const measured = (Math.asin(Math.abs(axis[0])) * 180) / Math.PI;
      expect(measured).toBeCloseTo(Math.abs(b.skewDegrees ?? 0), 6);
      return { skew: Math.abs(b.skewDegrees ?? 0), b, result };
    };
    const stone = skewOf("highway");
    expect(stone.b.style).toBe("stone_arch");
    expect(stone.skew).toBeCloseTo(15, 6);
    const timber = skewOf("road");
    expect(timber.b.style).toBe("wooden");
    expect(timber.skew).toBeCloseTo(20, 6);
    // 斜めの橋は直角の橋より長い
    const square = generatePerpendicularBridges([river], [route("highway")], 100).bridges[0];
    expect(square.skewDegrees ?? 0).toBe(0);
    expect(stone.b.lengthMeters).toBeGreaterThan(square.lengthMeters);
    // 橋上の4点は橋軸上に一直線に並ぶ（描画ルートが橋の上で曲がらない）
    const pts = stone.result.adjustedRoutes[0].points;
    const n = normalize(pointSub(pts[2], pts[1]));
    for (const p of pts.slice(1, -1)) {
      const off = pointSub(p, stone.b.center);
      expect(Math.abs(off[0] * n[1] - off[1] * n[0])).toBeLessThan(1e-6);
    }
    // 上限以下のずれはそのまま道の向きに合わせる
    const gentle = generatePerpendicularBridges(
      [river],
      [
        {
          ...route("road"),
          points: [
            [45, 20],
            [55, 80]
          ]
        }
      ],
      100,
      undefined,
      [],
      limits
    ).bridges[0];
    expect(Math.abs(gentle.skewDegrees ?? 0)).toBeCloseTo((Math.atan(10 / 60) * 180) / Math.PI, 6);
  });

  it("河川の頂点上で交差しても橋は1基だけ架けること", () => {
    const river: RegionRiver = {
      id: "river-1",
      name: "River",
      points: [
        [0, 0],
        [100, 50],
        [200, 50],
        [300, 0]
      ],
      widths: [200, 200, 200, 200],
      dischargeM3s: 50
    };
    const route: RegionRoute = {
      id: "route-1",
      kind: "road",
      points: [
        [100, -50],
        [100, 50],
        [100, 150]
      ]
    };
    const result = generatePerpendicularBridges([river], [route], 100, 1);
    expect(result.bridges).toHaveLength(1);
  });

  it("川を渡って同じ岸へ戻るだけの寄り道には橋を架けないこと", () => {
    const river: RegionRiver = {
      id: "river-1",
      name: "River",
      points: [
        [0, 50],
        [100, 50]
      ],
      widths: [200, 200],
      dischargeM3s: 50
    };
    const route: RegionRoute = {
      id: "route-1",
      kind: "road",
      points: [
        [0, 0],
        [49, 48],
        [50, 52],
        [51, 48],
        [100, 0]
      ]
    };
    const result = generatePerpendicularBridges([river], [route], 100, 1);
    expect(result.bridges).toHaveLength(0);
  });

  it("川岸の集落を通る道では集落を残したまま橋軸上に乗せること", () => {
    const river: RegionRiver = {
      id: "river-1",
      name: "River",
      points: [
        [0, 50],
        [100, 50]
      ],
      widths: [200, 200],
      dischargeM3s: 50
    };
    const town: [number, number] = [52, 51];
    const route: RegionRoute = {
      id: "route-1",
      kind: "road",
      points: [[20, 0], town, [90, 100]]
    };
    const result = generatePerpendicularBridges([river], [route], 100, 1, [town]);
    expect(result.bridges).toHaveLength(1);
    const bridge = result.bridges[0];
    expect(Math.abs(bridge.angleDeg)).toBeCloseTo(90, 4);
    expect(bridge.center[0]).toBeCloseTo(52, 6);
    expect(result.adjustedRoutes[0].points).toContainEqual(town);
  });
});

describe("stripLegacyBridgePoints", () => {
  it("旧版が書き込んだ橋端点を取り除き、元のルートに戻すこと", () => {
    const river: RegionRiver = {
      id: "river-1",
      name: "River",
      points: [
        [0, 50],
        [100, 50]
      ],
      widths: [200],
      dischargeM3s: 50
    };
    const original: [number, number][] = [
      [20, 20],
      [80, 80]
    ];
    const halfLen = 1;
    const doc = {
      bounds: { widthMeters: 10000, heightMeters: 10000, metersPerUnit: 100 },
      bridges: [
        {
          id: "b",
          riverId: river.id,
          routeId: "route-1",
          center: [50, 50] as [number, number],
          lengthMeters: halfLen * 2 * 100,
          widthMeters: 8,
          angleDeg: 90,
          style: "wooden" as const
        }
      ],
      routes: [
        {
          id: "route-1",
          kind: "road" as const,
          points: [original[0], [50, 50 - halfLen], [50, 50 + halfLen], original[1]] as [number, number][]
        }
      ]
    };
    stripLegacyBridgePoints(doc);
    expect(doc.routes[0].points).toEqual(original);
  });

  it("交差しない道路と河川では橋を生成しないこと", () => {
    const river: RegionRiver = {
      id: "river-1",
      name: "River",
      points: [
        [0, 20],
        [100, 20]
      ],
      widths: [200],
      dischargeM3s: 50
    };

    const route: RegionRoute = {
      id: "route-1",
      kind: "road",
      points: [
        [0, 80],
        [100, 80]
      ]
    };

    const result = generatePerpendicularBridges([river], [route]);
    expect(result.bridges).toHaveLength(0);
    expect(result.adjustedRoutes[0].points).toEqual(route.points);
  });
});
