import type { BuildingLot } from "./buildingLots.types";

/** Canonical ring key is invariant under winding, start vertex and lot array ordering. */
export function stableBuildingAppearanceId(lot: BuildingLot): string {
  if (lot.id) return lot.id;
  const points = lot.polygon.map(p => `${Math.round(p[0] * 100)},${Math.round(p[1] * 100)}`);
  if (points.length > 1 && points[0] === points[points.length - 1]) points.pop();
  const rings: string[] = [];
  for (const order of [points, [...points].reverse()])
    for (let i = 0; i < order.length; i++) rings.push([...order.slice(i), ...order.slice(0, i)].join(";"));
  return `${lot.faceId}:${rings.sort()[0] ?? "empty"}`;
}
