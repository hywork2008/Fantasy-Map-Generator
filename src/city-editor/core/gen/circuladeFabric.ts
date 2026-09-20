// Radial & concentric circulade (Bram-style) fabric generator.
// Features:
// 1. Back-to-back dwelling rows (2 rows per annular ring band sharing a rear boundary).
// 2. Continuous row houses (maisons mitoyennes, 3-6 lots contiguous along the circumference).
// 3. Radial venelles (alleys) between house clusters and ring street gaps serving as roads.

import { facePoints } from "../mesh";
import type { CityDocument, DistrictParameters, Face, Id, Point } from "../types";
import { clipPolygonHalfPlane, nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "./geom";
import type { InfillLane } from "./localInfill";
import type { BlockBoundary, PerimeterFabric } from "./perimeterBlocks";
import { makeRng } from "./prng";

const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * Subdivide a face with back-to-back row houses arranged radially from the hub,
 * using the radial and concentric gaps between clusters as the road network.
 */
export function buildCirculadeBlocks(
  face: Face,
  outline: Point[],
  boundaries: BlockBoundary[],
  parameters: DistrictParameters | undefined,
  seed: string,
  build: boolean,
  hub: Point = [0, 0]
): PerimeterFabric {
  const fabric: PerimeterFabric = { buildings: [], lanes: [], entrances: new Map(), blocks: [] };
  const width = parameters?.laneWidth ?? 3;

  for (const edge of boundaries) {
    if (!edge.feature && distance(edge.a, edge.b) > 1e-6) {
      fabric.lanes.push({ faceId: face.id, points: [edge.a, edge.b], widthMeters: width });
    }
  }
  if (!build || outline.length < 3) return fabric;

  const _rng = makeRng(`${seed}:circulade-fabric:${face.id}`);

  // Calculate face center angle relative to hub for unwrapping
  const fCentroid = polygonCentroid(outline);
  const centerTheta = Math.atan2(fCentroid[1] - hub[1], fCentroid[0] - hub[0]);

  // Convert outline vertices to polar coordinates (r, theta) relative to hub
  const polarPts = outline.map(p => {
    const dx = p[0] - hub[0];
    const dy = p[1] - hub[1];
    const r = Math.hypot(dx, dy);
    const theta = Math.atan2(dy, dx);
    let diff = theta - centerTheta;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    return { r, theta: centerTheta + diff, p };
  });

  const minR = Math.min(...polarPts.map(u => u.r));
  const maxR = Math.max(...polarPts.map(u => u.r));
  const minTheta = Math.min(...polarPts.map(u => u.theta));
  const maxTheta = Math.max(...polarPts.map(u => u.theta));

  // Protect civic core (plaza & church) from residential lots
  const coreRadius = 9;
  if (maxR < coreRadius + 2) return fabric;

  // Back-to-back 2-row annular bands
  const lotDepth = 9.0; // depth of a single house lot (meters)
  const blockDepth = lotDepth * 2; // back-to-back depth = 18m
  const streetGap = 4.2; // width of concentric ring street gap (meters)
  const ringPitch = blockDepth + streetGap; // 22.2m

  // Radial venelles (radiating alleys)
  // 14 spokes around 360 degrees (approx 25.7 degrees per sector)
  const numSpokes = 14;
  const deltaSector = (2 * Math.PI) / numSpokes;
  const venelleWidth = 3.2; // width of radial alley gap (meters)

  // Inward boundary setback clipping planes
  const clipPlanes: { origin: Point; normal: Point }[] = [];
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    let nx = -dy / len;
    let ny = dx / len;
    const midX = (a[0] + b[0]) / 2;
    const midY = (a[1] + b[1]) / 2;
    if ((fCentroid[0] - midX) * nx + (fCentroid[1] - midY) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const boundary = boundaries[i];
    const setback = boundary ? Math.max(0.6, boundary.setback) : 0.6;
    clipPlanes.push({
      origin: [a[0] + nx * setback, a[1] + ny * setback],
      normal: [nx, ny]
    });
  }

  const minRingIdx = Math.max(0, Math.floor((minR - coreRadius) / ringPitch));
  const maxRingIdx = Math.ceil((maxR - coreRadius) / ringPitch);

  const minSectorIdx = Math.floor(minTheta / deltaSector) - 1;
  const maxSectorIdx = Math.ceil(maxTheta / deltaSector) + 1;

  // 1. Radial lanes along the venelle spoke gaps
  for (let sIdx = minSectorIdx; sIdx <= maxSectorIdx; sIdx++) {
    const spokeTheta = sIdx * deltaSector;
    if (spokeTheta >= minTheta - 0.05 && spokeTheta <= maxTheta + 0.05) {
      const rStart = Math.max(coreRadius, minR);
      const rEnd = maxR;
      if (rEnd > rStart + 2) {
        const p1: Point = [hub[0] + rStart * Math.cos(spokeTheta), hub[1] + rStart * Math.sin(spokeTheta)];
        const p2: Point = [hub[0] + rEnd * Math.cos(spokeTheta), hub[1] + rEnd * Math.sin(spokeTheta)];
        fabric.lanes.push({ faceId: face.id, points: [p1, p2], widthMeters: venelleWidth });
      }
    }
  }

  // 2. Concentric lanes in the ring street gaps between annular blocks
  for (let ringIdx = minRingIdx; ringIdx <= maxRingIdx; ringIdx++) {
    const rGap = coreRadius + ringIdx * ringPitch + streetGap / 2;
    if (rGap >= minR && rGap <= maxR) {
      const arcSteps = Math.max(2, Math.ceil((maxTheta - minTheta) / (deltaSector / 3)));
      const arcPts: Point[] = [];
      for (let s = 0; s <= arcSteps; s++) {
        const t = minTheta + (s / arcSteps) * (maxTheta - minTheta);
        arcPts.push([hub[0] + rGap * Math.cos(t), hub[1] + rGap * Math.sin(t)]);
      }
      for (let s = 0; s < arcPts.length - 1; s++) {
        fabric.lanes.push({ faceId: face.id, points: [arcPts[s], arcPts[s + 1]], widthMeters: streetGap });
      }
    }
  }

  // 3. Dwelling generation: Back-to-back 2 rows, with multiple row houses per sector
  for (let ringIdx = minRingIdx; ringIdx <= maxRingIdx; ringIdx++) {
    const blockInnerR = coreRadius + ringIdx * ringPitch + streetGap;
    const blockOuterR = blockInnerR + blockDepth;
    const backR = blockInnerR + lotDepth; // back-to-back shared boundary
    if (blockOuterR < minR || blockInnerR > maxR) continue;

    for (let sIdx = minSectorIdx; sIdx <= maxSectorIdx; sIdx++) {
      const sectorStart = sIdx * deltaSector;
      const sectorEnd = (sIdx + 1) * deltaSector;

      // Deduct venelle gap at sector boundaries
      const meanR = (blockInnerR + blockOuterR) / 2;
      const halfVenelleAngle = venelleWidth / meanR / 2;

      const clusterThetaStart = sectorStart + halfVenelleAngle;
      const clusterThetaEnd = sectorEnd - halfVenelleAngle;
      if (clusterThetaEnd <= clusterThetaStart + 0.05) continue;

      const clusterAngleSpan = clusterThetaEnd - clusterThetaStart;
      const clusterArcMeters = meanR * clusterAngleSpan;

      // Target lot frontage ~5.5m to 7.0m -> determine number of row houses (2 to 6)
      const numLots = Math.max(2, Math.min(6, Math.round(clusterArcMeters / 6.0)));
      const lotAngleStep = clusterAngleSpan / numLots;
      const slitAngle = 0.35 / meanR; // 0.35m seam between contiguous row houses

      // Generate both rows (Inner row: blockInnerR to backR, Outer row: backR to blockOuterR)
      const rows: [number, number][] = [
        [blockInnerR, backR],
        [backR, blockOuterR]
      ];

      for (const [rIn, rOut] of rows) {
        if (rOut < minR || rIn > maxR) continue;

        for (let lIdx = 0; lIdx < numLots; lIdx++) {
          const lotThStart = clusterThetaStart + lIdx * lotAngleStep + slitAngle / 2;
          const lotThEnd = clusterThetaStart + (lIdx + 1) * lotAngleStep - slitAngle / 2;
          if (lotThEnd <= lotThStart) continue;

          // 4 corners of trapezoid lot
          const q1: Point = [hub[0] + rIn * Math.cos(lotThStart), hub[1] + rIn * Math.sin(lotThStart)];
          const q2: Point = [hub[0] + rIn * Math.cos(lotThEnd), hub[1] + rIn * Math.sin(lotThEnd)];
          const q3: Point = [hub[0] + rOut * Math.cos(lotThEnd), hub[1] + rOut * Math.sin(lotThEnd)];
          const q4: Point = [hub[0] + rOut * Math.cos(lotThStart), hub[1] + rOut * Math.sin(lotThStart)];

          let poly: Point[] = [q1, q2, q3, q4];
          for (const plane of clipPlanes) {
            poly = clipPolygonHalfPlane(poly, plane.origin, plane.normal);
            if (poly.length < 3) break;
          }

          if (poly.length >= 3) {
            const pArea = Math.abs(polygonArea(poly));
            if (pArea >= 14) {
              fabric.buildings.push({ faceId: face.id, polygon: poly, landmark: false });
              fabric.blocks.push(poly);
            }
          }
        }
      }
    }
  }

  return fabric;
}

export interface CirculadeTownOptions {
  seed: string;
  hub: Point;
  parameters?: DistrictParameters;
}

function extractWallLoop(document: CityDocument): { poly: Point[]; edges: [Point, Point][] } {
  const wall = document.featureGroups.find(g => g.kind === "wall");
  if (!wall || wall.segments.length === 0) return { poly: [], edges: [] };
  const mesh = document.mesh;
  const rawEdges: [Point, Point][] = wall.segments.map(s => {
    const e = mesh.edges[s.edgeId];
    return [mesh.vertices[s.forward ? e.a : e.b].point, mesh.vertices[s.forward ? e.b : e.a].point];
  });
  const chain: Point[] = [rawEdges[0][0], rawEdges[0][1]];
  const remaining = rawEdges.slice(1);
  while (remaining.length > 0) {
    const last = chain[chain.length - 1];
    let foundIdx = -1;
    let reverse = false;
    for (let i = 0; i < remaining.length; i++) {
      const [a, b] = remaining[i];
      if (Math.hypot(a[0] - last[0], a[1] - last[1]) < 1e-3) {
        foundIdx = i;
        reverse = false;
        break;
      }
      if (Math.hypot(b[0] - last[0], b[1] - last[1]) < 1e-3) {
        foundIdx = i;
        reverse = true;
        break;
      }
    }
    if (foundIdx === -1) break;
    const nextEdge = remaining.splice(foundIdx, 1)[0];
    chain.push(reverse ? nextEdge[0] : nextEdge[1]);
  }
  const isClosed =
    Math.hypot(chain[0][0] - chain[chain.length - 1][0], chain[0][1] - chain[chain.length - 1][1]) < 1e-3;
  const poly = isClosed ? chain.slice(0, -1) : chain;
  return { poly, edges: rawEdges };
}

/**
 * Generate a unified concentric and radial settlement fabric across the whole Bram city domain.
 * Dwellings form seamless back-to-back continuous rows across Voronoi cell boundaries,
 * avoiding only physical obstacles (walls, major roads, civic monuments, water).
 * Each building's editing ownership (faceId) is mapped from its centroid.
 */
export function buildCirculadeTownFabric(document: CityDocument, options: CirculadeTownOptions): PerimeterFabric {
  const fabric: PerimeterFabric = { buildings: [], lanes: [], entrances: new Map(), blocks: [] };
  const hub = options.hub;

  // 1. City wall boundary and setback
  const wall = document.featureGroups.find(g => g.kind === "wall");
  const { poly: wallPoly, edges: wallEdges } = extractWallLoop(document);
  const wallSetback = (wall?.style?.widthMeters ?? 7.0) / 2 + 2.5;

  // 2. Civic landmarks to protect
  const plaza = document.elements.find(e => e.kind === "plaza");
  const temple = document.elements.find(e => e.kind === "temple");
  const coreRadius = plaza ? Math.max(16, (plaza.sizeMeters ?? 36) / 2 + 1.5) : 18;
  const templeR = temple ? (temple.sizeMeters ?? 28) / 2 + 2.5 : 0;
  const templePt = temple ? temple.point : null;
  const reservedFaces = new Set(document.elements.flatMap(e => e.faceIds));

  // 3. Roads and rivers
  const roads = document.featureGroups.filter(g => g.kind === "road");
  const roadSegments = roads.flatMap(r =>
    r.segments.map(s => {
      const e = document.mesh.edges[s.edgeId];
      return {
        points: [document.mesh.vertices[e.a].point, document.mesh.vertices[e.b].point] as [Point, Point],
        width: r.style?.widthMeters ?? 6
      };
    })
  );

  const rivers = document.featureGroups
    .filter(g => g.kind === "river")
    .flatMap(g =>
      g.vertices.slice(1).map((v, i) => ({
        points: [document.mesh.vertices[g.vertices[i]].point, document.mesh.vertices[v].point] as [Point, Point],
        width: g.style.widthMeters
      }))
    );

  // 4. Precompute face outlines for ownership mapping
  const faceEntries = Object.values(document.mesh.faces).map(f => {
    const pts = facePoints(document.mesh, f);
    return {
      id: f.id,
      f,
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
      const d = Math.hypot(p[0] - entry.c[0], p[1] - entry.c[1]);
      if (d < bestDist) {
        bestDist = d;
        best = entry.id;
      }
    }
    return best;
  };

  // 5. Annular rings and spoke sectors
  const lotDepth = 9.0;
  const blockDepth = lotDepth * 2;
  const streetGap = 4.2;
  const ringPitch = blockDepth + streetGap; // 22.2m
  const numSpokes = 14;
  const deltaSector = (2 * Math.PI) / numSpokes;
  const venelleWidth = 3.2;

  let maxR = 250;
  if (wallEdges.length > 0) {
    maxR = Math.max(...wallEdges.map(e => Math.hypot(e[0][0] - hub[0], e[0][1] - hub[1])));
  } else {
    const coreFaces = Object.values(document.mesh.faces).filter(
      f => f.properties.settlement === "core" && f.properties.water === "land"
    );
    if (coreFaces.length > 0) {
      maxR = Math.max(
        ...coreFaces.flatMap(f => facePoints(document.mesh, f).map(p => Math.hypot(p[0] - hub[0], p[1] - hub[1])))
      );
    }
  }

  const minRingIdx = 0;
  const maxRingIdx = Math.ceil((maxR - coreRadius) / ringPitch);

  for (let ringIdx = minRingIdx; ringIdx <= maxRingIdx; ringIdx++) {
    const blockInnerR = coreRadius + ringIdx * ringPitch + streetGap;
    const blockOuterR = blockInnerR + blockDepth;
    const backR = blockInnerR + lotDepth;
    if (blockInnerR > maxR) break;

    // Concentric street lane in the ring gap
    const rGap = coreRadius + ringIdx * ringPitch + streetGap / 2;
    const arcSteps = 36;
    for (let s = 0; s < arcSteps; s++) {
      const t1 = (s / arcSteps) * 2 * Math.PI;
      const t2 = ((s + 1) / arcSteps) * 2 * Math.PI;
      const p1: Point = [hub[0] + rGap * Math.cos(t1), hub[1] + rGap * Math.sin(t1)];
      const p2: Point = [hub[0] + rGap * Math.cos(t2), hub[1] + rGap * Math.sin(t2)];
      const mid: Point = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];

      if (wallPoly.length >= 3 && !pointInPolygon(mid, wallPoly)) continue;
      if (templePt && Math.hypot(mid[0] - templePt[0], mid[1] - templePt[1]) < templeR) continue;
      if (rivers.some(rv => nearestOnPolyline(mid, rv.points).dist < rv.width / 2 + 2.0)) continue;

      const fId = findOwner(mid);
      if (reservedFaces.has(fId)) continue;
      fabric.lanes.push({ faceId: fId, points: [p1, p2], widthMeters: streetGap });
    }

    // Radial venelle spoke lanes
    for (let sIdx = 0; sIdx < numSpokes; sIdx++) {
      const spokeTheta = sIdx * deltaSector;
      const p1: Point = [hub[0] + blockInnerR * Math.cos(spokeTheta), hub[1] + blockInnerR * Math.sin(spokeTheta)];
      const p2: Point = [
        hub[0] + (blockOuterR + streetGap) * Math.cos(spokeTheta),
        hub[1] + (blockOuterR + streetGap) * Math.sin(spokeTheta)
      ];
      const mid: Point = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      if (wallPoly.length >= 3 && !pointInPolygon(mid, wallPoly)) continue;
      if (templePt && Math.hypot(mid[0] - templePt[0], mid[1] - templePt[1]) < templeR) continue;
      if (rivers.some(rv => nearestOnPolyline(mid, rv.points).dist < rv.width / 2 + 2.0)) continue;
      const fId = findOwner(mid);
      if (reservedFaces.has(fId)) continue;
      fabric.lanes.push({ faceId: fId, points: [p1, p2], widthMeters: venelleWidth });
    }

    // Dwellings and radial venelles per sector
    for (let sIdx = 0; sIdx < numSpokes; sIdx++) {
      const sectorStart = sIdx * deltaSector;
      const sectorEnd = (sIdx + 1) * deltaSector;

      const meanR = (blockInnerR + blockOuterR) / 2;
      const halfVenelleAngle = venelleWidth / meanR / 2;
      const clusterThetaStart = sectorStart + halfVenelleAngle;
      const clusterThetaEnd = sectorEnd - halfVenelleAngle;
      if (clusterThetaEnd <= clusterThetaStart + 0.05) continue;

      const clusterAngleSpan = clusterThetaEnd - clusterThetaStart;
      const clusterArcMeters = meanR * clusterAngleSpan;

      // Subdivide into clusters of 3-5 houses
      const totalHouses = Math.max(2, Math.round(clusterArcMeters / 6.0));
      const numSubClusters = Math.max(1, Math.round(totalHouses / 4.5));
      const subClusterAngleSpan = (clusterAngleSpan - (numSubClusters - 1) * (venelleWidth / meanR)) / numSubClusters;

      for (let scIdx = 0; scIdx < numSubClusters; scIdx++) {
        const scThStart = clusterThetaStart + scIdx * (subClusterAngleSpan + venelleWidth / meanR);
        const _scThEnd = scThStart + subClusterAngleSpan;
        const housesInSubCluster = Math.max(2, Math.round((subClusterAngleSpan * meanR) / 6.0));
        const lotAngleStep = subClusterAngleSpan / housesInSubCluster;
        const slitAngle = 0.35 / meanR;

        const rows: [number, number][] = [
          [blockInnerR, backR],
          [backR, blockOuterR]
        ];

        for (const [rIn, rOut] of rows) {
          for (let lIdx = 0; lIdx < housesInSubCluster; lIdx++) {
            const lotThStart = scThStart + lIdx * lotAngleStep + slitAngle / 2;
            const lotThEnd = scThStart + (lIdx + 1) * lotAngleStep - slitAngle / 2;
            if (lotThEnd <= lotThStart) continue;

            const q1: Point = [hub[0] + rIn * Math.cos(lotThStart), hub[1] + rIn * Math.sin(lotThStart)];
            const q2: Point = [hub[0] + rIn * Math.cos(lotThEnd), hub[1] + rIn * Math.sin(lotThEnd)];
            const q3: Point = [hub[0] + rOut * Math.cos(lotThEnd), hub[1] + rOut * Math.sin(lotThEnd)];
            const q4: Point = [hub[0] + rOut * Math.cos(lotThStart), hub[1] + rOut * Math.sin(lotThStart)];

            const c: Point = [(q1[0] + q2[0] + q3[0] + q4[0]) / 4, (q1[1] + q2[1] + q3[1] + q4[1]) / 4];

            // 1. Inside wall polygon and clearance from wall edges
            if (wallPoly.length >= 3) {
              if (!pointInPolygon(c, wallPoly)) continue;
              if (
                !pointInPolygon(q1, wallPoly) ||
                !pointInPolygon(q2, wallPoly) ||
                !pointInPolygon(q3, wallPoly) ||
                !pointInPolygon(q4, wallPoly)
              ) {
                continue;
              }
              let nearWall = false;
              for (const [w1, w2] of wallEdges) {
                if (nearestOnPolyline(c, [w1, w2]).dist < wallSetback) {
                  nearWall = true;
                  break;
                }
              }
              if (nearWall) continue;
            }

            // 2. Temple collision
            if (templePt && Math.hypot(c[0] - templePt[0], c[1] - templePt[1]) < templeR) continue;

            // 3. Road collision
            if (roadSegments.some(r => nearestOnPolyline(c, r.points).dist < r.width / 2 + 1.8)) continue;

            // 4. River collision
            if (rivers.some(rv => nearestOnPolyline(c, rv.points).dist < rv.width / 2 + 2.0)) continue;

            // 5. Civic / reserved faces and water faces
            const ownerId = findOwner(c);
            const ownerFace = document.mesh.faces[ownerId];
            if (!ownerFace || ownerFace.properties.water !== "land") continue;
            if (reservedFaces.has(ownerId)) continue;

            fabric.buildings.push({ faceId: ownerId, polygon: [q1, q2, q3, q4], landmark: false });
            fabric.blocks.push([q1, q2, q3, q4]);

            // Entrance point at front edge
            const frontDoor: Point =
              rIn === blockInnerR
                ? [(q1[0] + q2[0]) / 2, (q1[1] + q2[1]) / 2]
                : [(q3[0] + q4[0]) / 2, (q3[1] + q4[1]) / 2];
            fabric.entrances.set(ownerId, [...(fabric.entrances.get(ownerId) ?? []), frontDoor]);
          }
        }
      }
    }
  }

  return fabric;
}
