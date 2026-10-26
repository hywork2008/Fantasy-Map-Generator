import { objectDrawing, placeableObject } from "../../buildings/placeableObjects";
import type { CityDocument, CityElement, Point } from "../types/document";
import { pointInPolygon } from "./geom";
import { classifyTownWater } from "./townWater";
import { polygonHitsWater } from "./waterGeometry";

export function objectScale(value: number | undefined): number {
  return Number.isFinite(value) && value! >= 0.1 && value! <= 10 ? value! : 1;
}

/** Center the authored envelope consistently in both the plan and Three.js view. */
export function objectFootprint(item: CityElement): Point[] {
  const definition = placeableObject(item.objectType);
  if (!definition || !item.point) return [];
  const bounds = objectDrawing(definition).bounds;
  const scale = objectScale(item.objectScale);
  const x = ((bounds.max.x - bounds.min.x) * scale) / 2;
  const y = ((bounds.max.z - bounds.min.z) * scale) / 2;
  const c = Math.cos(item.rotation ?? 0),
    s = Math.sin(item.rotation ?? 0);
  return [
    [-x, -y],
    [x, -y],
    [x, y],
    [-x, y]
  ].map(([u, v]) => [item.point![0] + u * c - v * s, item.point![1] + u * s + v * c]);
}

export function canPlaceObject(city: CityDocument, item: CityElement): boolean {
  const footprint = objectFootprint(item);
  if (footprint.length !== 4 || footprint.some(p => p.some(v => !Number.isFinite(v)))) return false;
  const boundary = city.sceneRegions?.coreBoundary;
  if (boundary && footprint.some(p => !pointInPolygon(p, boundary))) return false;
  return !polygonHitsWater(
    footprint,
    classifyTownWater(city).parts.map(part => part.polygon)
  );
}
