import type { VectorCityDocument } from "../../../types/vector/document";
import { defenseWater } from "../defense";
import { type PathSurface, pathSurface } from "./surfaces";
export function vectorWaterSurfaces(document: VectorCityDocument): Map<string, PathSurface> {
  const result = new Map(
    Object.values(document.paths)
      .filter(p => p.role === "river")
      .map(p => [p.id, pathSurface(p)])
  );
  for (const water of document.site?.water ?? [])
    if (water.riverPathId && water.polygons.length === 1) result.set(water.riverPathId, water.polygons[0]);
  for (const water of document.site?.water ?? [])
    if (!water.riverPathId)
      water.polygons.forEach((polygon, i) => {
        result.set(`${water.id}:${i}`, polygon);
      });
  return result;
}
export function allVectorWater(document: VectorCityDocument): PathSurface[] {
  const represented = new Set(document.site?.water.flatMap(w => (w.riverPathId ? [w.riverPathId] : [])) ?? []);
  return [
    ...defenseWater(document),
    ...(document.site?.water.flatMap(w => w.polygons) ?? []),
    ...Object.values(document.paths)
      .filter(p => p.role === "river" && !represented.has(p.id))
      .map(pathSurface)
  ];
}
