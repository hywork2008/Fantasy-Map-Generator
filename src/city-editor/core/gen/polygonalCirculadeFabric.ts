// Polygonal concentric circulade (Bram-style) fabric generator.
// Subdivides the 3-tier polygonal core into straight-edged, contiguous row houses (maisons mitoyennes)
// along each facet of the N-sided polygon, respecting through-roads, radial venelles, and civic precincts.

import { facePoints } from "../mesh";
import type { CityDocument, Id, Point } from "../types";
import { nearestOnPolyline, pointInPolygon, polygonCentroid } from "./geom";
import type { PerimeterFabric } from "./perimeterBlocks";
import type { PolygonalCirculadePlan } from "./polygonalCirculadeLayout";

const lerp = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export interface PolygonalFabricOptions {
  seed: string;
  plan: PolygonalCirculadePlan;
}

/**
 * Generate fabric for the polygonal circulade core.
 * Dwellings align strictly with the straight facets of the concentric polygons.
 */
export function buildPolygonalCirculadeFabric(
  document: CityDocument,
  options: PolygonalFabricOptions
): PerimeterFabric {
  const fabric: PerimeterFabric = { buildings: [], lanes: [], entrances: new Map(), blocks: [] };
  const { plan } = options;
  const hub = plan.hub;

  // 1. Reserved civic landmarks & physical barriers
  const plazaElem = document.elements.find(e => e.kind === "plaza");
  const templeElem = document.elements.find(e => e.kind === "temple");

  const plazaCenter: Point = plazaElem?.point ?? plan.plaza.anchor;
  const plazaRadius = (plazaElem?.sizeMeters ? plazaElem.sizeMeters / 2 : (plan.plaza.radiusMeters ?? 10)) + 2.0;

  const templeCenter: Point | null = templeElem?.point ?? plan.temple?.anchor ?? null;
  const templeRadius = (templeElem?.sizeMeters ? templeElem.sizeMeters / 2 : (plan.temple?.radiusMeters ?? 0)) + 2.5;

  const reservedFaces = new Set(document.elements.flatMap(e => e.faceIds));

  // Find face owners for buildings
  const faceEntries = Object.values(document.mesh.faces).map(f => {
    const pts = facePoints(document.mesh, f);
    return {
      id: f.id,
      pts,
      c: polygonCentroid(pts)
    };
  });

  const findOwner = (p: Point): Id => {
    for (const entry of faceEntries) {
      if (pointInPolygon(p, entry.pts)) return entry.id;
    }
    let best = faceEntries[0]?.id ?? "f0";
    let bestDist = Infinity;
    for (const entry of faceEntries) {
      const d = dist(p, entry.c);
      if (d < bestDist) {
        bestDist = d;
        best = entry.id;
      }
    }
    return best;
  };

  // 2. Add lanes from the plan
  // Ring roads
  for (const ring of plan.ringRoads) {
    for (let i = 0; i < ring.length - 1; i++) {
      const p1 = ring[i];
      const p2 = ring[i + 1];
      const mid: Point = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      fabric.lanes.push({ faceId: findOwner(mid), points: [p1, p2], widthMeters: 4.2 });
    }
  }

  // Radial roads
  for (const radial of plan.radialRoads) {
    for (let i = 0; i < radial.length - 1; i++) {
      const p1 = radial[i];
      const p2 = radial[i + 1];
      const mid: Point = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      fabric.lanes.push({ faceId: findOwner(mid), points: [p1, p2], widthMeters: 3.2 });
    }
  }

  // Through road
  for (let i = 0; i < plan.throughRoad.length - 1; i++) {
    const p1 = plan.throughRoad[i];
    const p2 = plan.throughRoad[i + 1];
    const mid: Point = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
    fabric.lanes.push({ faceId: findOwner(mid), points: [p1, p2], widthMeters: 5.5 });
  }

  // 3. Generate polygonal row houses (maisons mitoyennes) along ring facets
  // Standard Bram dimensions:
  // - Ring street gap: 4.2m (half width = 2.1m setback from ring road center)
  // - House slit seam: 0.35m between contiguous row houses
  // - Radial venelle alley: 3.2m (half width = 1.6m setback from spoke corners)
  const streetGap = 4.2;
  const halfStreetGap = streetGap / 2; // 2.1m
  const slitMeters = 0.35; // 0.35m seam between row houses
  const venelleMargin = 1.6; // 1.6m at spoke corners (3.2m total)

  const N = plan.numFacets;

  // Polygonal baseline loops
  // Tier 0 is the plaza perimeter polygon (scaled to ~24m)
  const tier0Vertices: Point[] = [];
  for (let i = 0; i < N; i++) {
    const angle = plan.throughAngle + (i / N) * Math.PI * 2;
    tier0Vertices.push([hub[0] + Math.cos(angle) * 24, hub[1] + Math.sin(angle) * 24]);
  }

  const ringTiers: Point[][] = [tier0Vertices, plan.rings[0].vertices, plan.rings[1].vertices, plan.rings[2].vertices];

  for (let tier = 0; tier < 3; tier++) {
    const innerLoop = ringTiers[tier];
    const outerLoop = ringTiers[tier + 1];

    for (let facet = 0; facet < N; facet++) {
      const nextFacet = (facet + 1) % N;

      // 4 corners of the facet block
      const inA = innerLoop[facet];
      const inB = innerLoop[nextFacet];
      const outA = outerLoop[facet];
      const outB = outerLoop[nextFacet];

      const dA = dist(inA, outA);
      const dB = dist(inB, outB);
      const avgDepth = (dA + dB) / 2;
      if (avgDepth < streetGap + 8.0) continue;

      // Street setbacks: 2.1m from inner road, 2.1m from outer road -> exact 4.2m ring street
      const rIn = halfStreetGap / avgDepth;
      const rOut = 1.0 - halfStreetGap / avgDepth;
      const rMid = (rIn + rOut) / 2;

      // In tiers 2 and 3, create back-to-back rows with 0m gap between them (shared rear party wall)
      // In tier 1, create 1 row
      const hasBackToBack = tier >= 1;
      const rowSplits: [number, number][] = hasBackToBack
        ? [
            [rIn, rMid], // Inner row facing inwards
            [rMid, rOut] // Outer row facing outwards
          ]
        : [[rIn, rOut]];

      // Block frontage along this facet
      const innerLen = dist(inA, inB);
      const outerLen = dist(outA, outB);
      const midLen = (innerLen + outerLen) / 2;

      const mStart = Math.min(midLen * 0.25, venelleMargin);
      const mEnd = Math.max(midLen * 0.75, midLen - venelleMargin);
      const usableSpanMeters = mEnd - mStart;
      if (usableSpanMeters < 6.0) continue;

      // Number of row houses (frontage ~6.0m, Bram standard)
      const targetLotFrontage = 6.0;
      const numHouses = Math.max(1, Math.min(6, Math.round(usableSpanMeters / targetLotFrontage)));
      const lotPitch = usableSpanMeters / numHouses;

      for (const [rowInner, rowOuter] of rowSplits) {
        for (let h = 0; h < numHouses; h++) {
          const m0 = mStart + h * lotPitch + slitMeters / 2;
          const m1 = mStart + (h + 1) * lotPitch - slitMeters / 2;
          if (m1 <= m0) continue;

          const t0 = m0 / midLen;
          const t1 = m1 / midLen;

          // 4 corners of the straight row lot
          const ptInnerStart = lerp(inA, inB, t0);
          const ptInnerEnd = lerp(inA, inB, t1);
          const ptOuterStart = lerp(outA, outB, t0);
          const ptOuterEnd = lerp(outA, outB, t1);

          const c0 = lerp(ptInnerStart, ptOuterStart, rowInner);
          const c1 = lerp(ptInnerEnd, ptOuterEnd, rowInner);
          const c2 = lerp(ptInnerEnd, ptOuterEnd, rowOuter);
          const c3 = lerp(ptInnerStart, ptOuterStart, rowOuter);

          const lotPoly: Point[] = [c0, c1, c2, c3];
          const center: Point = [(c0[0] + c1[0] + c2[0] + c3[0]) / 4, (c0[1] + c1[1] + c2[1] + c3[1]) / 4];

          // Collision check with plaza
          if (dist(center, plazaCenter) < plazaRadius) continue;

          // Collision check with temple
          if (templeCenter && dist(center, templeCenter) < templeRadius) continue;

          // Collision check with through-road
          let hitThrough = false;
          for (let k = 0; k < plan.throughRoad.length - 1; k++) {
            if (nearestOnPolyline(center, [plan.throughRoad[k], plan.throughRoad[k + 1]]).dist < 5.0) {
              hitThrough = true;
              break;
            }
          }
          if (hitThrough) continue;

          // Find face owner
          const ownerFaceId = findOwner(center);
          if (reservedFaces.has(ownerFaceId)) continue;

          fabric.buildings.push({
            faceId: ownerFaceId,
            polygon: lotPoly,
            landmark: false
          });
        }
      }
    }
  }

  return fabric;
}
