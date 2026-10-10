import { facePoints } from "../mesh";
import type { CityDocument, Id, Point } from "../types";
import { waterPolygons } from "../waterGeometry";
import { ferryLandingReserves } from "./ferryLanding";
import {
  nearestOnPolyline,
  pointInPolygon,
  polygonCentroid,
  segmentInteriorInPolygon,
  segmentSegmentHit
} from "./geom";
import { type HarborWaterField, harborWaterField, seaBerthIsNavigable } from "./harborNavigation";
import { convexInfillParts } from "./lotGeometry";
import { corridor, distance, intersectConvex, plotArea, subtractConvex } from "./parcelGeometry";
import type { OpenSpace, ParcelFrontage } from "./parcelTypes";
import { riverPortShore } from "./riverPortShore";

export interface HarborPier {
  id: Id;
  waterFaceId: Id;
  /** Ribbon rivers have no water mesh face. */
  riverId?: Id;
  depth: number;
  polygon: Point[];
  start?: Point;
  end?: Point;
  width?: number;
  reach?: number;
}

export interface HarborCrane {
  id: Id;
  kind: "treadwheel" | "derrick" | "romanMagnaRota";
  point: Point;
  armAngleRad: number;
  radiusMeters: number;
  armLengthMeters: number;
}

export interface HarborCargoPile {
  id: Id;
  kind: "crates" | "barrels" | "ballast";
  point: Point;
  widthMeters: number;
  heightMeters: number;
  rotation: number;
}

