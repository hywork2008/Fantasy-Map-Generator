import { buildBlockFabric } from "../../generators/blockInfill";
import { assignBuildingMassing } from "../../generators/buildingMassing";
import type { CityDocument } from "../../types/document";
import type { Point } from "../../types/primitives";

const HEADERS = [
  "Building ID",
  "Face ID",
  "District",
  "Archetype",
  "Role",
  "Length (m)",
  "Width (m)",
  "Footprint area (m²)",
  "Storeys",
  "Floor area (m²)"
];

function csvCell(value: string | number | undefined): string {
  const text = value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function polygonArea(points: Point[]): number {
  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twiceArea += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(twiceArea) / 2;
}

/** Minimum-area, edge-aligned rectangle dimensions for a building footprint. */
function footprintDimensions(points: Point[]): { length: number; width: number } {
  let bestArea = Infinity;
  let best = { length: 0, width: 0 };
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    let minU = Infinity,
      maxU = -Infinity,
      minV = Infinity,
      maxV = -Infinity;
    for (const point of points) {
      const dx = point[0] - a[0],
        dy = point[1] - a[1];
      const u = dx * cos + dy * sin;
      const v = -dx * sin + dy * cos;
      minU = Math.min(minU, u);
      maxU = Math.max(maxU, u);
      minV = Math.min(minV, v);
      maxV = Math.max(maxV, v);
    }
    const u = maxU - minU,
      v = maxV - minV;
    if (u * v < bestArea) {
      bestArea = u * v;
      best = { length: Math.max(u, v), width: Math.min(u, v) };
    }
  }
  return best;
}

function districtForFace(document: CityDocument, faceId: string): string {
  const district = document.fabric?.districts.find(item => item.faceIds.includes(faceId));
  return district?.parameters.composition ?? "";
}

export function buildingInventoryCsv(document: CityDocument): string {
  const buildings = assignBuildingMassing(document, buildBlockFabric(document).buildings).filter(
    lot => !lot.landmark && lot.polygon.length >= 3
  );
  const rows = buildings.map((lot, index) => {
    const dimensions = footprintDimensions(lot.polygon);
    const area = polygonArea(lot.polygon);
    const storeys = lot.massing?.storeys ?? lot.storeys ?? 1;
    return [
      lot.id ?? `building-${index + 1}`,
      lot.faceId,
      districtForFace(document, lot.faceId),
      lot.archetype ?? "",
      lot.role ?? "",
      dimensions.length.toFixed(2),
      dimensions.width.toFixed(2),
      area.toFixed(2),
      storeys,
      (area * storeys).toFixed(2)
    ];
  });
  return `\uFEFF${[HEADERS, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
