import * as fs from "node:fs";
import * as path from "node:path";
import { Delaunay } from "d3-delaunay";

export interface ExtractAlleysOptions {
  inputSvgPath: string;
  outputSvgPath: string;
  strokeColor?: string;
  strokeWidth?: number;
  sampleStep?: number;
  minGap?: number;
  maxGap?: number;
  /** Numerical tolerance for coincident Voronoi vertices, in map units. */
  clusterRadius?: number;
  simplifyTolerance?: number;
  minPathLength?: number;
}

interface Point2D {
  0: number;
  1: number;
}

interface Building {
  id: number;
  pts: Point2D[];
  cx: number;
  cy: number;
}

function pointInPoly(pt: Point2D, poly: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect =
      yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function edgeKey(p1: Point2D, p2: Point2D): string {
  const k1 = `${p1[0].toFixed(2)},${p1[1].toFixed(2)}`;
  const k2 = `${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  return k1 < k2 ? `${k1}_${k2}` : `${k2}_${k1}`;
}

function simplifyPolyline(points: Point2D[], tol: number): Point2D[] {
  if (points.length <= 2) return points;
  let maxD = 0;
  let idx = 0;
  const p1 = points[0];
  const p2 = points[points.length - 1];
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const l2 = dx * dx + dy * dy;

  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    let d: number;
    if (l2 === 0) {
      d = Math.hypot(p[0] - p1[0], p[1] - p1[1]);
    } else {
      const t = Math.max(0, Math.min(1, ((p[0] - p1[0]) * dx + (p[1] - p1[1]) * dy) / l2));
      d = Math.hypot(p[0] - (p1[0] + t * dx), p[1] - (p1[1] + t * dy));
    }
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }

  if (maxD > tol) {
    const r1 = simplifyPolyline(points.slice(0, idx + 1), tol);
    const r2 = simplifyPolyline(points.slice(idx), tol);
    return r1.slice(0, -1).concat(r2);
  }
  return [p1, p2];
}

export function extractAlleys(options: ExtractAlleysOptions): {
  polylinesCount: number;
  totalLength: number;
  blocksCount: number;
  insideBuildingsCount: number;
} {
  const {
    inputSvgPath,
    outputSvgPath,
    strokeColor = "lime",
    strokeWidth = 5,
    // Narrow alleys in this export are well below 1.5 map units wide.
    sampleStep = 0.5,
    minGap = 0.1,
    maxGap = 16.0,
    clusterRadius = 1e-6,
    simplifyTolerance = 0.6,
    minPathLength = 2.5
  } = options;

  console.log(`[extract-alleys] Reading input SVG: ${inputSvgPath}`);
  const svg = fs.readFileSync(inputSvgPath, "utf8");

  // 1. Parse root transform: <g transform="translate(tx ty) scale(sx sy)">
  const rootTransformMatch = svg.match(
    /<g transform="translate\(([^ ]+) ([^)]+)\) scale\(([^ ]+) ([^)]+)\)">/
  );
  let tx = 0;
  let ty = 0;
  let sx = 1;
  let sy = 1;
  if (rootTransformMatch) {
    tx = parseFloat(rootTransformMatch[1]);
    ty = parseFloat(rootTransformMatch[2]);
    sx = parseFloat(rootTransformMatch[3]);
    sy = parseFloat(rootTransformMatch[4]);
    console.log(
      `[extract-alleys] Found transform: translate(${tx}, ${ty}) scale(${sx}, ${sy})`
    );
  }

  // 2. Parse buildings: <path ... fill="#A5A095" ...>
  const buildingMatches = [...svg.matchAll(/<path[^>]+fill="#A5A095"[^>]*>/g)];
  const buildings: Building[] = buildingMatches.map((m, idx) => {
    const dMatch = m[0].match(/d="([^"]+)"/);
    if (!dMatch) throw new Error("Path missing d attribute");
    const pts = (dMatch[1].match(/[-0-9.]+,[-0-9.]+/g) || []).map(s => {
      const parts = s.split(",").map(Number);
      return [parts[0], parts[1]] as Point2D;
    });
    let cx = 0;
    let cy = 0;
    pts.forEach(p => {
      cx += p[0];
      cy += p[1];
    });
    if (pts.length > 0) {
      cx /= pts.length;
      cy /= pts.length;
    }
    return { id: idx, pts, cx, cy };
  });
  console.log(`[extract-alleys] Found ${buildings.length} total buildings`);

  // 3. Parse walls: <path ... stroke-width="1.9" ...>
  const wallMatch = svg.match(/<path[^>]+stroke-width="1\.9"[^>]*>/);
  if (!wallMatch) {
    throw new Error("Could not find wall path in SVG");
  }
  const wallD = wallMatch[0].match(/d="([^"]+)"/)?.[1] || "";
  const wallPts = (wallD.match(/[-0-9.]+,[-0-9.]+/g) || []).map(s => {
    const parts = s.split(",").map(Number);
    return [parts[0], parts[1]] as Point2D;
  });

  let wallCx = 0;
  let wallCy = 0;
  wallPts.forEach(p => {
    wallCx += p[0];
    wallCy += p[1];
  });
  wallCx /= wallPts.length;
  wallCy /= wallPts.length;

  const sortedWall = wallPts
    .slice()
    .sort(
      (a, b) =>
        Math.atan2(a[1] - wallCy, a[0] - wallCx) - Math.atan2(b[1] - wallCy, b[0] - wallCx)
    );

  // Filter buildings inside wall
  const insideBuildings = buildings.filter(b => pointInPoly([b.cx, b.cy], sortedWall));
  console.log(
    `[extract-alleys] ${insideBuildings.length} buildings are inside city wall`
  );

  // 4. Cluster buildings into city blocks (Union-Find by shared vertices)
  const parent: Record<number, number> = {};
  insideBuildings.forEach(b => {
    parent[b.id] = b.id;
  });
  function find(i: number): number {
    if (parent[i] === i) return i;
    parent[i] = find(parent[i]);
    return parent[i];
  }
  function union(i: number, j: number): void {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) parent[rootI] = rootJ;
  }

  const vertMap = new Map<string, number[]>();
  insideBuildings.forEach(b => {
    b.pts.forEach(p => {
      const k = `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;
      let list = vertMap.get(k);
      if (!list) {
        list = [];
        vertMap.set(k, list);
      }
      list.push(b.id);
    });
  });

  for (const list of vertMap.values()) {
    for (let i = 1; i < list.length; i++) {
      union(list[0], list[i]);
    }
  }

  const blocks = new Map<number, Building[]>();
  insideBuildings.forEach(b => {
    const root = find(b.id);
    let list = blocks.get(root);
    if (!list) {
      list = [];
      blocks.set(root, list);
    }
    list.push(b);
  });
  console.log(`[extract-alleys] Clustered into ${blocks.size} city blocks`);

  // 5. Sample points along block perimeters
  const samplePts: Point2D[] = [];
  const sampleBlockIds: number[] = [];

  for (const [root, bList] of blocks.entries()) {
    const edgeCount = new Map<string, number>();
    const edges: { k: string; p1: Point2D; p2: Point2D }[] = [];
    bList.forEach(b => {
      for (let i = 0; i < b.pts.length; i++) {
        const p1 = b.pts[i];
        const p2 = b.pts[(i + 1) % b.pts.length];
        if (p1[0] === p2[0] && p1[1] === p2[1]) continue;
        const k = edgeKey(p1, p2);
        edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
        edges.push({ k, p1, p2 });
      }
    });

    // Edges with count === 1 are perimeter edges of the block
    const perim = edges.filter(e => edgeCount.get(e.k) === 1);
    perim.forEach(e => {
      const dx = e.p2[0] - e.p1[0];
      const dy = e.p2[1] - e.p1[1];
      const len = Math.hypot(dx, dy);
      const n = Math.max(1, Math.round(len / sampleStep));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        samplePts.push([e.p1[0] + dx * t, e.p1[1] + dy * t]);
        sampleBlockIds.push(root);
      }
    });
  }
  console.log(`[extract-alleys] Sampled ${samplePts.length} perimeter points`);

  // 6. Delaunay Triangulation & Voronoi Medial Axis
  const flatPts = new Float64Array(samplePts.length * 2);
  for (let i = 0; i < samplePts.length; i++) {
    flatPts[i * 2] = samplePts[i][0];
    flatPts[i * 2 + 1] = samplePts[i][1];
  }

  const delaunay = new Delaunay(flatPts);
  const voronoi = delaunay.voronoi([-400, -400, 400, 400]);
  const halfedges = delaunay.halfedges;
  const triangles = delaunay.triangles;
  const circumcenters = voronoi.circumcenters;

  const rawSegs: [Point2D, Point2D][] = [];
  for (let e = 0; e < halfedges.length; e++) {
    const opp = halfedges[e];
    if (opp < 0 || opp < e) continue;

    const p1 = triangles[e];
    const p2 = triangles[e % 3 === 2 ? e - 2 : e + 1];

    const b1 = sampleBlockIds[p1];
    const b2 = sampleBlockIds[p2];

    // Only consider edges separating two DIFFERENT blocks
    if (b1 !== b2) {
      const dist = Math.hypot(
        samplePts[p1][0] - samplePts[p2][0],
        samplePts[p1][1] - samplePts[p2][1]
      );
      if (dist >= minGap && dist <= maxGap) {
        const t1 = Math.floor(e / 3);
        const t2 = Math.floor(opp / 3);
        const c1: Point2D = [circumcenters[t1 * 2], circumcenters[t1 * 2 + 1]];
        const c2: Point2D = [circumcenters[t2 * 2], circumcenters[t2 * 2 + 1]];

        const edgeLen = Math.hypot(c1[0] - c2[0], c1[1] - c2[1]);
        if (
          edgeLen < 12 &&
          pointInPoly(c1, sortedWall) &&
          pointInPoly(c2, sortedWall)
        ) {
          rawSegs.push([c1, c2]);
        }
      }
    }
  }
  console.log(`[extract-alleys] Extracted ${rawSegs.length} raw Voronoi alley segments`);

  // 7. Merge coincident Voronoi vertices, preserving densely sampled alley chains.
  // A street can have thousands of vertices less than sampleStep apart. Radius-based
  // transitive union collapses that entire street to a single point. Compare only
  // with fixed representatives instead, using a numerical tolerance by default.
  const allPoints: Point2D[] = [];
  rawSegs.forEach(([c1, c2]) => {
    allPoints.push(c1);
    allPoints.push(c2);
  });

  if (!Number.isFinite(clusterRadius) || clusterRadius <= 0) {
    throw new Error("clusterRadius must be a positive finite number");
  }
  const ptParent: number[] = [];
  const ptFind = (i: number): number => ptParent[i];
  const spatialHash = new Map<string, number[]>();
  allPoints.forEach((p, idx) => {
    const gx = Math.floor(p[0] / clusterRadius);
    const gy = Math.floor(p[1] / clusterRadius);
    let representative = idx;
    let nearestDistance = clusterRadius;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const otherIdx of spatialHash.get(`${gx + dx},${gy + dy}`) || []) {
          const op = allPoints[otherIdx];
          const distance = Math.hypot(p[0] - op[0], p[1] - op[1]);
          if (distance < nearestDistance) {
            representative = otherIdx;
            nearestDistance = distance;
          }
        }
      }
    }
    ptParent.push(representative);
    if (representative === idx) {
      const key = `${gx},${gy}`;
      const bucket = spatialHash.get(key) || [];
      bucket.push(idx);
      spatialHash.set(key, bucket);
    }
  });

  const clusterPts = new Map<number, Point2D[]>();
  allPoints.forEach((p, idx) => {
    const root = ptFind(idx);
    let pts = clusterPts.get(root);
    if (!pts) {
      pts = [];
      clusterPts.set(root, pts);
    }
    pts.push(p);
  });

  const clusterCentroid = new Map<number, Point2D>();
  for (const [root, pts] of clusterPts.entries()) {
    let sxTotal = 0;
    let syTotal = 0;
    pts.forEach(p => {
      sxTotal += p[0];
      syTotal += p[1];
    });
    clusterCentroid.set(root, [sxTotal / pts.length, syTotal / pts.length]);
  }

  const graph = new Map<number, Set<number>>();
  function addEdge(u: number, v: number): void {
    if (u === v) return;
    let uSet = graph.get(u);
    if (!uSet) {
      uSet = new Set();
      graph.set(u, uSet);
    }
    let vSet = graph.get(v);
    if (!vSet) {
      vSet = new Set();
      graph.set(v, vSet);
    }
    uSet.add(v);
    vSet.add(u);
  }

  rawSegs.forEach((_, segIdx) => {
    const u = ptFind(segIdx * 2);
    const v = ptFind(segIdx * 2 + 1);
    addEdge(u, v);
  });

  // 8. Trace polylines through the alley graph
  const visited = new Set<string>();
  const polylines: Point2D[][] = [];
  const roots = [...graph.keys()];
  const nonDeg2 = roots.filter(r => graph.get(r)?.size !== 2);
  const startNodes = [...nonDeg2, ...roots.filter(r => graph.get(r)?.size === 2)];

  for (const start of startNodes) {
    const neighbors = graph.get(start);
    if (!neighbors) continue;
    for (const next of neighbors) {
      const ek = start < next ? `${start}_${next}` : `${next}_${start}`;
      if (visited.has(ek)) continue;

      visited.add(ek);
      const startPt = clusterCentroid.get(start);
      const nextPt = clusterCentroid.get(next);
      if (!startPt || !nextPt) continue;

      const path: Point2D[] = [startPt, nextPt];
      let curr = next;
      let prev = start;

      while (graph.get(curr)?.size === 2) {
        const nextNext = [...(graph.get(curr) || [])].find(n => n !== prev);
        if (nextNext === undefined) break;
        const nek = curr < nextNext ? `${curr}_${nextNext}` : `${nextNext}_${curr}`;
        if (visited.has(nek)) break;
        visited.add(nek);

        prev = curr;
        curr = nextNext;
        const pt = clusterCentroid.get(curr);
        if (!pt) break;
        path.push(pt);
      }
      polylines.push(path);
    }
  }

  // 9. Simplify polylines and filter short noisy branches
  const simplifiedPolylines = polylines
    .map(p => simplifyPolyline(p, simplifyTolerance))
    .filter(p => {
      let l = 0;
      for (let i = 0; i < p.length - 1; i++) {
        l += Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
      }
      return l >= minPathLength;
    });

  let totalLength = 0;
  simplifiedPolylines.forEach(p => {
    for (let i = 0; i < p.length - 1; i++) {
      totalLength += Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
    }
  });

  console.log(
    `[extract-alleys] Extracted ${simplifiedPolylines.length} alley polylines (total map length: ${totalLength.toFixed(1)})`
  );

  // 10. Give every straight segment its own selectable element and stable ID
  // for this input/options, retaining the source polyline number for reference.
  const segmentPaths: string[] = [];
  simplifiedPolylines.forEach((points, polylineIndex) => {
    for (let i = 1; i < points.length; i++) {
      const start = points[i - 1];
      const end = points[i];
      const d = ` M ${(start[0] * sx + tx).toFixed(2)},${(start[1] * sy + ty).toFixed(2)} L ${(end[0] * sx + tx).toFixed(2)},${(end[1] * sy + ty).toFixed(2)}`;
      const id = `alley-${polylineIndex + 1}-segment-${i}`;
      segmentPaths.push(
        `    <path id="${id}" data-polyline="${polylineIndex + 1}" d="${d}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"><title>${id}</title></path>`
      );
    }
  });

  const alleyGroup = `\n  <g id="alleys" class="layer-alleys">\n${segmentPaths.join("\n")}\n  </g>`;

  // 11. Insert new group before closing </svg>
  const insertIndex = svg.lastIndexOf("</svg>");
  if (insertIndex === -1) {
    throw new Error("Could not find closing </svg> tag in input file");
  }

  const newSvg = `${svg.slice(0, insertIndex)}${alleyGroup}\n</svg>`;

  // Ensure output directory exists
  const outDir = path.dirname(outputSvgPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outputSvgPath, newSvg, "utf8");
  console.log(`[extract-alleys] Successfully wrote new SVG to: ${outputSvgPath}`);

  return {
    polylinesCount: simplifiedPolylines.length,
    totalLength,
    blocksCount: blocks.size,
    insideBuildingsCount: insideBuildings.length
  };
}

// CLI entry point
if (require.main === module || process.argv[1]?.endsWith("extract-alleys.ts")) {
  const args = process.argv.slice(2);
  const inputSvg = args[0] || "temp/samples/greyfield.svg";
  const outputSvg = args[1] || "temp/samples/greyfield_with_alleys.svg";

  console.log("=== Extract Alleys Script ===");
  console.log(`Input:  ${inputSvg}`);
  console.log(`Output: ${outputSvg}`);

  try {
    const stats = extractAlleys({
      inputSvgPath: inputSvg,
      outputSvgPath: outputSvg,
      strokeColor: "lime",
      strokeWidth: 5
    });
    console.log("=== Extraction Completed Successfully ===");
    console.log(`- Inside buildings: ${stats.insideBuildingsCount}`);
    console.log(`- City blocks:     ${stats.blocksCount}`);
    console.log(`- Alley polylines: ${stats.polylinesCount}`);
    console.log(`- Total length:    ${stats.totalLength.toFixed(1)}`);
  } catch (err) {
    console.error("[extract-alleys] Error:", err);
    process.exit(1);
  }
}
