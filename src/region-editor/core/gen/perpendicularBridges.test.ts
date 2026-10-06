import { describe, expect, it } from "vitest";
import { dot, normalize, pointSub } from "../geometry";
import type { RegionRiver, RegionRoute } from "../types";
import { generatePerpendicularBridges } from "./perpendicularBridges";

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

    // 道路セグメントに直角橋が挿入され、ポイント数が増加していること
    const adjustedRoute = result.adjustedRoutes[0];
    expect(adjustedRoute.points.length).toBe(4); // [start, bridgeStart, bridgeEnd, end]
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
