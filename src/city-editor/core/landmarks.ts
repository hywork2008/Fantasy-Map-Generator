import { pointInPolygon, segmentSegmentHit } from "./gen/geom";
import { facePoints } from "./mesh";
import type { CityDocument, LandmarkAsset, LandmarkInstance, LandmarkPolygon, Point } from "./types";

const finitePoint = (point: Point): boolean => point.length === 2 && point.every(Number.isFinite);

export function transformLandmarkPoint(
  point: Point,
  instance: Pick<LandmarkInstance, "position" | "rotation" | "scale">
): Point {
  const c = Math.cos(instance.rotation) * instance.scale;
  const s = Math.sin(instance.rotation) * instance.scale;
  return [instance.position[0] + point[0] * c - point[1] * s, instance.position[1] + point[0] * s + point[1] * c];
}

export function transformLandmarkPolygons(
  polygons: LandmarkPolygon[],
  instance: Pick<LandmarkInstance, "position" | "rotation" | "scale">
): LandmarkPolygon[] {
  return polygons.map(polygon => ({
    outer: polygon.outer.map(point => transformLandmarkPoint(point, instance)),
    holes: polygon.holes.map(hole => hole.map(point => transformLandmarkPoint(point, instance)))
  }));
}

function ringEdges(ring: Point[]): Array<[Point, Point]> {
  return ring.map((point, i) => [point, ring[(i + 1) % ring.length]]);
}

function inFilledPolygon(point: Point, polygon: LandmarkPolygon): boolean {
  return pointInPolygon(point, polygon.outer) && !polygon.holes.some(hole => pointInPolygon(point, hole));
}

/** Positive-area intersection, respecting courtyard holes and concave boundaries. */
export function polygonIntersectsLandmark(polygon: Point[], site: LandmarkPolygon[]): boolean {
  return site.some(part => {
    const rings = [part.outer, ...part.holes];
    if (polygon.some(point => inFilledPolygon(point, part))) return true;
    if (
      part.outer.some(point => pointInPolygon(point, polygon)) &&
      !part.outer.every(point => part.holes.some(hole => pointInPolygon(point, hole)))
    )
      return true;
    for (const [a, b] of ringEdges(polygon)) {
      for (const ring of rings) {
        for (const [c, d] of ringEdges(ring)) {
          const hit = segmentSegmentHit(a, b, c, d);
          if (hit && hit.t > 1e-6 && hit.t < 1 - 1e-6) return true;
        }
      }
    }
    return false;
  });
}

export function landmarkReservationHits(document: CityDocument, polygon: Point[]): boolean {
  return (document.landmarks ?? []).some(instance => polygonIntersectsLandmark(polygon, instance.site));
}

/** Place one asset atomically. Rejected placements leave the original document untouched. */
export function placeLandmark(
  document: CityDocument,
  asset: LandmarkAsset,
  placement: Pick<LandmarkInstance, "id" | "position" | "rotation" | "scale">
): { document: CityDocument | null; reasons: string[] } {
  const site = transformLandmarkPolygons(asset.minimumSite, placement);
  const reasons: string[] = [];
  if (
    !finitePoint(placement.position) ||
    !Number.isFinite(placement.rotation) ||
    !Number.isFinite(placement.scale) ||
    placement.scale <= 0 ||
    validateLandmarks({ ...document, version: 3, landmarkAssets: [asset], landmarks: [] }).length
  )
    reasons.push("Invalid landmark asset or transform");
  const half = document.frame.extentMeters / 2;
  if (site.some(part => part.outer.some(([x, y]) => Math.abs(x) > half || Math.abs(y) > half)))
    reasons.push("Outside map frame");
  if ((document.landmarks ?? []).some(other => other.id === placement.id)) reasons.push("Duplicate landmark ID");
  for (const face of Object.values(document.mesh.faces)) {
    if (!site.some(part => polygonIntersectsLandmark(facePoints(document.mesh, face), [part]))) continue;
    if (
      face.properties.water !== "land" ||
      !face.properties.buildable ||
      face.properties.locked ||
      face.properties.ward === "castle" ||
      face.properties.ward === "cemetery"
    ) {
      reasons.push(`Blocked face ${face.id}`);
    }
  }
  for (const other of document.landmarks ?? []) {
    if (site.some(part => other.site.some(existing => polygonIntersectsLandmark(part.outer, [existing]))))
      reasons.push(`Overlaps landmark ${other.id}`);
  }
  for (const group of document.featureGroups) {
    const edgeIds =
      group.kind === "river"
        ? group.vertices.slice(1).flatMap((id, i) =>
            Object.values(document.mesh.edges)
              .filter(
                edge =>
                  (edge.a === group.vertices[i] && edge.b === id) || (edge.b === group.vertices[i] && edge.a === id)
              )
              .map(edge => edge.id)
          )
        : group.segments.map(ref => ref.edgeId);
    for (const edgeId of edgeIds) {
      const edge = document.mesh.edges[edgeId];
      const a = document.mesh.vertices[edge.a]?.point;
      const b = document.mesh.vertices[edge.b]?.point;
      if (!a || !b) continue;
      const width = group.style.widthMeters / 2;
      const dx = b[0] - a[0],
        dy = b[1] - a[1],
        length = Math.hypot(dx, dy);
      if (!length) continue;
      const nx = (-dy / length) * width,
        ny = (dx / length) * width;
      const band: Point[] = [
        [a[0] + nx, a[1] + ny],
        [b[0] + nx, b[1] + ny],
        [b[0] - nx, b[1] - ny],
        [a[0] - nx, a[1] - ny]
      ];
      if (site.some(part => polygonIntersectsLandmark(band, [part]))) reasons.push(`Blocks ${group.kind} ${group.id}`);
    }
  }
  if (reasons.length) return { document: null, reasons: [...new Set(reasons)] };
  const next: CityDocument = {
    ...document,
    version: 3,
    landmarkAssets: (document.landmarkAssets ?? []).some(
      existing => existing.id === asset.id && existing.revision === asset.revision
    )
      ? document.landmarkAssets
      : [...(document.landmarkAssets ?? []), asset],
    landmarks: [
      ...(document.landmarks ?? []),
      {
        ...placement,
        assetId: asset.id,
        assetRevision: asset.revision,
        site,
        accesses: [],
        locked: false
      }
    ]
  };
  return { document: next, reasons: [] };
}

