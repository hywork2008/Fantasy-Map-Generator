import type { WorldContext } from "../context/worldContext";
import { MIN_NAVIGABLE_FLUX, Rivers } from "../generators/river-generator";
import { useOptionsState } from "../store/optionsState";
import type { Route } from "../types/models";
import { mapUnitMeters } from "../utils/mapUnitMeters";
import { planRiverCrossing, RIVER_CARGO_VESSEL, SEA_SAILING_VESSEL } from "../utils/riverCrossing";

function intersection(a: number[], b: number[], c: number[], d: number[]) {
  const rx = b[0] - a[0],
    ry = b[1] - a[1],
    sx = d[0] - c[0],
    sy = d[1] - c[1];
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-9) return null;
  const qx = c[0] - a[0],
    qy = c[1] - a[1];
  const t = (qx * sy - qy * sx) / denominator;
  const u = (qx * ry - qy * rx) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { point: [a[0] + t * rx, a[1] + t * ry] as [number, number], u } : null;
}

/** Resolve crossings AFTER candidate land/water routes exist; never consumes world RNG. */
export function resolveRiverRouteCrossings(world: WorldContext): void {
  const { pack } = world;
  const landRoutes = (pack.routes ?? []).filter(r => r.group !== "searoutes" && !r.lock);
  for (const route of landRoutes) route.riverCrossings = [];
  if (!landRoutes.length) return;
  for (const river of pack.rivers ?? []) {
    if (river.cells.length < 2 || !Number.isFinite(river.widthFactor) || !Number.isFinite(river.sourceWidth)) continue;
    const points = Rivers.addMeandering(river.cells, river.points?.length === river.cells.length ? river.points : null);
    const banks = Rivers.getRiverBanks(points, river.widthFactor, river.sourceWidth);
    const cellSet = new Set(river.cells);
    const waterRoutes = (pack.routes ?? []).filter(
      r => r.group === "searoutes" && routeCells(r).some(c => cellSet.has(c))
    );
    for (const route of landRoutes) {
      if (!routeCells(route).some(c => cellSet.has(c))) continue;
      for (let j = 1; j < route.points.length; j++) {
        for (let i = 1; i < points.length; i++) {
          const hit = intersection(route.points[j - 1], route.points[j], points[i - 1], points[i]);
          if (
            !hit ||
            route.riverCrossings!.some(
              c => c.riverId === river.i && Math.hypot(c.point[0] - hit.point[0], c.point[1] - hit.point[1]) < 1e-5
            )
          )
            continue;
          const cellId = river.cells
            .filter(c => c >= 0)
            .reduce(
              (best, c) => {
                const p = pack.cells.p[c],
                  b = pack.cells.p[best];
                return Math.hypot(p[0] - hit.point[0], p[1] - hit.point[1]) <
                  Math.hypot(b[0] - hit.point[0], b[1] - hit.point[1])
                  ? c
                  : best;
              },
              river.cells.find(c => c >= 0)!
            );
          const offset = (banks.widths[i - 1] + hit.u * (banks.widths[i] - banks.widths[i - 1])) / 2;
          const vessel = waterRoutes.some(r => r.navigation !== "river")
            ? SEA_SAILING_VESSEL
            : waterRoutes.length || pack.cells.fl[cellId] >= MIN_NAVIGABLE_FLUX
              ? RIVER_CARGO_VESSEL
              : undefined;
          const plan = planRiverCrossing({
            widthMeters:
              Rivers.getWidth(offset) * mapUnitMeters(world.distanceScale, useOptionsState.getState().distanceUnit),
            depthMeters: river.cellHydrology?.[cellId]?.waterDepth,
            period: world.options.historicalPeriod,
            technology: world.options.riverBridgeTechnology,
            vessel
          });
          route.riverCrossings!.push({ riverId: river.i, cellId, point: hit.point, plan });
        }
      }
    }
  }
}
function routeCells(route: Route): number[] {
  return route.cells ?? route.points.map(p => p[2]);
}
