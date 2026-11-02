import type { RoadRibbon } from "../../../utils/roadSurface";
import type { Point } from "../../types/primitives";
import type { FreeformWay, TerrainPlatform } from "../../types/terrain";
import { gradeLimitOf, waySurface } from "./slopeWay";
import { WAY_RISER_METERS, WAY_TREAD_METERS } from "./steppedWay";
import { offsetStrip, pointAlong, slicePolyline } from "./wayGeometry";

/** Flat landings become pads. Building pads are applied later, so a plot keeps its own level. */
export function landingPlatforms(ways: readonly FreeformWay[], baseAt: (point: Point) => number): TerrainPlatform[] {
  const pads: TerrainPlatform[] = [];
  for (const way of ways) {
    if (way.profile !== "stepped") continue;
    way.landings?.forEach((landing, index) => {
      const line = slicePolyline(way.centerline, landing.fromMeters, landing.toMeters);
      if (line.length < 2) return;
      const outline = offsetStrip(line, way.widthMeters / 2);
      if (outline.length < 4) return;
      let drop = 0;
      for (const point of outline) drop = Math.max(drop, Math.abs(baseAt(point) - landing.levelMeters));
      pads.push({
        kind: "platform",
        id: `way:${way.id}:landing:${index}`,
        ownerId: way.id,
        role: "pad",
        summit: { kind: "polygon", points: outline },
        levelMeters: landing.levelMeters,
        edge: { kind: "slope", runMeters: Math.max(0, Math.min(200, drop * 2)) }
      });
    });
  }
  return pads;
}

export function slopeRibbons(ways: readonly FreeformWay[]): RoadRibbon[] {
  return ways.flatMap(way =>
    way.profile === "slope" && way.centerline.length >= 2
      ? [
          {
            centerline: way.centerline,
            widthMeters: way.widthMeters,
            surface: waySurface(way.surface),
            gradeClass: "cart" as const,
            maxGrade: gradeLimitOf(way.grade)
          }
        ]
      : []
  );
}

/** Absolute tread heights. The terrain view subtracts its datum before drawing. */
export function steppedFlights(ways: readonly FreeformWay[]): Array<{
  centerline: Point[];
  elevations: number[];
  widthMeters: number;
  riserMeters: number;
}> {
  const flights = [];
  for (const way of ways) {
    if (way.profile !== "stepped") continue;
    for (const flight of way.flights ?? []) {
      if (flight.steps < 1) continue;
      const sign = Math.sign(flight.toLevelMeters - flight.fromLevelMeters) || 1;
      const centerline: Point[] = [];
      const elevations: number[] = [];
      for (let step = 0; step <= flight.steps; step++) {
        centerline.push(
          pointAlong(way.centerline, Math.min(flight.toMeters, flight.fromMeters + step * WAY_TREAD_METERS))
        );
        elevations.push(flight.fromLevelMeters + sign * step * WAY_RISER_METERS);
      }
      flights.push({ centerline, elevations, widthMeters: way.widthMeters, riserMeters: WAY_RISER_METERS });
    }
  }
  return flights;
}
