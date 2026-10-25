// Shared excavation footprints for ground clipping and the saved ditch surfaces.
import type { BastionedTownPlan, DefenseRegion, Point } from "../../types/document";
import { triangularInfillParts } from "../lotGeometry";
import { bounds, PlotIndex, subtractConvex } from "../parcelGeometry";

const piecesByPolygon = new WeakMap<DefenseRegion[number], Point[][]>();

export function defenseRegionPieces(region: DefenseRegion): Point[][] {
  return region.flatMap(poly => {
    const cached = piecesByPolygon.get(poly);
    if (cached) return cached;
    let pieces = triangularInfillParts(poly.outer);
    for (const hole of poly.holes)
      for (const cut of triangularInfillParts(hole)) pieces = pieces.flatMap(piece => subtractConvex(piece, cut, 1e-6));
    piecesByPolygon.set(poly, pieces);
    return pieces;
  });
}

const indexes = new WeakMap<BastionedTownPlan, PlotIndex<Point[]>>();

function ditchIndex(plan: BastionedTownPlan): PlotIndex<Point[]> {
  let index = indexes.get(plan);
  if (!index) {
    index = new PlotIndex<Point[]>();
    for (const ditch of plan.ditches)
      for (const piece of defenseRegionPieces(ditch.region)) index.add(piece, bounds(piece));
    indexes.set(plan, index);
  }
  return index;
}

export function ditchGroundNearby(plan: BastionedTownPlan, polygon: Point[]): boolean {
  return ditchIndex(plan).query(bounds(polygon)).length > 0;
}

export function cutDitchGround(plan: BastionedTownPlan | undefined, polygon: Point[]): Point[][] {
  if (!plan) return [polygon];
  const cuts = ditchIndex(plan).query(bounds(polygon));
  if (!cuts.length) return [polygon];
  let pieces = triangularInfillParts(polygon);
  for (const cut of cuts) pieces = pieces.flatMap(piece => subtractConvex(piece, cut, 1e-6));
  return pieces;
}
