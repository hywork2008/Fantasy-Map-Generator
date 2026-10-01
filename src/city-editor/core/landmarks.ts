import { templeRectForElement } from "./gen/civicPlacement";
import { nearestOnPolyline, pointInPolygon, segmentSegmentHit } from "./gen/geom";
import { facePoints } from "./mesh";
import type { CityDocument, Id, LandmarkAsset, LandmarkInstance, LandmarkPolygon, Point } from "./types";

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

function segmentHitsPolygon(a: Point, b: Point, polygon: Point[]): boolean {
  if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) return true;
  return ringEdges(polygon).some(([c, d]) => segmentSegmentHit(a, b, c, d) !== null);
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
  return (document.landmarks ?? []).some(
    instance =>
      polygonIntersectsLandmark(polygon, instance.site) ||
      instance.accesses.some(access =>
        accessCorridor(access.points, access.widthMeters).some(part => polygonIntersectsLandmark(polygon, [part]))
      )
  );
}

export function accessCorridor(points: Point[], widthMeters: number): LandmarkPolygon[] {
  const half = widthMeters / 2;
  return points.slice(1).flatMap((end, i) => {
    const start = points[i];
    const dx = end[0] - start[0],
      dy = end[1] - start[1];
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) return [];
    const nx = (-dy / length) * half,
      ny = (dx / length) * half;
    return [
      {
        outer: [
          [start[0] + nx, start[1] + ny],
          [end[0] + nx, end[1] + ny],
          [end[0] - nx, end[1] - ny],
          [start[0] - nx, start[1] - ny]
        ] as Point[],
        holes: []
      }
    ];
  });
}

/** Road edges reachable from the map boundary; an unfinished local road draft is allowed when no root exists yet. */
export function connectedRoadEdgeIds(document: CityDocument): Set<string> {
  const roads = document.featureGroups.flatMap(group =>
    group.kind === "road" ? group.segments.map(ref => ref.edgeId) : []
  );
  const adjacency = new Map<string, Set<string>>();
  const half = document.frame.extentMeters / 2;
  const boundary = (point: Point): boolean => Math.max(Math.abs(point[0]), Math.abs(point[1])) >= half - 1e-3;
  const roots: string[] = [];
  for (const id of roads) {
    const edge = document.mesh.edges[id];
    if (!edge) continue;
    for (const vertexId of [edge.a, edge.b]) {
      const incident = adjacency.get(vertexId) ?? new Set<string>();
      incident.add(id);
      adjacency.set(vertexId, incident);
    }
    if (boundary(document.mesh.vertices[edge.a].point) || boundary(document.mesh.vertices[edge.b].point))
      roots.push(id);
  }
  if (!roots.length) return new Set(roads);
  const connected = new Set(roots);
  const queue = [...roots];
  for (let i = 0; i < queue.length; i++) {
    const edge = document.mesh.edges[queue[i]];
    for (const vertexId of [edge.a, edge.b]) {
      for (const next of adjacency.get(vertexId) ?? []) {
        if (connected.has(next)) continue;
        connected.add(next);
        queue.push(next);
      }
    }
  }
  return connected;
}

