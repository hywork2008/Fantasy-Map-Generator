import { BASE_NET_YIELD_KG_PER_SOWN_HECTARE, planSettlementLandUse } from "../../../generators/settlementClearance";
import type { CellLandUseBudget } from "../../../types/landUse";
import { pointInPolygon } from "../geometry";
import type { Point, RegionDocument, RegionLandUsePatch, RegionSiteDescriptor } from "../types";
import {
  approximateSlope,
  clipConvex,
  createFieldNoise,
  lineBuffer,
  polygonArea,
  polygonsOverlap,
  rectangle,
  subtractConvex
} from "./landUseGeometry";
import { buildParcels, insetPiece, pieceCentroid, shrinkPiecesToArea } from "./organicParcels";

/** Convex Voronoi parcel area relative to spacing squared (see organicParcels STRETCH). */
const PARCEL_AREA_FACTOR = 1.15;
const MIN_PARCEL_SPACING_M = 250;
const MAX_PARCELS = 450;

type Box = [number, number, number, number];
const boxOf = (poly: Point[]): Box => {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  return [x0, y0, x1, y1];
};
const boxesOverlap = (a: Box, b: Box) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const unionBox = (polys: Point[][]): Box => boxOf(polys.flat());
const hashKey = (key: string) => {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
};
/** Centroid plus points pulled toward each vertex: a cheap proxy for how much of a parcel a region covers. */
function sampleParcel(pieces: Point[][]): Point[] {
  const largest = pieces.reduce((best, piece) => (polygonArea(piece) > polygonArea(best) ? piece : best));
  const c = pieceCentroid(largest);
  return [c, ...largest.slice(0, 8).map(p => [c[0] + (p[0] - c[0]) * 0.6, c[1] + (p[1] - c[1]) * 0.6] as Point)];
}

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
  const worldScale = site.metersPerMapUnit ?? scale;
  const seedKey = `${metadata.seed}:parcels`;
  const routePoints = doc.routes.flatMap(route => route.points);
  const riverPoints = doc.rivers.flatMap(river => river.points);
  const retainedAreaHa = (patch: { id: string }) =>
    retained.filter(p => p.id.startsWith(patch.id)).reduce((s, p) => s + p.areaHa, 0);
  const cropNoiseCache = new Map<number, (x: number, y: number) => number>();
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
    const cellBox = boxOf(localPoly);
    const blockers = water.concat(
      corridors,
      retained.map(p => p.polygon)
    );
    const inCell = (poly: Point[]) => poly.length > 0 && boxesOverlap(boxOf(poly), cellBox);
    const exclusions = blockers.filter(inCell);
    const hasGeometry = budget.patches.some(p => p.polygons);
    const nonnatural = budget.patches.filter(p => p.kind !== "natural_forest" && p.kind !== "other_natural");
    const builtPolygons: Point[][] = [];
    if (hasGeometry) {
      for (const patch of nonnatural.filter(p => p.kind === "built")) {
        if (retained.some(p => p.id.startsWith(patch.id))) continue;
        let fragments = (patch.polygons ?? [])
          .map(p => clipConvex(p.map(toLocal), localPoly))
          .filter(p => polygonArea(p) > 1e-8);
        for (const obstacle of exclusions)
          fragments = fragments.flatMap(p => (polygonsOverlap(p, obstacle) ? subtractConvex(p, obstacle) : [p]));
        const placed = fragments.reduce((s, p) => s + polygonArea(p) * areaScale, 0);
        unplacedAreaHa += Math.max(0, patch.areaHa - placed);
        fragments.forEach((polygon, index) => {
          builtPolygons.push(polygon);
          patches.push({
            ...patch,
            polygons: undefined,
            id: `${patch.id}:coarse:${index}`,
            anchor: toLocal(patch.anchor),
            polygon,
            areaHa: polygonArea(polygon) * areaScale,
            convertedForestAreaHa:
              patch.areaHa > 0 ? (patch.convertedForestAreaHa * polygonArea(polygon) * areaScale) / patch.areaHa : 0
          });
        });
      }
    } else {
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
          builtPolygons.push(polygon);
        }
      }
    }
    const open = nonnatural
      .filter(p => p.kind !== "built")
      .sort((a, b) => Number(b.kind === "cultivation") - Number(a.kind === "cultivation"));
    if (!open.length) continue;
    // FMG budgets already account for the biome; only the legacy estimate needs this guard.
    if (!hasGeometry && /swamp|marsh|wetland|mangrove|glacier/i.test(cell.biomeName)) {
      for (const patch of open) {
        if (retained.some(p => p.id.startsWith(patch.id))) continue;
        unplacedAreaHa += patch.areaHa;
        diagnostics.push(`cell:${id}:unsuitable-detailed-terrain`);
      }
      continue;
    }
    const blocking = exclusions.concat(builtPolygons).map(poly => ({ poly, box: boxOf(poly) }));
    if (doc.terrain.heightfield) diagnostics.push(`cell:${id}:approximate-heightfield-slope`);
    // Per kind: the FMG footprint (if any) and the area still to place.
    const plans = open
      .filter(patch => !retained.some(p => p.id.startsWith(patch.id)))
      .map(patch => {
        const retainedHa = retained.filter(p => p.id.startsWith(patch.id)).reduce((s, p) => s + p.areaHa, 0);
        if (!hasGeometry)
          return { patch, footprint: undefined, target: Math.max(0, patch.areaHa - retainedHa) / areaScale };
        let fragments = (patch.polygons ?? [])
          .map(p => clipConvex(p.map(toLocal), localPoly))
          .filter(p => polygonArea(p) > 1e-8);
        for (const obstacle of blocking)
          fragments = fragments.flatMap(p =>
            boxesOverlap(boxOf(p), obstacle.box) && polygonsOverlap(p, obstacle.poly)
              ? subtractConvex(p, obstacle.poly)
              : [p]
          );
        return {
          patch,
          footprint: fragments.map(poly => ({ poly, box: boxOf(poly) })),
          target: fragments.reduce((s, p) => s + polygonArea(p), 0)
        };
      });
    // Fields sit near the people they feed (this cell's settlements, or the demand cells it supplies) and
    // along roads and rivers, which give access and water.
    // Settlement sites come from the budgets (a built patch exists wherever urban people do), not from whatever the
    // document currently holds, so the layout depends only on world data.
    const siteOf = (b: CellLandUseBudget | undefined) => b?.patches.find(p => p.kind === "built")?.anchor;
    const settlementSites: Point[] = [];
    const own = siteOf(budget);
    if (own) settlementSites.push(toLocal(own));
    for (const allocation of budget.transportAllocations ?? []) {
      const demand = site.cells.find(c => (c.sourceCellId ?? site.cells.indexOf(c)) === allocation.demandCellId);
      const anchor = siteOf(demand?.landUse ?? legacy?.cells[allocation.demandCellId]);
      if (anchor) settlementSites.push(toLocal(anchor));
    }
    // Rural-only cells have no single hamlet to cluster around, so their fields scatter over a wider area.
    const anchored = settlementSites.length > 0;
    // Parcel size follows the budget (about 20 fields per kind, 20-200 ha each); the work area is limited to the
    // neighbourhood of the FMG footprint so a small crop budget in a huge cell stays cheap.
    const largestHa = Math.max(...plans.map(p => p.target * areaScale), 0);
    const targetSpacingM = Math.sqrt((Math.min(200, Math.max(20, largestHa / 20)) * 10000) / PARCEL_AREA_FACTOR);
    const cellWorldBox = boxOf(worldPoly);
    let roi = cellWorldBox;
    if (hasGeometry) {
      const world = plans.flatMap(p => p.patch.polygons ?? []).flat();
      if (world.length) {
        const pad = Math.max(anchored ? 1500 : 3500, targetSpacingM * (anchored ? 4 : 8)) / worldScale;
        const b = boxOf(world);
        roi = [
          Math.max(cellWorldBox[0], b[0] - pad),
          Math.max(cellWorldBox[1], b[1] - pad),
          Math.min(cellWorldBox[2], b[2] + pad),
          Math.min(cellWorldBox[3], b[3] + pad)
        ];
      }
    }
    const roiBoundary = clipConvex(worldPoly, rectangle(roi[0], roi[1], roi[2] - roi[0], roi[3] - roi[1]));
    if (roiBoundary.length < 3) continue;
    const roiAreaM2 = polygonArea(roiBoundary) * worldScale ** 2;
    const spacingM = Math.max(
      MIN_PARCEL_SPACING_M,
      targetSpacingM,
      Math.sqrt(roiAreaM2 / MAX_PARCELS / PARCEL_AREA_FACTOR)
    );
    const spacing = spacingM / worldScale;
    const angleSeed = cell.cultureId === undefined ? 0 : Math.imul(cell.cultureId + 1, 2654435761) >>> 0;
    const angle = (angleSeed / 4294967296) * Math.PI;
    const wavelength = Math.round(spacingM * 5);
    let cropNoise = cropNoiseCache.get(wavelength);
    if (!cropNoise) {
      cropNoise = createFieldNoise(seedKey, wavelength);
      cropNoiseCache.set(wavelength, cropNoise);
    }
    const reach = Math.max(cellBox[2] - cellBox[0], cellBox[3] - cellBox[1]);
    const near = (p: Point) =>
      p[0] > cellBox[0] - reach && p[0] < cellBox[2] + reach && p[1] > cellBox[1] - reach && p[1] < cellBox[3] + reach;
    const accessLines: Point[] = [...routePoints, ...riverPoints].filter(near);
    const nearest = (from: Point, set: Point[]) => {
      let best = Infinity;
      for (const p of set) best = Math.min(best, Math.hypot(p[0] - from[0], p[1] - from[1]));
      return best * scale;
    };
    const parcels = buildParcels({ boundary: roiBoundary, spacing, angle })
      .map(parcel => {
        const whole = parcel.pieces.map(piece => piece.map(toLocal));
        let pieces = whole;
        const box = unionBox(pieces);
        for (const blocker of blocking)
          if (boxesOverlap(blocker.box, box))
            pieces = pieces.flatMap(p => (polygonsOverlap(p, blocker.poly) ? subtractConvex(p, blocker.poly) : [p]));
        // Only pieces cut by a river, lake, road or building are pulled back: a hairline gap keeps them strictly
        // disjoint from it, while untouched neighbours still tile exactly.
        pieces = pieces
          .map(piece => (whole.includes(piece) ? piece : insetPiece(piece)))
          .filter(piece => {
            if (polygonArea(piece) < 1e-8) return false;
            const slope = approximateSlope(
              piece,
              doc.terrain.heightfield,
              doc.bounds.widthMeters / scale,
              doc.bounds.heightMeters / scale,
              scale
            );
            return slope === undefined || slope <= 0.35;
          });
        if (!pieces.length) return undefined;
        const center = toLocal(parcel.center);
        const noise = cropNoise!(parcel.center[0] * worldScale, parcel.center[1] * worldScale);
        const jitter = ((Math.imul(hashKey(parcel.key), 2246822519) >>> 0) / 4294967296) * 0.2;
        return {
          key: parcel.key,
          pieces,
          area: pieces.reduce((s, p) => s + polygonArea(p), 0),
          samples: sampleParcel(pieces),
          // Lower is better. Settlements pull hardest (distances are cell-scale), access lines give a local
          // pull, and coherent noise breaks the result into ragged clusters rather than a disc.
          score:
            (anchored ? Math.min(2, nearest(center, settlementSites) / 8000) * 0.9 : 0) +
            Math.min(3, nearest(center, accessLines) / 1500) * 0.3 +
            (1 - noise) * 0.8 +
            jitter
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== undefined);
    const used = new Set<string>();
    for (const { patch, footprint, target: wanted } of plans) {
      const forestLike = ["agroforestry", "wood_pasture", "managed_forest"].includes(patch.kind);
      const covered = (point: Point) =>
        footprint?.some(
          f =>
            point[0] >= f.box[0] &&
            point[0] <= f.box[2] &&
            point[1] >= f.box[1] &&
            point[1] <= f.box[3] &&
            pointInPolygon(point, f.poly)
        ) ?? false;
      // The FMG footprint fixes how much is placed and is a soft prior on where; access and settlement distance
      // decide the rest. Forest-like uses stay inside their footprint.
      const ranked = parcels
        .filter(p => !used.has(p.key))
        .map(parcel => {
          const coverage = footprint ? parcel.samples.filter(covered).length / parcel.samples.length : 1;
          return { parcel, coverage, rank: (1 - coverage) * 0.4 + parcel.score };
        })
        .filter(p => !footprint || p.coverage > 0 || !forestLike)
        .sort((a, b) => a.rank - b.rank || a.parcel.key.localeCompare(b.parcel.key))
        .map(p => p.parcel);
      let remaining = wanted;
      let overflow: (typeof parcels)[number] | undefined;
      const accepted: Array<{ parcel: (typeof parcels)[number]; pieces: Point[][] }> = [];
      for (const parcel of ranked) {
        if (remaining <= 1e-9) break;
        if (parcel.area <= remaining + 1e-9) {
          accepted.push({ parcel, pieces: parcel.pieces });
          used.add(parcel.key);
          remaining -= parcel.area;
        } else overflow ??= parcel;
      }
      // The parcel that does not fit is shrunk toward its centre so the budget is met exactly.
      if (remaining > 1e-9 && overflow) {
        accepted.push({ parcel: overflow, pieces: shrinkPiecesToArea(overflow.pieces, remaining) });
        used.add(overflow.key);
      }
      let placedHa = 0;
      for (const { parcel, pieces } of accepted)
        pieces.forEach((polygon, index) => {
          const areaHa = polygonArea(polygon) * areaScale;
          if (areaHa <= 1e-8) return;
          placedHa += areaHa;
          patches.push({
            ...patch,
            polygons: undefined,
            id: `${patch.id}:${parcel.key}${pieces.length > 1 ? `:${index}` : ""}`,
            anchor: toLocal(patch.anchor),
            polygon,
            areaHa,
            convertedForestAreaHa: patch.areaHa > 0 ? (patch.convertedForestAreaHa * areaHa) / patch.areaHa : 0
          });
        });
      unplacedAreaHa += Math.max(0, patch.areaHa - placedHa - retainedAreaHa(patch));
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
    const sourceBudget = cell.landUse ?? legacy?.cells[cell.sourceCellId ?? site.cells.indexOf(cell)];
    if (sourceBudget?.transportAllocations) {
      const placed = patches
        .filter(p => p.sourceCellId === sourceBudget.sourceCellId && p.kind === "cultivation")
        .reduce((s, p) => s + p.areaHa, 0);
      const fraction = sourceBudget.allocatedAreaHa > 0 ? Math.min(1, placed / sourceBudget.allocatedAreaHa) : 0;
      for (const allocation of sourceBudget.transportAllocations) {
        const demand = site.cells.find(c => (c.sourceCellId ?? site.cells.indexOf(c)) === allocation.demandCellId);
        if (!demand) continue;
        const demandBudget = demand.landUse ?? legacy?.cells[allocation.demandCellId];
        const demandPoly = (demand.polygon ?? []).map(toLocal);
        const cities = doc.settlements.filter(s => pointInPolygon(s.position, demandPoly));
        const urban = cities.reduce((s, c) => s + (c.population ?? 0), 0);
        const people = demandBudget?.foodDemandPeople ?? urban;
        if (people > 0 && people > (demandBudget?.ruralPeople ?? 0))
          for (const city of cities)
            city.farmlandAreaHectares =
              (city.farmlandAreaHectares ?? 0) + (allocation.areaHa * fraction * (city.population ?? 0)) / people;
      }
      continue;
    }
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
