import { clone, edgeBetween, facePoints, faceVertices } from "../mesh";
import type { CityDocument, Face, Id, Mesh, Point, Vertex } from "../types";
import { polygonArea, polygonCentroid, segmentSegmentHit } from "./geom";
import { makeRng } from "./prng";

/**
 * Returns true if the mesh is predominantly a regular hexagonal grid.
 */
export function isHexagonalDocument(document: CityDocument): boolean {
  const { mesh } = document;
  const faces = Object.values(mesh.faces).filter(f => f.properties.water === "land");
  if (faces.length < 6) return false;

  let hexCount = 0;
  for (const face of faces) {
    if (face.boundary.length === 6) hexCount++;
  }
  return hexCount / faces.length >= 0.65;
}

interface BlockComponent {
  faceIds: Id[];
  boundaryRoadEdges: Id[];
}

/**
 * For hexagonal mesh cities, clusters urban faces into blocks separated by
 * roads/walls/rivers, chooses a dominant diagonal direction for each block,
 * and shrinks the opposite corners towards the line connecting their neighbours.
 *
 * Requirements:
 * 1. Corners must NEVER pass the line connecting their two neighbours (strictly convex / no concavity).
 * 2. Jitter/variation is applied so edges do not form perfectly robotic straight lines.
 * 3. Topological safety (no self-intersections, no inverted faces, min edge length) is strictly enforced.
 */
