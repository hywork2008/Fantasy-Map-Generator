import { dot, normal, normalize, pointAdd, pointScale, pointSub, segmentIntersection } from "../geometry";
import type { Point, RegionBridge, RegionRiver, RegionRoute } from "../types";

export interface BridgeGenerationResult {
  bridges: RegionBridge[];
  /** 橋梁が挿入され、直角通過に補正された更新後ルート */
  adjustedRoutes: RegionRoute[];
}

/**
 * 街道と河川の交差点に、河川の局所接線に対して厳格に直角（90度）な橋梁を生成する。
 *
 * 規約要件（AGENTS.md）:
 * 「河川を通過する橋は河川の進行方向と直角に交差させ、最短距離で通過させる。
 * 直角に交差しない橋は絶対に描いてはならない。」
 */
export function generatePerpendicularBridges(
  rivers: RegionRiver[],
  routes: RegionRoute[],
  metersPerUnit = 100
): BridgeGenerationResult {
  const bridges: RegionBridge[] = [];
  const adjustedRoutes: RegionRoute[] = [];

  for (const route of routes) {
    if (route.kind === "sea_lane") {
      adjustedRoutes.push(route);
      continue;
    }

    let routePoints = [...route.points];
    let routeModified = false;

    for (const river of rivers) {
      if (river.points.length < 2) continue;

      // 道路の各セグメントと河川の各セグメントの交差を検査
      for (let ri = 0; ri < routePoints.length - 1; ri++) {
        const rp1 = routePoints[ri];
        const rp2 = routePoints[ri + 1];

        for (let rvi = 0; rvi < river.points.length - 1; rvi++) {
          const rvp1 = river.points[rvi];
          const rvp2 = river.points[rvi + 1];

          const hit = segmentIntersection(rp1, rp2, rvp1, rvp2);
          if (!hit.intersects || !hit.point) continue;

          const intersectPoint = hit.point;

          // 1. 河川セグメントの接線ベクトル T
          const riverTangent = normalize(pointSub(rvp2, rvp1));

          // 2. 河川に対する厳格な直角法線ベクトル N (dot(T, N) === 0)
          let riverNormal = normal(riverTangent);

          // 道路の進行方向（rp1 -> rp2）に合わせた法線の向きにする
          const roadDir = normalize(pointSub(rp2, rp1));
          if (dot(roadDir, riverNormal) < 0) {
            riverNormal = pointScale(riverNormal, -1);
          }

          // 3. 川幅と橋の長さ
          const riverWidthMeters = river.widths[rvi] ?? 200;
          const riverWidthUnits = riverWidthMeters / metersPerUnit;
          // 橋梁長は川幅に土手マージン（20%）を加えた長さ、最低でも2.0 units
          const bridgeLengthUnits = Math.max(riverWidthUnits * 1.2, 2.0);
          const halfLen = bridgeLengthUnits / 2;

          // 4. 橋梁の端点（直角・最短距離）
          const bridgeStart: Point = pointAdd(intersectPoint, pointScale(riverNormal, -halfLen));
          const bridgeEnd: Point = pointAdd(intersectPoint, pointScale(riverNormal, halfLen));

          // 5. 角度（度数法）: 河川接線と直角
          const angleRad = Math.atan2(riverNormal[1], riverNormal[0]);
          const angleDeg = (angleRad * 180) / Math.PI;

          const bridgeId = `bridge-${route.id}-${river.id}-${bridges.length + 1}`;
          const bridge: RegionBridge = {
            id: bridgeId,
            riverId: river.id,
            routeId: route.id,
            center: intersectPoint,
            lengthMeters: bridgeLengthUnits * metersPerUnit,
            widthMeters: route.kind === "highway" ? 12 : 8,
            angleDeg,
            style: route.kind === "highway" ? "stone_arch" : "wooden"
          };

          bridges.push(bridge);

          // 6. 道路経路を橋梁の直角セグメントを経由するように再構成
          // [..., rp1, bridgeStart, bridgeEnd, rp2, ...]
          routePoints = [...routePoints.slice(0, ri + 1), bridgeStart, bridgeEnd, ...routePoints.slice(ri + 1)];
          routeModified = true;
          ri += 2; // 挿入した端点分インデックスを進める
          break;
        }
      }
    }

    adjustedRoutes.push({
      ...route,
      points: routeModified ? routePoints : route.points
    });
  }

  return { bridges, adjustedRoutes };
}