/** Place one asset atomically. Rejected placements leave the original document untouched. */
export function placeLandmark(
  document: CityDocument,
  asset: LandmarkAsset,
  placement: Pick<LandmarkInstance, "id" | "position" | "rotation" | "scale">,
  preservedLanes: ReadonlyArray<{ points: Point[]; widthMeters: number; id?: Id; connectedToRoad?: boolean }> = []
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
  for (const element of document.elements) {
    if (element.kind !== "temple" || !element.point) continue;
    const footprint = templeRectForElement(
      element.point,
      element.sizeMeters,
      element.rotation,
      document.frame.extentMeters
    );
    const localCorners: Point[] = [
      [-footprint.length / 2, -footprint.width / 2],
      [footprint.length / 2, -footprint.width / 2],
      [footprint.length / 2, footprint.width / 2],
      [-footprint.length / 2, footprint.width / 2]
    ];
    const corners = localCorners.map(point =>
      transformLandmarkPoint(point, { position: footprint.center, rotation: footprint.rotation, scale: 1 })
    );
    if (site.some(part => polygonIntersectsLandmark(corners, [part]))) reasons.push(`Overlaps temple ${element.id}`);
  }
  for (const [index, lane] of preservedLanes.entries()) {
    if (
      accessCorridor(lane.points, lane.widthMeters).some(band =>
        site.some(part => polygonIntersectsLandmark(band.outer, [part]))
      )
    )
      reasons.push(`Blocks existing lane ${index + 1}`);
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
  const accesses: LandmarkInstance["accesses"] = [];
  const connectedRoads = connectedRoadEdgeIds(document);
  const accessTargets: Array<{ kind: "road" | "lane"; id: Id; points: Point[] }> = [
    ...document.featureGroups.flatMap(group =>
      group.kind === "road"
        ? group.segments.flatMap(ref => {
            if (!connectedRoads.has(ref.edgeId)) return [];
            const edge = document.mesh.edges[ref.edgeId];
            const a = document.mesh.vertices[edge?.a]?.point;
            const b = document.mesh.vertices[edge?.b]?.point;
            return a && b ? [{ kind: "road" as const, id: group.id, points: [a, b] }] : [];
          })
        : []
    ),
    ...preservedLanes.flatMap(lane =>
      lane.connectedToRoad && lane.id ? [{ kind: "lane" as const, id: lane.id, points: lane.points }] : []
    )
  ];
  for (const entrance of asset.entrances.filter(entry => entry.required)) {
    const start = transformLandmarkPoint(entrance.point, placement);
    const outward: Point = [
      entrance.outward[0] * Math.cos(placement.rotation) - entrance.outward[1] * Math.sin(placement.rotation),
      entrance.outward[0] * Math.sin(placement.rotation) + entrance.outward[1] * Math.cos(placement.rotation)
    ];
    const candidates = accessTargets
      .flatMap(target => {
        const nearest = nearestOnPolyline(start, target.points);
        const point = nearest.point;
        const distance = Math.hypot(point[0] - start[0], point[1] - start[1]);
        const facing = (point[0] - start[0]) * outward[0] + (point[1] - start[1]) * outward[1];
        if (distance > 80 || facing < -0.1) return [];
        const corridor = accessCorridor([start, point], entrance.widthMeters);
        if (
          (document.landmarks ?? []).some(other =>
            corridor.some(part => polygonIntersectsLandmark(part.outer, other.site))
          )
        )
          return [];
        if (
          Object.values(document.mesh.faces).some(
            face =>
              (face.properties.water !== "land" ||
                face.properties.locked ||
                face.properties.ward === "castle" ||
                face.properties.ward === "cemetery") &&
              corridor.some(part => polygonIntersectsLandmark(facePoints(document.mesh, face), [part]))
          )
        )
          return [];
        if (
          document.featureGroups.some(obstacle =>
            obstacle.kind === "wall" || obstacle.kind === "river"
              ? obstacle.kind === "river"
                ? obstacle.vertices.slice(1).some((id, i) => {
                    const c = document.mesh.vertices[obstacle.vertices[i]]?.point;
                    const d = document.mesh.vertices[id]?.point;
                    return c && d && corridor.some(part => segmentHitsPolygon(c, d, part.outer));
                  })
                : obstacle.segments.some(segment => {
                    const wall = document.mesh.edges[segment.edgeId];
                    const c = document.mesh.vertices[wall.a]?.point;
                    const d = document.mesh.vertices[wall.b]?.point;
                    return c && d && corridor.some(part => segmentHitsPolygon(c, d, part.outer));
                  })
              : false
          )
        )
          return [];
        return [
          {
            distance,
            access: {
              entranceId: entrance.id,
              points: [start, point],
              widthMeters: entrance.widthMeters,
              target: { kind: target.kind, id: target.id, point }
            }
          }
        ];
      })
      .sort((a, b) => a.distance - b.distance);
    if (candidates.length) accesses.push(candidates[0].access);
    else reasons.push(`No road or lane access for ${entrance.id}`);
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
        accesses,
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
    if (!asset.entrances.some(e => e.required)) errors.push(`Missing required landmark entrance ${key}`);
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
    const asset = assets.get(`${instance.assetId}@${instance.assetRevision}`);
    if (
      asset?.entrances.some(
        entrance => entrance.required && !instance.accesses.some(access => access.entranceId === entrance.id)
      )
    )
      errors.push(`Unconnected landmark entrance ${instance.id}`);
    if (
      !finitePoint(instance.position) ||
      !Number.isFinite(instance.rotation) ||
      !Number.isFinite(instance.scale) ||
      instance.scale <= 0 ||
      !validPolygons(instance.site)
    )
      errors.push(`Invalid landmark instance ${instance.id}`);
    for (const access of instance.accesses) {
      if (
        !access.entranceId ||
        access.points.length < 2 ||
        !access.points.every(finitePoint) ||
        !Number.isFinite(access.widthMeters) ||
        access.widthMeters <= 0 ||
        (access.target.kind !== "road" && access.target.kind !== "lane") ||
        !finitePoint(access.target.point)
      )
        errors.push(`Invalid landmark access ${instance.id}`);
      if (
        access.target.kind === "road" &&
        !document.featureGroups.some(group => group.kind === "road" && group.id === access.target.id)
      )
        errors.push(`Missing landmark road ${instance.id}`);
    }
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