export function rectifyHexBlocks(source: CityDocument, seed: string): CityDocument {
  if (!isHexagonalDocument(source)) return source;

  const next = clone(source);
  const { mesh } = next;

  // 1. Identify road/wall/river barrier edges
  const barrierEdges = new Set<Id>();
  for (const group of next.featureGroups) {
    if (group.kind === "river") {
      for (let i = 1; i < group.vertices.length; i++) {
        const edge = edgeBetween(mesh, group.vertices[i - 1], group.vertices[i]);
        if (edge) barrierEdges.add(edge.id);
      }
    } else {
      for (const seg of group.segments) {
        barrierEdges.add(seg.edgeId);
      }
    }
  }

  // Also treat coastline / water edges as barriers
  for (const edge of Object.values(mesh.edges)) {
    const left = edge.leftFace ? mesh.faces[edge.leftFace] : null;
    const right = edge.rightFace ? mesh.faces[edge.rightFace] : null;
    if (!left || !right || left.properties.water !== "land" || right.properties.water !== "land") {
      barrierEdges.add(edge.id);
    }
  }

  // 2. Partition urban land faces into block components via BFS across non-barrier edges
  const urbanFaces = new Set(
    Object.values(mesh.faces)
      .filter(f => f.properties.water === "land" && f.properties.buildable)
      .map(f => f.id)
  );

  const visited = new Set<Id>();
  const blocks: BlockComponent[] = [];

  for (const faceId of urbanFaces) {
    if (visited.has(faceId)) continue;
    visited.add(faceId);

    const compFaces: Id[] = [faceId];
    const compRoadEdges = new Set<Id>();
    const queue: Id[] = [faceId];

    while (queue.length > 0) {
      const curId = queue.shift()!;
      const curFace = mesh.faces[curId];
      if (!curFace) continue;

      for (const ref of curFace.boundary) {
        const edge = mesh.edges[ref.edgeId];
        if (!edge) continue;

        if (barrierEdges.has(edge.id)) {
          compRoadEdges.add(edge.id);
          continue;
        }

        const neighborId = edge.leftFace === curId ? edge.rightFace : edge.leftFace;
        if (neighborId && urbanFaces.has(neighborId) && !visited.has(neighborId)) {
          visited.add(neighborId);
          compFaces.push(neighborId);
          queue.push(neighborId);
        }
      }
    }

    blocks.push({
      faceIds: compFaces,
      boundaryRoadEdges: [...compRoadEdges]
    });
  }

  // 3. Pinned vertices that must not move
  const half = next.frame.extentMeters / 2;
  const pinned = new Set<Id>();
  for (const v of Object.values(mesh.vertices)) {
    if (v.locked || Math.abs(v.point[0]) >= half - 0.001 || Math.abs(v.point[1]) >= half - 0.001) {
      pinned.add(v.id);
    }
  }
  for (const gate of next.gates) {
    pinned.add(gate.vertexId);
  }
  // Pin vertices on road/wall/river/coast barrier edges so blocks do not interfere across roads
  for (const eid of barrierEdges) {
    const e = mesh.edges[eid];
    if (e) {
      pinned.add(e.a);
      pinned.add(e.b);
    }
  }

  // Collect target displacements from each block
  // A vertex may receive desired positions from multiple faces in a block; we average them.
  const proposedPositions = new Map<Id, Point[]>();

  for (let bIdx = 0; bIdx < blocks.length; bIdx++) {
    const block = blocks[bIdx];
    const blockRng = makeRng(`${seed}:block:${bIdx}`);

    // Determine the dominant orientation for this block
    // Diagonal modes:
    // 0: 0° / 180° diagonal (shrinks E & W corners -> vertical/horizontal brick rects)
    // 1: 60° / 240° diagonal (shrinks NE & SW corners -> angled 150°/60° rects)
    // 2: 120° / 300° diagonal (shrinks NW & SE corners -> angled 30°/120° rects)
    let chosenDiagonal = blockRng.int(0, 2);

    if (block.boundaryRoadEdges.length > 0) {
      // Find average road angle
      let sinSum = 0;
      let cosSum = 0;
      let weightSum = 0;
      for (const edgeId of block.boundaryRoadEdges) {
        const e = mesh.edges[edgeId];
        if (!e) continue;
        const va = mesh.vertices[e.a];
        const vb = mesh.vertices[e.b];
        if (!va || !vb) continue;
        const dx = vb.point[0] - va.point[0];
        const dy = vb.point[1] - va.point[1];
        const len = Math.hypot(dx, dy);
        if (len < 1e-4) continue;
        let angle = Math.atan2(dy, dx);
        if (angle < 0) angle += Math.PI;
        sinSum += Math.sin(2 * angle) * len;
        cosSum += Math.cos(2 * angle) * len;
        weightSum += len;
      }

      if (weightSum > 0) {
        const dominantAngle = 0.5 * Math.atan2(sinSum, cosSum);
        const normAngle = ((dominantAngle % Math.PI) + Math.PI) % Math.PI;

        const streetAlignments = [
          [0, Math.PI / 2],
          [Math.PI / 3, (5 * Math.PI) / 6],
          [Math.PI / 6, (2 * Math.PI) / 3]
        ];

        let bestDist = Infinity;
        let bestDiag = chosenDiagonal;
        for (let d = 0; d < 3; d++) {
          for (const targetAng of streetAlignments[d]) {
            let diff = Math.abs(normAngle - targetAng);
            if (diff > Math.PI / 2) diff = Math.PI - diff;
            if (diff < bestDist) {
              bestDist = diff;
              bestDiag = d;
            }
          }
        }
        chosenDiagonal = bestDiag;
      }
    }

    // Shrink corners for faces in this block
    for (const faceId of block.faceIds) {
      const face = mesh.faces[faceId];
      if (!face) continue;
      const vIds = faceVertices(mesh, face);
      if (vIds.length !== 6) continue;

      const pts = vIds.map(id => mesh.vertices[id].point);
      const centroid = polygonCentroid(pts);

      // Order vertices by counter-clockwise angle around centroid starting near 0 rad
      const withAngles = vIds.map((id, i) => {
        const p = pts[i];
        let ang = Math.atan2(p[1] - centroid[1], p[0] - centroid[0]);
        if (ang < 0) ang += 2 * Math.PI;
        return { id, p, ang, origIndex: i };
      });
      withAngles.sort((a, b) => a.ang - b.ang);

      const pair = [chosenDiagonal, (chosenDiagonal + 3) % 6];

      for (const idx of pair) {
        const targetV = withAngles[idx];
        if (pinned.has(targetV.id)) continue;

        const prevV = withAngles[(idx + 5) % 6];
        const nextV = withAngles[(idx + 1) % 6];

        const pk = targetV.p;
        const pPrev = prevV.p;
        const pNext = nextV.p;

        const lineDx = pNext[0] - pPrev[0];
        const lineDy = pNext[1] - pPrev[1];
        const lineLenSq = lineDx * lineDx + lineDy * lineDy;
        if (lineLenSq < 1e-6) continue;

        const u = ((pk[0] - pPrev[0]) * lineDx + (pk[1] - pPrev[1]) * lineDy) / lineLenSq;
        const h: Point = [pPrev[0] + u * lineDx, pPrev[1] + u * lineDy];
        const toH: Point = [h[0] - pk[0], h[1] - pk[1]];

        // User requirement:
        // "対角を縮めて完全に長方形にするのではなく、ある程度の揺らぎを持たせて、edgeの連なりが完全な直線にはならないようにして下さい。
        //  六角形の角を縮める際に、その角の両隣を結ぶ直線より内側に角が入らないようにする。"
        const baseT = 0.7;
        const jitter = blockRng.range(-0.08, 0.06);
        const t = Math.max(0.45, Math.min(0.85, baseT + jitter));

        const lineLen = Math.sqrt(lineLenSq);
        const tanJitter = blockRng.range(-0.02, 0.02) * lineLen;
        const tanUnit: Point = [lineDx / lineLen, lineDy / lineLen];

        const desiredX = pk[0] + t * toH[0] + tanJitter * tanUnit[0];
        const desiredY = pk[1] + t * toH[1] + tanJitter * tanUnit[1];

        const finalTarget: Point = [desiredX, desiredY];

        if (!proposedPositions.has(targetV.id)) {
          proposedPositions.set(targetV.id, []);
        }
        proposedPositions.get(targetV.id)!.push(finalTarget);
      }
    }
  }

  // 4. Calculate desired target for each vertex by averaging proposals
  const desired = new Map<Id, Point>();
  for (const [id, points] of proposedPositions) {
    if (pinned.has(id)) continue;
    let sumX = 0;
    let sumY = 0;
    for (const p of points) {
      sumX += p[0];
      sumY += p[1];
    }
    desired.set(id, [sumX / points.length, sumY / points.length]);
  }

  // 5. Apply displacements with geometric validation (line search)
  const adjacent = new Map<Id, Set<Id>>();
  for (const e of Object.values(mesh.edges)) {
    if (!adjacent.has(e.a)) adjacent.set(e.a, new Set());
    if (!adjacent.has(e.b)) adjacent.set(e.b, new Set());
    adjacent.get(e.a)!.add(e.b);
    adjacent.get(e.b)!.add(e.a);
  }

  const facesAt = new Map<Id, Id[]>();
  const faceRings = new Map(Object.values(mesh.faces).map(f => [f.id, faceVertices(mesh, f)]));
  const origAreas = new Map(Object.values(mesh.faces).map(f => [f.id, polygonArea(facePoints(mesh, f))]));

  for (const [fid, ids] of faceRings) {
    for (const id of ids) {
      if (!facesAt.has(id)) facesAt.set(id, []);
      facesAt.get(id)!.push(fid);
    }
  }

  const validAt = (id: Id): boolean => {
    const p = mesh.vertices[id].point;
    // Edge length check
    for (const n of adjacent.get(id) ?? []) {
      const q = mesh.vertices[n].point;
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.0) return false;
    }
    // Face geometry check
    for (const fid of facesAt.get(id) ?? []) {
      const vIds = faceRings.get(fid)!;
      const points = vIds.map(v => mesh.vertices[v].point);
      const before = origAreas.get(fid)!;
      const currentArea = polygonArea(points);
      // Area must remain positive and not shrink too severely
      if (currentArea / before < 0.25) return false;

      // No self-intersection
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 2; j < points.length; j++) {
          if (i === 0 && j === points.length - 1) continue;
          if (
            segmentSegmentHit(points[i], points[(i + 1) % points.length], points[j], points[(j + 1) % points.length])
          ) {
            return false;
          }
        }
      }

      // Check strictly that EVERY corner of this face does not penetrate inside the line connecting neighbours
      if (points.length === 6) {
        const centroid = polygonCentroid(points);
        for (let j = 0; j < 6; j++) {
          const pj = points[j];
          const pjPrev = points[(j + 5) % 6];
          const pjNext = points[(j + 1) % 6];
          const lDx = pjNext[0] - pjPrev[0];
          const lDy = pjNext[1] - pjPrev[1];
          const lLen = Math.hypot(lDx, lDy);
          if (lLen < 1e-4) return false;

          const dK = (lDx * (pj[1] - pjPrev[1]) - lDy * (pj[0] - pjPrev[0])) / lLen;
          const dC = (lDx * (centroid[1] - pjPrev[1]) - lDy * (centroid[0] - pjPrev[0])) / lLen;
          // If dK and dC have the same sign and inward distance > 0.05m, it is concave!
          if (dK * dC > 0 && Math.abs(dK) > 0.05) return false;
        }
      }
    }
    return true;
  };

  // Move vertices in small steps
  for (let pass = 0; pass < 6; pass++) {
    for (const [id, target] of desired) {
      if (pinned.has(id)) continue;
      const v = mesh.vertices[id];
      const p = v.point;
      if (Math.hypot(target[0] - p[0], target[1] - p[1]) < 0.01) continue;

      for (let strength = 0.5; strength >= 1 / 64; strength /= 2) {
        v.point = [p[0] + (target[0] - p[0]) * strength, p[1] + (target[1] - p[1]) * strength];
        if (validAt(id)) break;
        v.point = p;
      }
    }
  }

  // Update face sites to match new centroids
  for (const face of Object.values(mesh.faces)) {
    if (!face.properties.locked) {
      face.site = polygonCentroid(facePoints(mesh, face));
    }
  }

  return next;
}
