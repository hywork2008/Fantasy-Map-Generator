import * as THREE from "three";
import { placeableObject } from "../../../../buildings/placeableObjects";
import { frontAxisOf, rotationFromFacing } from "../../../../buildings/placementContract";
import { placementDefinition, placementFootprint, placementQuality } from "../../../../buildings/placementModels";
import { parseFreeformCity } from "../../../generators/freeform/freeformCity";
import { nearestOnPolyline, polygonCentroid } from "../../../generators/geom";
import { createVectorDocument } from "../../../generators/vector/document";
import { rebuildRoadGraph } from "../../../generators/vector/editing/network";
import { curveSource } from "../../../generators/vector/editing/paths";
import { adoptFreeformBridges } from "../../../generators/vector/freeformBridges";
import { nearestRoadAnchor } from "../../../generators/vector/generation/urbanPacking";
import { evaluateAnchor } from "../../../generators/vector/geometry/curves";
import { regionBoolean } from "../../../generators/vector/geometry/regions";
import { pathSurface } from "../../../generators/vector/geometry/surfaces";
import { assertVectorDocument } from "../../../generators/vector/validation/document";
import type { FreeformCity } from "../../../types/freeformCity";
import type { HistoricalPeriod, Point } from "../../../types/primitives";
import type { VectorCityDocument, VectorPath } from "../../../types/vector/document";
/** Explicit import: Freeform's source ledger and pad levels remain available for a lossless return. */
export function vectorFromFreeform(
  source: FreeformCity,
  fallbackPeriod: HistoricalPeriod = "ageOfExploration"
): VectorCityDocument {
  const city = parseFreeformCity(JSON.stringify(source));
  if (!city) throw Error("freeform-invalid");
  const doc = createVectorDocument("freeform", city.frame.extentMeters);
  doc.context.historicalPeriod = city.historicalPeriod ?? fallbackPeriod;
  doc.environment = {
    features: {},
    hidden: [],
    terrain: structuredClone(city),
    freeformSource: structuredClone(source)
  };
  for (const way of city.ways) {
    const id = `freeform:way:${way.id}`;
    doc.paths[id] = {
      id,
      revision: 0,
      role: "road",
      origin: "imported",
      editPolicy: "fixed",
      source: curveSource(way.centerline, "polyline", false),
      width: { leftMeters: way.widthMeters / 2, rightMeters: way.widthMeters / 2, stations: [] }
    };
  }
  for (const river of city.rivers) {
    const id = `freeform:river:${river.id}`,
      path: VectorPath = {
        id,
        revision: 0,
        role: "river",
        origin: "imported",
        editPolicy: "fixed",
        source: curveSource(river.centerline, "polyline", false),
        width: {
          leftMeters: river.widthsMeters[0] / 2,
          rightMeters: river.widthsMeters[0] / 2,
          stations: [],
          interpolation: "linear"
        }
      };
    river.widthsMeters.forEach((w, i) => {
      path.width.stations.push({
        anchor: {
          pathId: id,
          segmentId: `segment:${Math.min(i, river.centerline.length - 2)}`,
          t: i === river.centerline.length - 1 ? 1 : 0
        },
        leftMeters: w / 2,
        rightMeters: w / 2
      });
    });
    doc.paths[id] = path;
  }
  for (const zone of city.zones) {
    const id = `freeform:zone:${zone.id}`;
    doc.regions[id] = { id, kind: zone.kind, outer: structuredClone(zone.polygon), holes: [] };
  }
  for (const p of city.placements) {
    const activity =
      p.marketActivity ?? (!p.locked ? city.markets?.find(m => m.stallElementIds.includes(p.id))?.activity : undefined);
    const footprint = placementFootprint(p.modelId, p.quality),
      plot = city.plots.find(plot => plot.id === p.plotId);
    if (!footprint || !plot) throw Error(`freeform-model:${p.id}`);
    const angle = rotationFromFacing(frontAxisOf(p.modelId), p.facingDegrees),
      c = Math.cos(angle),
      s = Math.sin(angle);
    const outer: Point[] = [
      [-footprint.halfX, -footprint.halfZ],
      [footprint.halfX, -footprint.halfZ],
      [footprint.halfX, footprint.halfZ],
      [-footprint.halfX, footprint.halfZ]
    ].map(([x, z]) => [p.position[0] + x * c + z * s, p.position[1] + x * s - z * c]);
    const id = `freeform:placement:${p.id}`;
    const definition = placementDefinition(p.modelId, p.quality, p.palette, { activity }),
      model = definition?.create() ?? placeableObject(p.modelId)?.create();
    let height = 6;
    if (model) {
      try {
        const bounds = new THREE.Box3().setFromObject(model.group, true);
        height = bounds.max.y - bounds.min.y;
      } finally {
        model.dispose();
      }
    }
    doc.placements[id] = {
      id,
      modelId: p.modelId,
      position: structuredClone(p.position),
      facingDegrees: ((((angle * 180) / Math.PI) % 360) + 360) % 360,
      origin: "imported",
      editPolicy: p.locked ? "fixed" : "editable",
      site: { outer: structuredClone(plot.outline), holes: [] },
      accesses: [],
      display: {
        kind: "object",
        heightMeters: height,
        footprint: [{ outer, holes: [] }],
        provenance: "copied",
        note: "Freeform footprint and authored pad level retained; model detail follows its saved appearance."
      },
      appearance: {
        quality: placementQuality(p.modelId, p.quality) ?? p.quality ?? "low",
        ...(p.palette ? { palette: p.palette } : {}),
        ...(activity ? { activity } : {})
      }
    };
  }
  for (const [index, market] of (city.markets ?? []).entries()) {
    const boundary = { outer: structuredClone(market.boundary), holes: [] },
      center = polygonCentroid(boundary.outer),
      roads = Object.values(doc.paths).filter(p => p.role === "road");
    const nearest = roads
      .map(p => ({ path: p, anchor: nearestRoadAnchor(p, center) }))
      .sort((a, b) => {
        const x = evaluateAnchor(a.path, a.anchor),
          y = evaluateAnchor(b.path, b.anchor);
        return Math.hypot(x[0] - center[0], x[1] - center[1]) - Math.hypot(y[0] - center[0], y[1] - center[1]);
      })[0];
    if (!nearest) throw Error("freeform-market-access");
    const target = evaluateAnchor(nearest.path, nearest.anchor),
      entrance = nearestOnPolyline(target, [...boundary.outer, boundary.outer[0]]).point,
      id = `feature:freeform-market:${index + 1}`;
    const corridors = [
      ...market.accessPaths.map(p => ({ line: p, width: 4 })),
      ...(market.cargoAccessPaths ?? []).map(p => ({ line: p, width: 4 }))
    ].map((p, i) => ({
      id: `${id}:route:${i + 1}`,
      role: "ground" as const,
      polygon: pathSurface({
        id: `market-route:${i + 1}`,
        role: "road",
        revision: 0,
        origin: "imported",
        editPolicy: "fixed",
        source: curveSource(p.line, "polyline", false),
        width: { leftMeters: p.width / 2, rightMeters: p.width / 2, stations: [] }
      }),
      heightMeters: 0.02,
      color: "#c7ae84"
    }));
    doc.environment!.features[id] = {
      id,
      kind: "market",
      boundary,
      access: nearest.anchor,
      entrance,
      connector: [entrance, target],
      pathIds: [],
      placementIds: market.stallElementIds.map(id => `freeform:placement:${id}`),
      pieces: corridors.flatMap(piece =>
        regionBoolean([piece.polygon], [boundary], "intersection").map((polygon, index) => ({
          ...piece,
          id: `${piece.id}:${index}`,
          polygon
        }))
      ),
      settings: {
        density: 1,
        heightMeters: 30,
        activity: market.activity ?? "market-day",
        culture: "timber",
        moatWidthMeters: 0
      },
      editPolicy: "editable"
    };
  }
  adoptFreeformBridges(doc);
  rebuildRoadGraph(doc);
  doc.revision++;
  assertVectorDocument(doc);
  return doc;
}
export function restoreVectorFreeform(doc: VectorCityDocument): FreeformCity | null {
  // This is the original ledger, deliberately distinct from exporting later vector edits.
  return doc.environment?.freeformSource ? structuredClone(doc.environment.freeformSource) : null;
}
