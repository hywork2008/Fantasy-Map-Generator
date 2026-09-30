import { facePoints } from "../mesh";
import type { CityDocument, Id, Point } from "../types";
import { nearestOnPolyline, pointInPolygon, polygonCentroid } from "./geom";
import { convexInfillParts } from "./lotGeometry";
import { corridor, distance, intersectConvex, plotArea, subtractConvex } from "./parcelGeometry";
import type { OpenSpace, ParcelFrontage } from "./parcelTypes";

export interface HarborPier {
  id: Id;
  waterFaceId: Id;
  depth: number;
  polygon: Point[];
}
export interface HarborPlan {
  spaces: OpenSpace[];
  frontages: ParcelFrontage[];
  piers: HarborPier[];
  /** Distinct shared spaces; private warehouse yards are measured separately. */
  sharedArea: number;
}
interface Shore {
  id: Id;
  landId: Id;
  waterId: Id;
  a: Point;
  b: Point;
  inward: Point;
  length: number;
  depth: number;
  water: Point[];
}

/** One plan supplies both cargo access and the visible piers. Inland river ports
 * require an explicit harbor element; a river alone is not navigation evidence. */
export function planHarbor(
  document: CityDocument,
  streets: ParcelFrontage[],
  barriers: Point[][],
  isFree: (polygon: Point[]) => boolean = () => true
): HarborPlan {
  const plan: HarborPlan = { spaces: [], frontages: [], piers: [], sharedArea: 0 };
  const shores: Shore[] = [];
  const land = Object.values(document.mesh.faces)
    .filter(
      f =>
        f.properties.water === "land" &&
        f.properties.buildable &&
        !["park", "farm", "empty", "castle"].includes(f.properties.ward ?? "empty")
    )
    .map(f => ({ id: f.id, polygon: facePoints(document.mesh, f) }));
  const reserved = new Set(
    document.elements.filter(e => e.kind !== "harbor" && e.kind !== "tree").flatMap(e => e.faceIds)
  );
  const walls = new Set(
    document.featureGroups
      .filter(g => g.kind === "wall")
      .flatMap(g => (g.kind !== "river" ? g.segments.map(s => s.edgeId) : []))
  );
  for (const edge of Object.values(document.mesh.edges)) {
    const left = document.mesh.faces[edge.leftFace ?? ""],
      right = document.mesh.faces[edge.rightFace ?? ""];
    if (!left || !right) continue;
    const harbor = left.properties.ward === "harbor" && left.properties.water === "land" ? left : right;
    const water = harbor === left ? right : left;
    if (
      harbor.properties.ward !== "harbor" ||
      harbor.properties.water !== "land" ||
      !harbor.properties.buildable ||
      water.properties.water !== "sea" ||
      walls.has(edge.id)
    )
      continue;
    const a = document.mesh.vertices[edge.a].point,
      b = document.mesh.vertices[edge.b].point;
    const length = distance(a, b);
    if (length < 10) continue;
    const center = polygonCentroid(facePoints(document.mesh, harbor));
    let inward: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
    if ((center[0] - a[0]) * inward[0] + (center[1] - a[1]) * inward[1] < 0) inward = [-inward[0], -inward[1]];
    shores.push({
      id: edge.id,
      landId: harbor.id,
      waterId: water.id,
      a,
      b,
      inward,
      length,
      depth: water.properties.depth ?? 3,
      water: facePoints(document.mesh, water)
    });
  }
  // Explicit river harbor: work strip along its bank, without inferring piers in
  // shallow rivers or turning a river segment into a sea berth.
  for (const element of document.elements.filter(e => e.kind === "harbor")) {
    for (const faceId of element.faceIds) {
      const face = document.mesh.faces[faceId];
      if (face?.properties.ward !== "harbor" || shores.some(s => s.landId === faceId)) continue;
      const polygon = facePoints(document.mesh, face);
      const center = polygonCentroid(polygon);
      for (const river of document.featureGroups.filter(g => g.kind === "river"))
        for (let i = 1; i < river.vertices.length; i++) {
          const a = document.mesh.vertices[river.vertices[i - 1]].point,
            b = document.mesh.vertices[river.vertices[i]].point;
          const len = distance(a, b);
          if (len < 10 || nearestOnPolyline(center, [a, b]).dist > Math.max(30, river.style.widthMeters + 15)) continue;
          let inward: Point = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
          if ((center[0] - a[0]) * inward[0] + (center[1] - a[1]) * inward[1] < 0) inward = [-inward[0], -inward[1]];
          const shift = river.style.widthMeters / 2 + 2;
          const start: Point = [a[0] + inward[0] * shift, a[1] + inward[1] * shift];
          const end: Point = [b[0] + inward[0] * shift, b[1] + inward[1] * shift];
          if (nearestOnPolyline(center, [start, end]).dist > 30) continue;
          shores.push({
            id: `${river.id}:${i}:${faceId}`,
            landId: faceId,
            waterId: "",
            a: start,
            b: end,
            inward,
            length: len,
            depth: 0,
            water: []
          });
        }
    }
  }
  const addSpace = (shore: Shore, poly: Point[], kind: OpenSpace["kind"]) => {
    const face = document.mesh.faces[shore.landId];
    if (!face || poly.length < 3) return;
    for (const part of convexInfillParts(facePoints(document.mesh, face))) {
      let pieces = [intersectConvex(poly, part)].filter(p => p.length >= 3 && plotArea(p) >= 4);
      for (const obstacle of [...barriers, ...plan.spaces.map(s => s.polygon)])
        pieces = pieces.flatMap(p => subtractConvex(p, obstacle, 4));
      for (const polygon of pieces) {
        if (!isFree(polygon)) continue;
        plan.spaces.push({
          id: `harbor:${shore.id}:${kind}:${plan.spaces.length}`,
          faceId: shore.landId,
          kind,
          polygon,
          access: "shared"
        });
      }
    }
  };
  const berthByWater = new Map<Id, Shore>();
  for (const shore of shores) {
    const params = document.fabric?.districts.find(d => d.faceIds.includes(shore.landId))?.parameters;
    const preset = params?.harborPreset ?? "dense";
    const stripWidth = preset === "small" ? 4 : preset === "warehouse" ? 8 : 6;
    const shift = (p: Point, d: number): Point => [p[0] + shore.inward[0] * d, p[1] + shore.inward[1] * d];
    const qA = shift(shore.a, stripWidth / 2),
      qB = shift(shore.b, stripWidth / 2);
    addSpace(shore, corridor(qA, qB, stripWidth), "quay");
    const midpoint: Point = [(qA[0] + qB[0]) / 2, (qA[1] + qB[1]) / 2];
    const candidates = streets
      .map(s => ({ street: s, hit: nearestOnPolyline(midpoint, [s.a, s.b]) }))
      .filter(c => c.hit.dist < 100 && c.hit.dist >= 1)
      .sort((a, b) => a.hit.dist - b.hit.dist);
    const connection = candidates.find(({ hit }) => {
      const path = corridor(midpoint, hit.point, 3, 0);
      if (!isFree(path)) return false;
      if (barriers.some(b => plotArea(intersectConvex(path, b)) > 0.01)) return false;
      const steps = Math.max(2, Math.ceil(hit.dist / 1.5));
      const normal: Point = [-(hit.point[1] - midpoint[1]) / hit.dist, (hit.point[0] - midpoint[0]) / hit.dist];
      return Array.from({ length: steps + 1 }, (_, i) => i / steps).every(t => {
        const p: Point = [
          midpoint[0] + (hit.point[0] - midpoint[0]) * t,
          midpoint[1] + (hit.point[1] - midpoint[1]) * t
        ];
        return [-1.5, 0, 1.5].every(offset => {
          const edge: Point = [p[0] + normal[0] * offset, p[1] + normal[1] * offset];
          return land.some(f => !reserved.has(f.id) && pointInPolygon(edge, f.polygon));
        });
      });
    });
    if (!connection) continue;
    const usableStrip = plan.spaces.some(
      s => s.kind === "quay" && s.faceId === shore.landId && pointInPolygon(midpoint, s.polygon)
    );
    if (!usableStrip) continue;
    plan.frontages.push({ a: qA, b: qB, widthMeters: stripWidth, cargo: true });
    plan.frontages.push({ a: midpoint, b: connection.hit.point, widthMeters: 3, cargo: true });
    // Larger hubs get local aprons; a small port still keeps its strip and path.
    if (preset !== "small" && shore.length >= 28) {
      const center = shift(midpoint, stripWidth / 2 + 5);
      const tangent: Point = [(shore.b[0] - shore.a[0]) / shore.length, (shore.b[1] - shore.a[1]) / shore.length];
      const half = Math.min(12, shore.length / 4);
      addSpace(
        shore,
        corridor(
          [center[0] - tangent[0] * half, center[1] - tangent[1] * half],
          [center[0] + tangent[0] * half, center[1] + tangent[1] * half],
          preset === "warehouse" ? 14 : 10
        ),
        "loading-yard"
      );
    }
    if (shore.waterId && shore.depth >= 3 && shore.length > (berthByWater.get(shore.waterId)?.length ?? 0))
      berthByWater.set(shore.waterId, shore);
  }
  for (const shore of berthByWater.values()) {
    const count = shore.length >= 35 ? 3 : 2;
    const width = Math.min(3, shore.length / (count * 5));
    for (let i = 0; i < count; i++) {
      const t = (i + 1) / (count + 1);
      const start: Point = [shore.a[0] + (shore.b[0] - shore.a[0]) * t, shore.a[1] + (shore.b[1] - shore.a[1]) * t];
      const end = (d: number): Point => [start[0] - shore.inward[0] * d, start[1] - shore.inward[1] * d];
      let reach = 0;
      for (let d = 0.5; d <= Math.min(26, shore.length * (0.4 + (i % 2) * 0.06)); d += 0.5) {
        const deck = corridor(start, end(d), width);
        if (!deck.slice(1, 3).every(p => pointInPolygon(p, shore.water))) break;
        reach = d;
      }
      if (reach >= 3)
        plan.piers.push({
          id: `pier:${shore.id}:${i}`,
          waterFaceId: shore.waterId,
          depth: shore.depth,
          polygon: corridor(start, end(reach), width)
        });
    }
  }
  plan.sharedArea = plan.spaces.reduce((a, s) => a + plotArea(s.polygon), 0);
  return plan;
}
