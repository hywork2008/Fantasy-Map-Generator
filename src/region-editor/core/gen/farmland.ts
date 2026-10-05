import { pointInPolygon } from "../geometry";
import type { Point, RegionDocument, RegionSiteDescriptor } from "../types";
import { isForestBiome } from "./landscapeBiomes";

// Regional-map approximation: 0.5 ha/person including fallow; 600 mm crop water,
// 70% effective rainfall, 10% river abstraction and 50% irrigation efficiency.
const HECTARES_PER_PERSON = 0.5;
const YEAR_SECONDS = 365 * 86400;
const REACH_METERS = 10000;
const PARCEL_METERS = 250;

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

export function generateFarmland(doc: RegionDocument, site: RegionSiteDescriptor, toLocal: (p: Point) => Point): void {
  const scale = doc.bounds.metersPerUnit;
  const step = PARCEL_METERS / scale;
  const width = doc.bounds.widthMeters / scale;
  const height = doc.bounds.heightMeters / scale;
  const cells = site.cells.filter(c => c.polygon?.length).map(c => ({ ...c, polygon: c.polygon!.map(toLocal) }));
  const forests = doc.biomes.filter(b => isForestBiome(b.kind));
  const used = new Set<string>();
  const riverKeys = doc.rivers.map(r => String(r.sourceRiverId ?? r.id));
  const riverBudgets = new Map<string, number>();
  doc.rivers.forEach((r, i) => {
    riverBudgets.set(
      riverKeys[i],
      Math.max(riverBudgets.get(riverKeys[i]) ?? 0, Math.max(0, r.dischargeM3s) * YEAR_SECONDS * 0.1 * 0.5)
    );
  });

  for (const city of [...doc.settlements].sort((a, b) => a.id.localeCompare(b.id))) {
    city.farmlandAreaHectares = 0;
    let remaining = Math.max(0, city.population ?? 0) * HECTARES_PER_PERSON;
    if (!remaining) continue;
    const [cx, cy] = city.position;
    const reach = REACH_METERS / scale;
    const candidates: Array<{
      key: string;
      center: Point;
      polygon: Point[];
      deficit: number;
      rivers: number[];
      distance: number;
    }> = [];
    for (let ix = Math.max(0, Math.floor((cx - reach) / step)); ix * step + step <= Math.min(width, cx + reach); ix++) {
      for (
        let iy = Math.max(0, Math.floor((cy - reach) / step));
        iy * step + step <= Math.min(height, cy + reach);
        iy++
      ) {
        const key = `${ix}:${iy}`;
        if (used.has(key)) continue;
        const x = ix * step;
        const y = iy * step;
        const center: Point = [x + step / 2, y + step / 2];
        const distance = Math.hypot(center[0] - cx, center[1] - cy);
        if (distance > reach) continue;
        // Keep the settlement footprint free of fields (same radii as the renderer).
        if (
          doc.settlements.some(
            s =>
              Math.hypot(center[0] - s.position[0], center[1] - s.position[1]) <
              (s.isCapital ? 34 : s.type === "city" || s.group === "capital" ? 28 : s.type === "town" ? 22 : 17) + step
          )
        )
          continue;
        const polygon: Point[] = [
          [x, y],
          [x + step, y],
          [x + step, y + step],
          [x, y + step]
        ];
        if (!forests.some(f => polygon.every(p => pointInPolygon(p, f.polygon)))) continue;
        if (
          doc.terrain.lakePolygons
            .concat(doc.terrain.coastlinePolygons)
            .some(p => polygon.some(v => pointInPolygon(v, p)))
        )
          continue;
        const cell = cells.find(c => pointInPolygon(center, c.polygon));
        if (!cell || cell.isWater) continue;
        const nearby: number[] = [];
        let onRiver = false;
        doc.rivers.forEach((r, index) => {
          const d = Math.min(...r.points.slice(1).map((b, i) => segmentDistance(center, r.points[i], b))) * scale;
          if (d < PARCEL_METERS + Math.max(...r.widths, 0) / 2) onRiver = true;
          if (d <= 2000) nearby.push(index);
        });
        if (onRiver) continue;
        const deficit = Math.max(0, 600 - Math.max(0, cell.annualPrecipitationMm ?? 0) * 0.7) * 10;
        candidates.push({ key, center, polygon, deficit, rivers: nearby, distance });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance || a.key.localeCompare(b.key));
    for (const parcel of candidates) {
      if (remaining <= 1e-9) break;
      const sources = [...new Set(parcel.rivers.map(i => riverKeys[i]))];
      const water = sources.reduce((sum, key) => sum + (riverBudgets.get(key) ?? 0), 0);
      const area = Math.min(
        remaining,
        PARCEL_METERS ** 2 / 10000,
        parcel.deficit > 0 ? water / parcel.deficit : Infinity
      );
      if (area <= 1e-9) continue;
      let consumption = area * parcel.deficit;
      for (const key of sources) {
        const budget = riverBudgets.get(key) ?? 0;
        const take = Math.min(consumption, budget);
        riverBudgets.set(key, budget - take);
        consumption -= take;
      }
      city.farmlandAreaHectares += area;
      used.add(parcel.key);
      remaining -= area;
    }
  }
}
