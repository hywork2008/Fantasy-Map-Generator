import { pointInPolygon, polygonCentroid } from "../generators/geom";
import type { HarborPlan } from "../generators/harborFabric";
import { harborLandFace, harborRootIsDry } from "../generators/harborLand";
import { type HarborWaterField, harborWaterField, seaBerthIsNavigable } from "../generators/harborNavigation";
import { facePoints } from "../generators/mesh";
import { riverPortShore } from "../generators/riverPortShore";
import type { CityDocument, Id, Point } from "../types/document";

/** A sea berth placed on a harbor-ward shore when the harbor plan has no piers of its own. */
export interface FallbackPier {
  waterFaceId: Id;
  depthMeters: number;
  /** Four deck corners, shore end first. */
  deck: Point[];
}

/** The planned piers whose landing cell still exists. Read-only; decides which piers are drawn. */
export function plannedHarborPiers(document: CityDocument, harbor: HarborPlan | undefined): HarborPlan["piers"] {
  return (harbor?.piers ?? []).filter(p => !p.landFaceId || harborLandFace(document, p.landFaceId));
}

/**
 * Piers laid on harbor-ward sea shores: one per sea cell, kept inside the
 * receiving water, on dry ground, and clear of coves. Read-only.
 */
export function fallbackHarborPiers(document: CityDocument): FallbackPier[] {
  // One shoreline per sea cell; a manually assigned ward needs no landmark.
  const shores = new Map<
    Id,
    { a: Point; b: Point; ring: Point[]; length: number; depth: number; inward?: Point; river: boolean; landFaceId: Id }
  >();
  for (const edge of Object.values(document.mesh.edges)) {
    const left = edge.leftFace ? document.mesh.faces[edge.leftFace] : null;
    const right = edge.rightFace ? document.mesh.faces[edge.rightFace] : null;
    if (!left || !right) continue;
    const land = left.properties.water === "land" ? left : right;
    const water = land === left ? right : left;
    if (land.properties.water !== "land" || land.properties.ward !== "harbor" || water.properties.water !== "sea")
      continue;
    const depth = water.properties.depth ?? 3;
    if (!Number.isFinite(depth) || depth < 3) continue;
    const physical = riverPortShore(document, land.id);
    const a = physical?.a ?? document.mesh.vertices[edge.a].point;
    const b = physical?.b ?? document.mesh.vertices[edge.b].point;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 10 || length <= (shores.get(water.id)?.length ?? 0)) continue;
    shores.set(water.id, {
      a,
      b,
      ring: physical?.water ?? facePoints(document.mesh, water),
      length,
      depth,
      inward: physical?.inward,
      river: !!physical,
      landFaceId: land.id
    });
  }
  const piers: FallbackPier[] = [];
  let field: HarborWaterField | undefined;
  for (const [waterId, { a, b, ring, length, depth, inward, river, landFaceId }] of shores) {
    const center = polygonCentroid(ring);
    const tangent: Point = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    let normal: Point = inward ? [-inward[0], -inward[1]] : [-tangent[1], tangent[0]];
    if (!inward && (center[0] - a[0]) * normal[0] + (center[1] - a[1]) * normal[1] < 0)
      normal = [-normal[0], -normal[1]];
    const isExploration = [
      "ageOfExploration",
      "maritimeEra",
      "preIndustrialEra",
      "steamEra",
      "industrialChemistryEra",
      "petroleumEra",
      "rocketryEra"
    ].includes(document.historicalPeriod ?? "ageOfExploration");
    const count = length >= 50 ? 2 : 1;
    const width = Math.min(isExploration ? 6.2 : 5.2, Math.max(isExploration ? 4.8 : 4.0, length * 0.16));
    const fractions = count === 2 ? [0.28, 0.72] : [0.5];
    for (let i = 0; i < count; i++) {
      const t = fractions[i];
      const start: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (!harborRootIsDry(document, landFaceId, [start[0] - normal[0] * 1.2, start[1] - normal[1] * 1.2])) continue;
      // Stop within the receiving cell, so a pier never becomes a bridge.
      let reach = 0;
      const maxReachLimit = isExploration ? 42 : 28;
      const desired = Math.min(maxReachLimit, Math.max(isExploration ? 32 : 22, length * (isExploration ? 0.75 : 0.5)));
      for (let d = 0.5; d <= desired; d += 0.5) {
        if (
          ![-1, 0, 1].every(side =>
            pointInPolygon(
              [
                start[0] + normal[0] * d + (tangent[0] * width * side) / 2,
                start[1] + normal[1] * d + (tangent[1] * width * side) / 2
              ],
              ring
            )
          )
        )
          break;
        reach = d;
      }
      if (reach < 3) continue;
      // Same rule as the planned piers: no sea berth boxed into a cove.
      if (!river) {
        field ??= harborWaterField(document);
        if (!seaBerthIsNavigable(field, [start[0] + normal[0] * reach, start[1] + normal[1] * reach])) continue;
      }
      const deck = (along: number, side: number): Point => [
        start[0] + normal[0] * along + (tangent[0] * width * side) / 2,
        start[1] + normal[1] * along + (tangent[1] * width * side) / 2
      ];
      piers.push({
        waterFaceId: waterId,
        depthMeters: depth,
        deck: [deck(0, -1), deck(reach, -1), deck(reach, 1), deck(0, 1)]
      });
    }
  }
  return piers;
}

/** A ship moored at a harbor cell is drawn only while that cell is still harbor land. */
export function shipHasHarborLand(document: CityDocument, element: { harborFaceId?: Id | null }): boolean {
  return !element.harborFaceId || !!harborLandFace(document, element.harborFaceId);
}