export function validateLandmarks(document: CityDocument): string[] {
  const errors: string[] = [];
  if ((document.landmarks?.length || document.landmarkAssets?.length) && document.version !== 3)
    errors.push("Landmarks require document version 3");
  const assets = new Map<string, LandmarkAsset>();
  for (const asset of document.landmarkAssets ?? []) {
    const key = `${asset.id}@${asset.revision}`;
    if (assets.has(key)) errors.push(`Duplicate landmark asset ${key}`);
    assets.set(key, asset);
    if (
      !asset.id ||
      !asset.revision ||
      !asset.name ||
      !asset.provenanceId ||
      !asset.dimensionSource ||
      asset.referenceSizeMeters.length !== 2 ||
      asset.referenceSizeMeters.some(n => !Number.isFinite(n) || n <= 0)
    )
      errors.push(`Invalid landmark asset ${key}`);
    if (!validPolygons(asset.footprint) || !validPolygons(asset.minimumSite))
      errors.push(`Invalid landmark geometry ${key}`);
    if (
      !asset.entrances.every(
        e =>
          e.id && finitePoint(e.point) && finitePoint(e.outward) && Number.isFinite(e.widthMeters) && e.widthMeters > 0
      )
    )
      errors.push(`Invalid landmark entrance ${key}`);
    // Render markup is deliberately limited to static path geometry. The original
    // source SVG is never inserted into the document without normalization.
    if (
      !/^<svg(?:\s[^>]*)?>[\s\S]*<\/svg>$/.test(asset.renderSvg) ||
      /<(?!\/?(?:svg|g|path|circle|rect|ellipse|polygon|polyline|line)\b)[^>]*>/i.test(asset.renderSvg) ||
      /\b(?:on\w+|href|style|url\s*\()\s*=/i.test(asset.renderSvg)
    )
      errors.push(`Unsafe landmark SVG ${key}`);
  }
  const ids = new Set<string>();
  for (const instance of document.landmarks ?? []) {
    if (ids.has(instance.id)) errors.push(`Duplicate landmark ${instance.id}`);
    ids.add(instance.id);
    if (!assets.has(`${instance.assetId}@${instance.assetRevision}`))
      errors.push(`Missing landmark asset ${instance.id}`);
    if (
      !finitePoint(instance.position) ||
      !Number.isFinite(instance.rotation) ||
      !Number.isFinite(instance.scale) ||
      instance.scale <= 0 ||
      !validPolygons(instance.site)
    )
      errors.push(`Invalid landmark instance ${instance.id}`);
  }
  return errors;
}

function validPolygons(polygons: LandmarkPolygon[]): boolean {
  return (
    Array.isArray(polygons) &&
    polygons.length > 0 &&
    polygons.every(
      p =>
        Array.isArray(p.outer) &&
        p.outer.length >= 3 &&
        p.outer.every(finitePoint) &&
        Array.isArray(p.holes) &&
        p.holes.every(h => h.length >= 3 && h.every(finitePoint))
    )
  );
}
