import {
  bridgeSkewDegrees,
  bridgeSkewTierForPeriod,
  bridgeStructureForRouteGroup,
  resolveBridgeSkewLimit,
  withinBridgeSkewLimit
} from "../../../../utils/bridgeSkewPolicy";
import { FIXED_SITE_CROSSING_BUDGETS, validFixedBurgCrossings } from "../../../../utils/fixedBurgCrossings";
import type { BurgSiteDescriptor } from "../../../types/contracts/burgSiteDescriptor";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument, VectorPath } from "../../../types/vector/document";
import type { VectorPolygon, VectorSite } from "../../../types/vector/generation";
import { closeCorridor } from "../../generation/skeleton/vector";
import { azimuthToVec, segmentsIntersect } from "../../geom";
import { makeRng } from "../../prng";
import { coarseFromHeightfield } from "../../terrainField/build";
import { createVectorDocument } from "../document";
import { connectVectorAnchors, rebuildRoadGraph } from "../editing/network";
import { curveSource } from "../editing/paths";
import { containsRegion, regionBoolean } from "../geometry/regions";
import { allVectorWater } from "../geometry/water";
import { assertVectorDocument } from "../validation/document";

const copy = (p: readonly number[]): Point => [p[0], p[1]];
export const siteDisk = (center: Point, radius: number): VectorPolygon => ({
  outer: Array.from(
    { length: 128 },
    (_, i): Point => [
      center[0] + radius * Math.cos((i * Math.PI) / 64),
      center[1] + radius * Math.sin((i * Math.PI) / 64)
    ]
  ),
  holes: []
});
const importedPath = (id: string, role: VectorPath["role"], points: Point[], width: number): VectorPath => ({
  id,
  role,
  revision: 0,
  origin: "imported",
  editPolicy: "fixed",
  source: curveSource(points, "polyline", false),
  width: { leftMeters: width / 2, rightMeters: width / 2, stations: [] }
});
/** Where the segment from inside point `a` to `b` leaves the square window of half size `half`. */
function windowExit(a: Point, b: Point, half: number): Point {
  let t = 1;
  for (const axis of [0, 1])
    if (b[axis] !== a[axis]) {
      const edge = b[axis] > a[axis] ? half : -half,
        at = (edge - a[axis]) / (b[axis] - a[axis]);
      if (at >= 0 && at < t) t = at;
    }
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
/**
 * A river course cut at the window. The synthesized course can step past the window and then end on its edge,
 * turning back on itself; a ribbon around that end folds. Leading and trailing points outside or on the edge give
 * way to the point where the course crosses the edge, with the width of the inside neighbour.
 */
function trimToWindow(points: Point[], widths: number[], half: number) {
  const inside = (p: Point) => Math.abs(p[0]) < half - 1e-6 && Math.abs(p[1]) < half - 1e-6,
    first = points.findIndex(inside),
    last = points.findLastIndex(inside);
  if (first < 0 || (first === 0 && last === points.length - 1)) return { points, widthsMeters: widths };
  const kept = points.slice(first, last + 1),
    keptWidths = widths.slice(first, last + 1);
  if (first > 0) {
    kept.unshift(windowExit(points[first], points[first - 1], half));
    keptWidths.unshift(widths[first]);
  }
  if (last < points.length - 1) {
    kept.push(windowExit(points[last], points[last + 1], half));
    keptWidths.push(widths[last]);
  }
  return { points: kept, widthsMeters: keptWidths };
}
function seal(doc: VectorCityDocument, site: VectorSite): VectorCityDocument {
  doc.site = site;
  const heightfield = site.descriptor?.terrain.heightfield;
  if (heightfield && doc.frame.extentMeters <= 10000) {
    const coarse = coarseFromHeightfield(heightfield.size, heightfield.spacingMeters, heightfield.elevationsMeters);
    if (coarse)
      doc.environment = {
        features: {},
        hidden: [],
        terrain: {
          format: "fmg-freeform-city",
          version: 1,
          frame: structuredClone(doc.frame),
          ground: {
            version: 1,
            template: "cells",
            seed: 1,
            sampleMeters: Math.max(2, doc.frame.extentMeters / 128),
            parts: [{ kind: "coarse", ...coarse }]
          },
          sculpt: [],
          plots: [],
          placements: [],
          ways: [],
          rivers: [],
          zones: []
        }
      };
  }
  if (!containsRegion(site.domain, site.center) || containsRegion(allVectorWater(doc), site.center))
    throw new Error("site-center-water");
  rebuildRoadGraph(doc);
  assertVectorDocument(doc);
  return doc;
}
export function vectorInputFromDescriptor(descriptor: BurgSiteDescriptor): VectorCityDocument {
  const d = structuredClone(descriptor),
    fixed = d.fixedCrossings;
  if (fixed && !validFixedBurgCrossings(fixed, FIXED_SITE_CROSSING_BUDGETS)) throw new Error("fixed-input-invalid");
  if (!(d.frame.extentMeters > 0 && d.frame.cityRadiusMeters > 0 && d.frame.metersPerMapUnit > 0))
    throw new Error("site-frame");
  if (d.regionalSurface?.unknown.some(r => containsRegion([{ outer: r, holes: [] }], [0, 0])))
    throw new Error("site-unknown");
  let doc = createVectorDocument(d.burg.seed, d.frame.extentMeters);
  doc.context.historicalPeriod = d.historicalPeriod ?? "highMedieval";
  doc.context.targetPopulation = Math.max(0, Math.round(d.burg.population));
  const allowance = resolveBridgeSkewLimit(doc.context.historicalPeriod, d.transport);
  doc.context.bridgeSkewTier = Math.max(
    bridgeSkewTierForPeriod(doc.context.historicalPeriod),
    allowance > 25 ? 2 : allowance > 20 ? 1 : 0
  ) as 0 | 1 | 2;
  // Exporters already recenter local geometry and originMapUnits; the historical offset is provenance.
  const center: Point = [0, 0],
    site: VectorSite = {
      kind: "fmg",
      id: `fmg-burg:${d.burg.id}`,
      revision: fixed?.revision ?? 0,
      transform: {
        originMapUnits: copy(d.frame.originMapUnits),
        metersPerMapUnit: d.frame.metersPerMapUnit,
        localAxes: "east-north"
      },
      center,
      domain: [siteDisk(center, d.frame.cityRadiusMeters)],
      water: [],
      fixedPaths: [],
      crossings: [],
      descriptor: d
    };
  if (d.regionalSurface?.unknown.length)
    site.domain = regionBoolean(
      site.domain,
      d.regionalSurface.unknown.map(r => ({ outer: r.map(copy), holes: [] })),
      "difference"
    );
  const witnesses = new Map<string, { pathId: string; segmentId: string; t: number }>();
  for (const crossing of fixed?.crossings ?? []) {
    const id = `fmg-river:${crossing.riverId}:${crossing.geometryVersion}`,
      segmentId = `witness:${crossing.geometryVersion}`,
      controls = crossing.witness.controls;
    const existing = doc.paths[id];
    const source =
      crossing.witness.kind === "cubic"
        ? {
            kind: "curve" as const,
            closed: false,
            segments: [
              {
                id: segmentId,
                kind: "cubic" as const,
                from: copy(controls[0]),
                control1: copy(controls[1]),
                control2: copy(controls[2]),
                to: copy(controls[3])
              }
            ]
          }
        : {
            kind: "curve" as const,
            closed: false,
            segments: [{ id: segmentId, kind: "line" as const, from: copy(controls[0]), to: copy(controls[1]) }]
          };
    const river = d.rivers.find(r => r.riverId === crossing.riverId);
    if (!river) throw new Error("fixed-input-invalid");
    const width = river.widthMeters;
    if (existing && JSON.stringify(existing.source) !== JSON.stringify(source))
      throw new Error("fixed-witness-conflict");
    doc.paths[id] = {
      id,
      role: "river",
      revision: 0,
      origin: "imported",
      editPolicy: "fixed",
      source,
      width: { leftMeters: width / 2, rightMeters: width / 2, stations: [] }
    };
    witnesses.set(String(crossing.id), { pathId: id, segmentId, t: crossing.witness.parameter });
  }
  for (const river of d.rivers) {
    const surveyed = fixed?.rivers.find(r => r.id === river.riverId),
      witnessPaths = Object.keys(doc.paths).filter(id => id.startsWith(`fmg-river:${river.riverId}:`));
    if (witnessPaths.length) {
      for (const id of witnessPaths) {
        if (!surveyed?.rings.length) throw new Error("fixed-water-missing");
        site.water.push({
          id: `water:${id}`,
          riverPathId: id,
          polygons: [{ outer: surveyed.rings[0].map(copy), holes: surveyed.rings.slice(1).map(r => r.map(copy)) }]
        });
      }
    } else
      for (let i = 0; i < river.segments.length; i++) {
        const segment = trimToWindow(
            river.segments[i].points,
            river.segments[i].widthsMeters,
            doc.frame.extentMeters / 2
          ),
          id = `fmg-river:${river.riverId}:segment:${i}`;
        doc.paths[id] = importedPath(id, "river", segment.points.map(copy), river.widthMeters);
        segment.widthsMeters.forEach((width, j) => {
          if (j > 0 && j < segment.points.length - 1)
            doc.paths[id].width.stations.push({
              anchor: { pathId: id, segmentId: `segment:${j}`, t: 0 },
              leftMeters: width / 2,
              rightMeters: width / 2
            });
        });
        if (surveyed?.rings.length)
          site.water.push({
            id: `water:${id}`,
            riverPathId: id,
            polygons: [{ outer: surveyed.rings[0].map(copy), holes: surveyed.rings.slice(1).map(r => r.map(copy)) }]
          });
        else if (river.leftBankSegments[i]?.length && river.rightBankSegments[i]?.length)
          site.water.push({
            id: `water:${id}`,
            riverPathId: id,
            polygons: [
              {
                outer: [...river.leftBankSegments[i].map(copy), ...river.rightBankSegments[i].map(copy).reverse()],
                holes: []
              }
            ]
          });
      }
  }
  for (const obstacle of fixed?.obstacles ?? [])
    site.water.push({
      id: `fmg-water:${obstacle.id}`,
      polygons: [{ outer: obstacle.rings[0].map(copy), holes: obstacle.rings.slice(1).map(r => r.map(copy)) }]
    });
  for (const [i, feature] of (d.regionalSurface?.features ?? []).entries())
    if (feature.kind === "water")
      site.water.push({ id: `fmg-regional-water:${i}`, polygons: [{ outer: feature.ring.map(copy), holes: [] }] });
  if (d.waterbody && !site.water.some(w => !w.riverPathId)) {
    for (const [i, line] of d.waterbody.shoreline.entries()) {
      // As the mesh skeleton does: a shoreline reaching past the window closes on a square around it instead,
      // or the closing walk along the window crosses the shoreline.
      const shore = line.map(copy),
        polygon = closeCorridor(
          shore,
          azimuthToVec(d.waterbody.shoreAzimuthDeg),
          Math.max(doc.frame.extentMeters / 2, ...shore.map(p => Math.max(Math.abs(p[0]), Math.abs(p[1])))) + 1
        );
      if (!polygon) throw new Error("coastal-coverage-missing");
      site.water.push({ id: `fmg-coast:${i}`, polygons: [{ outer: polygon, holes: [] }] });
    }
    if (!site.water.some(w => !w.riverPathId)) throw new Error("coastal-coverage-missing");
  }
  for (const [i, road] of d.roads.entries())
    if (road.group !== "searoutes") {
      const id = `fmg-road:${road.routeId}:${i}`;
      doc.paths[id] = importedPath(id, "road", road.path.map(copy), fixed?.roadWidthMeters ?? 5);
      for (const [j, branch] of (road.sharedBranches ?? []).entries()) {
        const branchId = `fmg-branch:${road.routeId}:${i}:${j}`;
        doc.paths[branchId] = importedPath(branchId, "road", branch.path.map(copy), fixed?.roadWidthMeters ?? 5);
      }
    }
  // Fixed deck and approaches are copied, not refitted to the derived river band or a city mesh.
  for (const crossing of fixed?.crossings ?? []) {
    const roadId = `fmg-crossing:${crossing.id}`,
      bridgeId = `fmg-bridge:${crossing.id}`,
      id = crossing.id;
    doc.paths[roadId] = importedPath(
      roadId,
      "road",
      [crossing.approachA, crossing.deckA, crossing.deckB, crossing.approachB].map(copy),
      fixed!.roadWidthMeters
    );
    const structure = bridgeStructureForRouteGroup(d.roads.find(r => r.sharedCrossingId === crossing.id)?.group);
    if (
      !withinBridgeSkewLimit(
        bridgeSkewDegrees(crossing.normal, crossing.tangent),
        resolveBridgeSkewLimit(doc.context.historicalPeriod, d.transport, structure)
      )
    )
      throw new Error("fixed-input-invalid");
    doc.connections.bridges[bridgeId] = {
      id: bridgeId,
      roadPathId: roadId,
      riverAnchor: witnesses.get(String(id))!,
      from: { pathId: roadId, segmentId: "segment:1", t: 0 },
      to: { pathId: roadId, segmentId: "segment:1", t: 1 },
      structure,
      dryLandingMeters: 0.01,
      editPolicy: "fixed"
    };
    site.crossings.push({
      id,
      riverId: crossing.riverId,
      geometryVersion: crossing.geometryVersion,
      bridgeId,
      routeIds: [
        ...new Set(
          d.roads
            .filter(r => r.sharedCrossingId === id)
            .flatMap(r => [r.routeId, ...(r.sharedRouteIds ?? []), ...(r.sharedBranches?.map(b => b.routeId) ?? [])])
        )
      ].sort((a, b) => a - b),
      waterA: copy(crossing.waterA),
      waterB: copy(crossing.waterB),
      deckA: copy(crossing.deckA),
      deckB: copy(crossing.deckB),
      approachA: copy(crossing.approachA),
      approachB: copy(crossing.approachB)
    });
  }
  // Attach surveyed water before the shared bridge validator runs.
  doc.site = { ...site, fixedPaths: [] };
  for (const crossing of fixed?.crossings ?? []) {
    const crossingPath = `fmg-crossing:${crossing.id}`;
    for (const [i, road] of d.roads.entries())
      if (road.sharedCrossingId === crossing.id) {
        const pathId = `fmg-road:${road.routeId}:${i}`,
          path = doc.paths[pathId];
        if (path?.source.kind !== "curve") continue;
        const end = path.source.segments.at(-1)!,
          a = crossing.approachA,
          b = crossing.approachB,
          point = end.to;
        const distance = (p: readonly number[]) => Math.hypot(point[0] - p[0], point[1] - p[1]);
        if (Math.min(distance(a), distance(b)) > 1e-6) throw new Error("fixed-route-disconnected");
        doc = connectVectorAnchors(
          doc,
          {
            pathId: crossingPath,
            segmentId: distance(a) < distance(b) ? "segment:0" : "segment:2",
            t: distance(a) < distance(b) ? 0 : 1
          },
          { pathId, segmentId: end.id, t: 1 }
        );
        for (const [j] of (road.sharedBranches ?? []).entries()) {
          const branchId = `fmg-branch:${road.routeId}:${i}:${j}`,
            branch = doc.paths[branchId],
            far = distance(a) < distance(b) ? b : a;
          if (branch.source.kind !== "curve") throw new Error("fixed-route-disconnected");
          const access = branch.source.segments.flatMap(segment => {
            const dx = segment.to[0] - segment.from[0],
              dy = segment.to[1] - segment.from[1],
              t = ((far[0] - segment.from[0]) * dx + (far[1] - segment.from[1]) * dy) / (dx * dx + dy * dy);
            return t >= -1e-9 &&
              t <= 1 + 1e-9 &&
              Math.hypot(segment.from[0] + dx * t - far[0], segment.from[1] + dy * t - far[1]) < 1e-6
              ? [{ pathId: branchId, segmentId: segment.id, t: Math.max(0, Math.min(1, t)) }]
              : [];
          })[0];
          if (!access) throw new Error("fixed-route-disconnected");
          doc = connectVectorAnchors(
            doc,
            {
              pathId: crossingPath,
              segmentId: distance(a) < distance(b) ? "segment:2" : "segment:0",
              t: distance(a) < distance(b) ? 1 : 0
            },
            access
          );
        }
      }
  }
  const bounds = fixed?.requiredBounds ?? d.frame.requiredBounds;
  if (bounds)
    doc.frame.extentMeters = Math.max(
      doc.frame.extentMeters,
      2 * Math.max(Math.abs(bounds.minX), Math.abs(bounds.maxX), Math.abs(bounds.minY), Math.abs(bounds.maxY)) + 20
    );
  site.fixedPaths = Object.values(doc.paths).map(p => structuredClone(p));
  return seal(doc, site);
}
const RIVER_WIDTH = 16;
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
/** Whether the open polyline stays farther than `gap` from the closed ring without crossing it. */
function riverClears(line: Point[], ring: Point[], gap: number): boolean {
  for (let i = 1; i < line.length; i++)
    for (let j = 0; j < ring.length; j++) {
      const a = ring[j],
        b = ring[(j + 1) % ring.length];
      if (
        segmentsIntersect(line[i - 1], line[i], a, b) ||
        segmentDistance(a, line[i - 1], line[i]) < gap ||
        segmentDistance(line[i], a, b) < gap ||
        segmentDistance(line[i - 1], a, b) < gap
      )
        return false;
    }
  return true;
}
/**
 * Synthetic standalone site. Without `vary` the layout is the fixed reference
 * (east-west river, four cardinal roads). With `vary` the seed picks the river
 * bearing, offset and bend and the number and bearings of the approach roads.
 */
export function syntheticVectorInput(
  seed = "meshless",
  radius = 150,
  river = true,
  vary = false,
  /** Rings the varied river keeps clear of, e.g. the civic precinct. */
  keepClear: Point[][] = []
): VectorCityDocument {
  if (!(radius >= 30 && radius <= 3000 && Number.isFinite(radius))) throw new Error("site-frame");
  const doc = createVectorDocument(seed, radius * 3),
    site: VectorSite = {
      kind: "synthetic",
      id: "synthetic-site",
      revision: 0,
      transform: { originMapUnits: [0, 0], metersPerMapUnit: 1, localAxes: "east-north" },
      center: [0, 0],
      domain: [siteDisk([0, 0], radius)],
      water: [],
      fixedPaths: [],
      crossings: []
    };
  const rng = makeRng(`synthetic-site:${seed}`),
    reference = {
      normal: [0, 1] as Point,
      side: 1,
      offset: radius * 0.3,
      points: [
        [-radius * 1.5, radius * 0.3],
        [radius * 1.5, radius * 0.3]
      ] as Point[]
    };
  let layout = reference;
  // A varied river is redrawn until it clears the reserved rings; the reference layout is the fallback.
  for (let attempt = 0; vary && attempt < 24; attempt++) {
    const bearing = rng.range(0, Math.PI),
      along: Point = [Math.cos(bearing), Math.sin(bearing)],
      normal: Point = [-along[1], along[0]],
      at = (u: number, v: number): Point => [along[0] * u + normal[0] * v, along[1] * u + normal[1] * v],
      side = rng() < 0.5 ? -1 : 1,
      offset = side * rng.range(0.2, 0.4) * radius,
      // The bend only bulges away from the centre and stays mild, so every in-town crossing
      // keeps within the bridge skew limits.
      bend = side * rng.range(0, 0.06) * radius,
      points = [at(-radius * 1.5, offset), at(0, offset + bend), at(radius * 1.5, offset)];
    if (!river || keepClear.every(ring => riverClears(points, ring, RIVER_WIDTH / 2 + 12))) {
      layout = { normal, side, offset, points };
      break;
    }
  }
  const { normal, side, offset, points: riverPoints } = layout;
  if (river) doc.paths["input-river"] = importedPath("input-river", "river", riverPoints, RIVER_WIDTH);
  const beyondRiver = (p: Point) => river && Math.sign(p[0] * normal[0] + p[1] * normal[1] - offset) === side;
  let roads: Point[];
  if (vary) {
    const count = rng.int(3, 6),
      start = rng.range(0, 2 * Math.PI),
      out = radius * 1.4;
    roads = [];
    // Approaches on the town side of the river enter from any bearing.
    for (let i = 0; i < count; i++) {
      const angle = start + ((i + rng.range(-0.25, 0.25)) / count) * 2 * Math.PI,
        p: Point = [Math.cos(angle) * out, Math.sin(angle) * out];
      if (!beyondRiver(p)) roads.push(p);
    }
    // One approach crosses the river close to its normal so its bridge stays square to the flow.
    if (river) {
      const skew = rng.range(-8, 8) * (Math.PI / 180),
        n: Point = [side * normal[0], side * normal[1]];
      roads.push([
        (n[0] * Math.cos(skew) - n[1] * Math.sin(skew)) * out,
        (n[0] * Math.sin(skew) + n[1] * Math.cos(skew)) * out
      ]);
    }
  } else
    roads = [
      [radius * 1.4, 0],
      [0, -radius * 1.4],
      [-radius * 1.4, 0],
      [0, radius * 1.4]
    ];
  for (const [i, p] of roads.entries()) {
    const endpoint: Point = [(p[0] / 1.4) * 0.85, (p[1] / 1.4) * 0.85],
      id = `input-road:${i}`;
    doc.paths[id] = importedPath(id, "road", [p, endpoint], 5);
  }
  site.fixedPaths = Object.values(doc.paths).map(p => structuredClone(p));
  return seal(doc, site);
}