export interface HarborPlan {
  spaces: OpenSpace[];
  frontages: ParcelFrontage[];
  piers: HarborPier[];
  cranes: HarborCrane[];
  cargoPiles: HarborCargoPile[];
  /** Distinct shared spaces; private warehouse yards are measured separately. */
  sharedArea: number;
}
interface Shore {
  riverId?: Id;
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
  isFree: (polygon: Point[]) => boolean = () => true,
  throughStreets: ParcelFrontage[] = streets
): HarborPlan {
  const plan: HarborPlan = { spaces: [], frontages: [], piers: [], cranes: [], cargoPiles: [], sharedArea: 0 };
  const shores: Shore[] = [];
  barriers = [...barriers, ...waterPolygons(document).flatMap(convexInfillParts), ...ferryLandingReserves(document)];
  const land = Object.values(document.mesh.faces)
    .filter(
      f =>
        f.properties.water === "land" &&
        f.properties.buildable &&
        !["park", "farm", "cemetery", "empty", "castle"].includes(f.properties.ward ?? "empty")
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
    const physical = riverPortShore(document, harbor.id);
    if (physical) {
      if (!shores.some(s => s.landId === harbor.id))
        shores.push({
          id: `bank:${harbor.id}`,
          landId: harbor.id,
          waterId: water.id,
          ...physical,
          depth: water.properties.depth ?? 3
        });
      continue;
    }
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
  // Partially wet cells need not share a mesh edge with a water cell.
  for (const face of Object.values(document.mesh.faces)) {
    if (shores.some(s => s.landId === face.id)) continue;
    const physical = riverPortShore(document, face.id);
    if (!physical || !face.properties.buildable) continue;
    shores.push({ ...physical, id: `bank:${face.id}`, landId: face.id, waterId: "", depth: 1 });
  }
  // Explicit river harbour: bank work strips and short piers. A river alone
  // does not establish a navigable port or a sea berth.
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
          const shift = river.style.widthMeters / 2;
          const start: Point = [a[0] + inward[0] * shift, a[1] + inward[1] * shift];
          const end: Point = [b[0] + inward[0] * shift, b[1] + inward[1] * shift];
          if (nearestOnPolyline(center, [start, end]).dist > 30) continue;
          shores.push({
            id: `${river.id}:${i}:${faceId}`,
            landId: faceId,
            waterId: "",
            riverId: river.id,
            a: start,
            b: end,
            inward,
            length: len,
            // The explicit river harbour supplies navigation evidence. Keep
            // the deck within one quarter of the channel, leaving a fairway.
            depth: 1,
            water: corridor(a, b, river.style.widthMeters)
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
  // Reserve the whole physical bank inside each harbour cell, rather than
  // only the single segment selected for its berth.
  if (document.waterAccess?.port.river)
    for (const face of Object.values(document.mesh.faces)) {
      if (face.properties.ward !== "harbor" || face.properties.water !== "land" || !face.properties.buildable) continue;
      for (const area of document.waterAreas ?? []) {
        if (area.kind !== "river") continue;
        for (let i = 0; i < area.polygon.length; i++) {
          const a = area.polygon[i],
            b = area.polygon[(i + 1) % area.polygon.length];
          const length = distance(a, b);
          if (length < 1) continue;
          let inward: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length];
          const mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
          if (pointInPolygon([mid[0] + inward[0], mid[1] + inward[1]], area.polygon)) inward = [-inward[0], -inward[1]];
          const shift = (p: Point): Point => [p[0] + inward[0] * 6, p[1] + inward[1] * 6];
          addSpace(
            {
              id: `bank:${face.id}:${i}`,
              landId: face.id,
              waterId: "",
              a,
              b,
              inward,
              length,
              depth: 1,
              water: area.polygon
            },
            corridor(shift(a), shift(b), 12),
            "quay"
          );
        }
      }
    }
  const berthByWater = new Map<Id, Shore>();
  const berthCandidates = new Map<Id, Shore[]>();
  const usableShores: { shore: Shore; midpoint: Point; stripWidth: number; qA: Point; qB: Point }[] = [];
  const period = document.historicalPeriod ?? "ageOfExploration";
  const isExplorationOrLater = [
    "ageOfExploration",
    "maritimeEra",
    "preIndustrialEra",
    "steamEra",
    "industrialChemistryEra",
    "petroleumEra",
    "rocketryEra"
  ].includes(period);
  const isAncient = period === "classicalAntiquity";

  for (const shore of shores) {
    if (
      (shore.waterId || shore.riverId) &&
      (shore.depth >= 3 || !!shore.riverId) &&
      shore.length > (berthByWater.get(shore.waterId || shore.id)?.length ?? 0)
    )
      berthByWater.set(shore.waterId || shore.id, shore);
    if ((shore.waterId || shore.riverId) && (shore.depth >= 3 || !!shore.riverId)) {
      const key = shore.waterId || shore.id;
      berthCandidates.set(key, [...(berthCandidates.get(key) ?? []), shore]);
    }

    const params = document.fabric?.districts.find(d => d.faceIds.includes(shore.landId))?.parameters;
    const preset = params?.harborPreset ?? "dense";
    const stripWidth =
      preset === "small"
        ? 4
        : isExplorationOrLater
          ? preset === "warehouse"
            ? 14
            : 12
          : preset === "warehouse"
            ? 8
            : 6;
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
    const minYardLength = isExplorationOrLater ? 16 : 24;
    const yardWidth = isExplorationOrLater ? (preset === "warehouse" ? 18 : 14) : preset === "warehouse" ? 14 : 10;
    if (preset !== "small" && shore.length >= minYardLength) {
      const center = shift(midpoint, stripWidth / 2 + yardWidth / 2);
      const tangent: Point = [(shore.b[0] - shore.a[0]) / shore.length, (shore.b[1] - shore.a[1]) / shore.length];
      const half = Math.min(16, shore.length / (isExplorationOrLater ? 3 : 4));
      addSpace(
        shore,
        corridor(
          [center[0] - tangent[0] * half, center[1] - tangent[1] * half],
          [center[0] + tangent[0] * half, center[1] + tangent[1] * half],
          yardWidth
        ),
        "loading-yard"
      );
    }
    usableShores.push({ shore, midpoint, stripWidth, qA, qB });
  }

  // Select primary berths for cranes (1 or 2 cranes max per harbor, prioritized by berth quality)
  // Cranes and dedicated loading yards are for trading/commercial ports, not small fishing landings.
  const candidateShores = usableShores
    .filter(u => {
      const params = document.fabric?.districts.find(d => d.faceIds.includes(u.shore.landId))?.parameters;
      const preset = params?.harborPreset ?? "dense";
      return preset !== "small";
    })
    .map(u => {
      const isPrimaryBerth = Array.from(berthByWater.values()).some(b => b.id === u.shore.id);
      const score = (isPrimaryBerth ? 100 : 0) + u.shore.length * 2 + u.shore.depth * 5;
      return { ...u, score };
    })
    .sort((a, b) => b.score - a.score);

  const selectedForCrane: typeof candidateShores = [];
  const maxCranes = candidateShores.length >= 4 ? 2 : candidateShores.length > 0 ? 1 : 0;
  for (const c of candidateShores) {
    if (selectedForCrane.length >= maxCranes) break;
    if (selectedForCrane.length === 0 || selectedForCrane.every(other => distance(other.midpoint, c.midpoint) > 28)) {
      selectedForCrane.push(c);
    }
  }

  for (const { shore, midpoint, stripWidth } of selectedForCrane) {
    const params = document.fabric?.districts.find(d => d.faceIds.includes(shore.landId))?.parameters;
    const preset = params?.harborPreset ?? "dense";
    if (preset === "small") continue;

    const shift = (p: Point, d: number): Point => [p[0] + shore.inward[0] * d, p[1] + shore.inward[1] * d];
    // Ensure there is a dedicated loading yard behind the crane for staging cargo and unloading
    const hasYard = plan.spaces.some(s => s.kind === "loading-yard" && s.faceId === shore.landId);
    if (!hasYard) {
      const yardWidth = isExplorationOrLater ? 16 : 12;
      const center = shift(midpoint, stripWidth / 2 + yardWidth / 2);
      const tangent: Point = [(shore.b[0] - shore.a[0]) / shore.length, (shore.b[1] - shore.a[1]) / shore.length];
      const half = Math.min(16, Math.max(8, shore.length / 2.5));
      addSpace(
        shore,
        corridor(
          [center[0] - tangent[0] * half, center[1] - tangent[1] * half],
          [center[0] + tangent[0] * half, center[1] + tangent[1] * half],
          yardWidth
        ),
        "loading-yard"
      );
    }

    const craneKind: HarborCrane["kind"] = isExplorationOrLater
      ? "treadwheel"
      : isAncient
        ? "romanMagnaRota"
        : period === "lateMedieval" || period === "highMedieval"
          ? "treadwheel"
          : "derrick";
    const armAngleRad = Math.atan2(-shore.inward[1], -shore.inward[0]);
    const radiusMeters = craneKind === "treadwheel" ? 2.8 : 2;
    const tangent: Point = [(shore.b[0] - shore.a[0]) / shore.length, (shore.b[1] - shore.a[1]) / shore.length];
    // Fit the entire footprint in the reserved apron, leaving roads and the
    // cross-quay cart approach unobstructed. Omit equipment if no safe fit exists.
    const fits = (point: Point, radius: number): boolean => {
      const footprint: Point[] = Array.from({ length: 16 }, (_, i) => {
        const angle = (i * Math.PI) / 8;
        return [point[0] + Math.cos(angle) * radius, point[1] + Math.sin(angle) * radius];
      });
      const area = plotArea(footprint);
      const covered = plan.spaces
        .filter(s => s.faceId === shore.landId)
        .reduce((sum, s) => sum + plotArea(intersectConvex(footprint, s.polygon)), 0);
      return (
        covered >= area - 0.01 &&
        isFree(footprint) &&
        [...throughStreets, ...plan.frontages.filter(f => f.widthMeters === 3)].every(
          f => nearestOnPolyline(point, [f.a, f.b]).dist >= radius + f.widthMeters / 2 + 0.8
        ) &&
        plan.cranes.every(c => distance(point, c.point) >= radius + c.radiusMeters + 1)
      );
    };
    const candidates: Point[] = [];
    for (const depth of [radiusMeters + 0.8, stripWidth / 2, stripWidth - radiusMeters - 0.8])
      for (const along of [0, -7, 7, -14, 14]) {
        if (Math.abs(along) + radiusMeters + 1 > shore.length / 2) continue;
        candidates.push([
          midpoint[0] + tangent[0] * along + shore.inward[0] * (depth - stripWidth / 2),
          midpoint[1] + tangent[1] * along + shore.inward[1] * (depth - stripWidth / 2)
        ]);
      }
    const cranePt = candidates.find(p => fits(p, radiusMeters + 0.4));
    if (!cranePt) continue;
    plan.cranes.push({
      id: `crane:${shore.id}:0`,
      kind: craneKind,
      point: cranePt,
      armAngleRad,
      radiusMeters,
      armLengthMeters: Math.max(
        craneKind === "treadwheel" ? 6.5 : 4.5,
        nearestOnPolyline(cranePt, [shore.a, shore.b]).dist + 1.5
      )
    });

    if (isExplorationOrLater) {
      const tangent: Point = [(shore.b[0] - shore.a[0]) / shore.length, (shore.b[1] - shore.a[1]) / shore.length];
      const p1 = shift([midpoint[0] + tangent[0] * 6.5, midpoint[1] + tangent[1] * 6.5], stripWidth * 0.55);
      const p2 = shift([midpoint[0] - tangent[0] * 7.5, midpoint[1] - tangent[1] * 7.5], stripWidth * 0.55);
      const piles: HarborCargoPile[] = [
        {
          id: `cargo:${shore.id}:barrels`,
          kind: "barrels",
          point: p1,
          widthMeters: 3.5,
          heightMeters: 2.2,
          rotation: Math.atan2(tangent[1], tangent[0])
        },
        {
          id: `cargo:${shore.id}:crates`,
          kind: "crates",
          point: p2,
          widthMeters: 4.2,
          heightMeters: 2.8,
          rotation: Math.atan2(tangent[1], tangent[0]) + 0.15
        }
      ];
      for (const pile of piles) {
        const radius = Math.hypot(pile.widthMeters, pile.heightMeters) / 2 + 0.4;
        const positions = [
          pile.point,
          ...plan.spaces
            .filter(s => s.faceId === shore.landId && s.kind === "loading-yard")
            .flatMap(s => {
              const c = polygonCentroid(s.polygon);
              return [c, ...s.polygon.map(p => [(p[0] + c[0]) / 2, (p[1] + c[1]) / 2] as Point)];
            })
        ];
        const point = positions.find(
          p =>
            fits(p, radius) &&
            plan.cargoPiles.every(
              other => distance(p, other.point) >= radius + Math.hypot(other.widthMeters, other.heightMeters) / 2 + 0.5
            )
        );
        if (point) plan.cargoPiles.push({ ...pile, point });
      }
    }
  }
  let field: HarborWaterField | undefined;
  const waterField = () => {
    field ??= harborWaterField(document);
    return field;
  };
  // The longest shore of each water body is preferred; when its pier head
  // would be boxed in (a cove, a narrow inlet), the next shore is tried.
  for (const candidates of berthCandidates.values())
    for (const shore of candidates.sort((a, b) => b.length - a.length)) {
      const before = plan.piers.length;
      addPiers(shore);
      if (plan.piers.length > before) break;
    }
  plan.sharedArea = plan.spaces.reduce((a, s) => a + plotArea(s.polygon), 0);
  return plan;

  function addPiers(shore: Shore): void {
    const count = shore.length >= 50 ? 2 : 1;
    const width = Math.min(
      isExplorationOrLater ? 6.2 : 5.2,
      Math.max(isExplorationOrLater ? 4.8 : 4.0, shore.length * 0.16)
    );
    const fractions = count === 2 ? [0.28, 0.72] : [0.5];
    for (let i = 0; i < count; i++) {
      const t = fractions[i];
      const bank: Point = [shore.a[0] + (shore.b[0] - shore.a[0]) * t, shore.a[1] + (shore.b[1] - shore.a[1]) * t];
      const start: Point = [bank[0] + shore.inward[0] * 1.2, bank[1] + shore.inward[1] * 1.2];
      if (
        !pointInPolygon(start, facePoints(document.mesh, document.mesh.faces[shore.landId])) ||
        pointInPolygon(start, shore.water)
      )
        continue;
      const end = (d: number): Point => [bank[0] - shore.inward[0] * d, bank[1] - shore.inward[1] * d];
      let reach = 0;
      const rayEnd = end(document.frame.extentMeters * 2);
      const exits = shore.water.flatMap((p, j) => {
        const hit = segmentSegmentHit(bank, rayEnd, p, shore.water[(j + 1) % shore.water.length]);
        return hit && distance(bank, hit.point) > 1 ? [distance(bank, hit.point)] : [];
      });
      const maxReachLimit = shore.riverId ? Math.min(...exits) / 4 : isExplorationOrLater ? 42 : 28;
      const reachCap = Math.min(
        maxReachLimit,
        Math.max(isExplorationOrLater ? 32 : 22, shore.length * (isExplorationOrLater ? 0.75 : 0.5))
      );
      for (let d = 0.5; d <= reachCap; d += 0.5) {
        const deck = corridor(start, end(d), width);
        if (!deck.slice(1, 3).every(p => pointInPolygon(p, shore.water))) {
          // A curved bank can leave the first half-metre of the deck on land.
          // Find the wet end before stopping at the opposite bank.
          if (reach > 0) break;
          continue;
        }
        reach = d;
      }
      if (reach < 3) continue;
      // River berths (ribbon or physical `bank:`) keep their own fairway rule;
      // sea berths need a basin to swing in and a channel out to open water.
      const riverBerth = !!shore.riverId || shore.id.startsWith("bank:");
      if (!riverBerth && !seaBerthIsNavigable(waterField(), end(reach))) continue;
      plan.piers.push({
        id: `pier:${shore.id}:${i}`,
        waterFaceId: shore.waterId,
        ...(shore.riverId ? { riverId: shore.riverId } : {}),
        depth: shore.depth,
        polygon: corridor(start, end(reach), width),
        start,
        end: end(reach),
        width,
        reach
      });
    }
  }
}

/** Split at every apron boundary, including an off-centre crossing whose
 * original segment midpoint lies outside the yard. */
export function harborLaneRuns(points: Point[], spaces: OpenSpace[]): Point[][] {
  const runs: Point[][] = [];
  let current: Point[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const cuts = [
      { point: a, t: 0 },
      { point: b, t: 1 }
    ];
    for (const space of spaces)
      for (let j = 0; j < space.polygon.length; j++) {
        const hit = segmentSegmentHit(a, b, space.polygon[j], space.polygon[(j + 1) % space.polygon.length]);
        if (hit && !cuts.some(c => Math.abs(c.t - hit.t) < 1e-8)) cuts.push(hit);
      }
    cuts.sort((p, q) => p.t - q.t);
    for (let j = 1; j < cuts.length; j++) {
      const start = cuts[j - 1].point,
        end = cuts[j].point;
      if (spaces.some(s => segmentInteriorInPolygon(start, end, s.polygon))) {
        if (current.length > 1) runs.push(current);
        current = [];
      } else {
        if (!current.length) current.push(start);
        current.push(end);
      }
    }
  }
  if (current.length > 1) runs.push(current);
  return runs;
}
