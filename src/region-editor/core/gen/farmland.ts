import { BASE_NET_YIELD_KG_PER_SOWN_HECTARE, planSettlementLandUse } from "../../../generators/settlementClearance";
import { pointInPolygon } from "../geometry";
import type { Point, RegionDocument, RegionLandUsePatch, RegionSiteDescriptor } from "../types";
import {
  approximateSlope,
  clipConvex,
  landscapeNoise,
  lineBuffer,
  polygonArea,
  polygonsOverlap,
  rectangle,
  trimToArea
} from "./landUseGeometry";

/** One-time compatibility adapter; new descriptors supply authoritative budgets. No river water is invented here. */
function legacyBudgets(doc: RegionDocument, site: RegionSiteDescriptor, toLocal: (p: Point) => Point) {
  return planSettlementLandUse(
    site.cells.map((cell, index) => {
      const polygon = (cell.polygon ?? []).map(toLocal);
      const cities = doc.settlements.filter(s => pointInPolygon(s.position, polygon));
      const unsuitable =
        cell.isWater ||
        (cell.height !== undefined && cell.height < 20) ||
        /swamp|marsh|wetland|mangrove|glacier|tundra/i.test(cell.biomeName);
      const rain = cell.annualPrecipitationMm ?? 700;
      const area = (polygonArea(polygon) * doc.bounds.metersPerUnit ** 2) / 10000;
      return {
        id: cell.sourceCellId ?? index,
        anchor: cell.point,
        physicalLandAreaHa: area,
        forestCover: cell.forestCover ?? (/forest|taiga|wood|jungle/i.test(cell.biomeName) ? 0.7 : 0),
        ruralPeople: cell.ruralPeople ?? 0,
        urbanPeople: cities.reduce((s, c) => s + (c.population ?? 0), 0),
        cultivableAreaHa: unsuitable || rain < 200 ? 0 : area * 0.7,
        yieldKgPerSownHa: unsuitable || rain < 200 ? 0 : BASE_NET_YIELD_KG_PER_SOWN_HECTARE,
        diagnostics: [
          "legacy-estimated-soil-and-supply",
          ...(cell.annualPrecipitationMm === undefined ? ["estimated-precipitation"] : [])
        ]
      };
    }),
    { seed: site.sourceSeed ?? doc.seed, year: 0, provenance: "legacy" }
  );
}
/** Details immutable FMG budgets into persisted, disjoint polygons. Never mutates the world. */
export function generateFarmland(doc: RegionDocument, site: RegionSiteDescriptor, toLocal: (p: Point) => Point): void {
  const legacy = site.landUse ? undefined : legacyBudgets(doc, site, toLocal);
  const metadata = site.landUse ?? legacy!;
  const retained = (doc.landUse?.patches ?? []).filter(p => p.userEdited);
  const patches: RegionLandUsePatch[] = [...retained];
  const diagnostics: string[] = [];
  let unplacedAreaHa = 0;
  const scale = doc.bounds.metersPerUnit;
  const areaScale = scale ** 2 / 10000;
  const water = doc.terrain.lakePolygons.concat(
    doc.terrain.coastlinePolygons,
    site.cells.filter(c => c.isWater).map(c => (c.polygon ?? []).map(toLocal))
  );
  const corridors: Point[][] = [];
  for (const river of doc.rivers)
    for (let i = 1; i < river.points.length; i++)
      corridors.push(
        lineBuffer(
          river.points[i - 1],
          river.points[i],
          Math.max(river.widths[i - 1] ?? river.widths[0] ?? 0, river.widths[i] ?? 0) / scale
        )
      );
  const riverCorridors = [...corridors];
  for (const route of doc.routes)
    for (let i = 1; i < route.points.length; i++)
      corridors.push(
        lineBuffer(
          route.points[i - 1],
          route.points[i],
          (route.kind === "highway" ? 8 : route.kind === "trail" ? 2 : 5) / scale
        )
      );
  // World-aligned sampling means different province bounds clip the same underlying parcels.

  const cells = [...site.cells].sort(
    (a, b) => (a.sourceCellId ?? 0) - (b.sourceCellId ?? 0) || a.point[0] - b.point[0] || a.point[1] - b.point[1]
  );
  for (const cell of cells) {
    if (!cell.polygon?.length || cell.isWater) continue;
    const id = cell.sourceCellId ?? site.cells.indexOf(cell);
    const budget = cell.landUse ?? legacy?.cells[id];
    if (!budget) continue;
    diagnostics.push(...budget.diagnostics.map(d => `cell:${id}:${d}`));
    const worldPoly = cell.polygon;
    const localPoly = worldPoly.map(toLocal);
    const physical = polygonArea(localPoly) * areaScale;
    if (Math.abs(physical - budget.physicalLandAreaHa) > Math.max(0.01, budget.physicalLandAreaHa * 0.01))
      diagnostics.push(`cell:${id}:polygon-area-differs-from-budget`);
    const occupied = retained.map(p => p.polygon);
    const bounds = (poly: Point[]) => [
      Math.min(...poly.map(p => p[0])),
      Math.min(...poly.map(p => p[1])),
      Math.max(...poly.map(p => p[0])),
      Math.max(...poly.map(p => p[1]))
    ];
    const [minLocalX, minLocalY, maxLocalX, maxLocalY] = bounds(localPoly);
    const obstacles = water.concat(corridors).filter(p => {
      if (!p.length) return false;
      const [x0, y0, x1, y1] = bounds(p);
      return x0 <= maxLocalX && x1 >= minLocalX && y0 <= maxLocalY && y1 >= minLocalY;
    });
    const nonnatural = budget.patches.filter(p => p.kind !== "natural_forest" && p.kind !== "other_natural");
    for (const patch of nonnatural.filter(p => p.kind === "built")) {
      if (retained.some(p => p.id.startsWith(patch.id))) continue;
      const city = doc.settlements.find(s => pointInPolygon(s.position, localPoly));
      const anchor = city?.position ?? toLocal(patch.anchor);
      const side = Math.sqrt(patch.areaHa / areaScale);
      let polygon = clipConvex(rectangle(anchor[0] - side / 2, anchor[1] - side / 2, side, side), localPoly);
      if (water.concat(riverCorridors).some(p => polygonsOverlap(polygon, p))) polygon = [];
      const areaHa = polygonArea(polygon) * areaScale;
      unplacedAreaHa += Math.max(0, patch.areaHa - areaHa);
      if (areaHa > 1e-8) {
        patches.push({
          ...patch,
          anchor: toLocal(patch.anchor),
          polygon,
          areaHa,
          convertedForestAreaHa: (patch.convertedForestAreaHa * areaHa) / patch.areaHa
        });
        occupied.push(polygon);
      }
    }
    if (!nonnatural.some(p => p.kind !== "built")) continue;
    // Adaptive coarse parcels bound work per cell. The grid origin and IDs are global.
    const angle = (((Math.imul(cell.cultureId ?? id, 2654435761) >>> 0) / 4294967296) * Math.PI) / 2;
    const rotate = (p: Point, a: number): Point => [
      p[0] * Math.cos(a) - p[1] * Math.sin(a),
      p[0] * Math.sin(a) + p[1] * Math.cos(a)
    ];
    const orientedPoly = worldPoly.map(p => rotate(p, -angle));
    const xs = orientedPoly.map(p => p[0]),
      ys = orientedPoly.map(p => p[1]);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const worldArea = polygonArea(worldPoly);
    const step = Math.max(250 / (site.metersPerMapUnit ?? scale), Math.sqrt(worldArea / 512));
    if (doc.terrain.heightfield) diagnostics.push(`cell:${id}:approximate-heightfield-slope`);
    const candidates: Array<{ key: string; polygon: Point[]; score: number }> = [];
    for (let ix = Math.floor(minX / step); ix * step < maxX; ix++)
      for (let iy = Math.floor(minY / step); iy * step < maxY; iy++) {
        const polygon = clipConvex(rectangle(ix * step, iy * step, step, step), orientedPoly).map(p =>
          toLocal(rotate(p, angle))
        );
        if (polygonArea(polygon) < 1e-8 || obstacles.concat(occupied).some(p => polygonsOverlap(polygon, p))) continue;
        const slope = approximateSlope(
          polygon,
          doc.terrain.heightfield,
          doc.bounds.widthMeters / scale,
          doc.bounds.heightMeters / scale,
          scale
        );
        if (slope !== undefined && slope > 0.35) continue;
        const center: Point = rotate([(ix + 0.5) * step, (iy + 0.5) * step], angle);
        // Access priority with stable spatial variation, rather than concentric boundaries.
        const distance = Math.hypot(center[0] - cell.point[0], center[1] - cell.point[1]);
        const variation = ((Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663) ^ id) >>> 0) / 4294967296;
        candidates.push({
          key: `${ix}:${iy}`,
          polygon,
          score:
            distance * (0.7 + variation * 0.6) +
            landscapeNoise(
              (center[0] * (site.metersPerMapUnit ?? scale)) / 5000,
              (center[1] * (site.metersPerMapUnit ?? scale)) / 5000,
              metadata.seed
            ) *
              step *
              5
        });
      }
    candidates.sort((a, b) => a.score - b.score || a.key.localeCompare(b.key));
    let cursor = 0;
    for (const patch of nonnatural.filter(p => p.kind !== "built")) {
      let remaining = Math.max(
        0,
        patch.areaHa - retained.filter(p => p.id.startsWith(patch.id)).reduce((s, p) => s + p.areaHa, 0)
      );
      if (/swamp|marsh|wetland|mangrove|glacier/i.test(cell.biomeName)) {
        unplacedAreaHa += remaining;
        diagnostics.push(`cell:${id}:unsuitable-detailed-terrain`);
        continue;
      }
      while (remaining > 1e-6 && cursor < candidates.length) {
        const candidate = candidates[cursor++];
        const polygon = trimToArea(candidate.polygon, remaining / areaScale);
        const areaHa = polygonArea(polygon) * areaScale;
        if (areaHa <= 1e-8) continue;
        patches.push({
          ...patch,
          id: `${patch.id}:${candidate.key}`,
          anchor: toLocal(patch.anchor),
          polygon,
          areaHa,
          convertedForestAreaHa: patch.areaHa > 0 ? (patch.convertedForestAreaHa * areaHa) / patch.areaHa : 0
        });
        remaining -= areaHa;
      }
      unplacedAreaHa += Math.max(0, remaining);
    }
  }
  doc.landUse = {
    modelVersion: metadata.modelVersion,
    revision: metadata.revision,
    year: metadata.year,
    seed: metadata.seed,
    provenance: metadata.provenance,
    patches,
    unplacedAreaHa,
    diagnostics: [...new Set(diagnostics)].sort()
  };
  // Cell area is counted once; settlements sharing a supply cell get a proportional presentation share.
  for (const city of doc.settlements) city.farmlandAreaHectares = 0;
  for (const cell of site.cells) {
    const poly = (cell.polygon ?? []).map(toLocal);
    const cities = doc.settlements.filter(s => pointInPolygon(s.position, poly));
    const total = cities.reduce((s, c) => s + (c.population ?? 0), 0);
    const id = cell.sourceCellId ?? site.cells.indexOf(cell);
    const fields = patches
      .filter(p => p.sourceCellId === id && p.kind === "cultivation")
      .reduce((s, p) => s + p.areaHa, 0);
    if (total > 0) for (const city of cities) city.farmlandAreaHectares = (fields * (city.population ?? 0)) / total;
  }
  // Detail sampling deliberately leaves river/road exclusions unplaced instead of expanding into water.
}
