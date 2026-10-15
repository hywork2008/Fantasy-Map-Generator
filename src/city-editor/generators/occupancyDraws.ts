import type { Point } from "../types/document";

/** Each footprint's occupancy draw (see `BuildingLot.occupancyDraw`); absent when occupancy cannot remove it. */
export const occupancyDraws = new WeakMap<Point[], number>();
