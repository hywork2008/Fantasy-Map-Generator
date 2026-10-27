import { editorText } from "../../../../i18n/editorMessages";
import type { CityDocument, Id, Point } from "../../../types/document";
import type { CityProgram } from "../../../types/geometry";
import { finishCityGeometry } from "../../finishCityGeometry";
import { boundaryEdges, reservedCastleFaces, townGates } from "../../fortifications";
import { pointInPolygon, polygonCentroid, segmentSegmentHit } from "../../geom";
import { edgeBetween, facePoints, faceVertices, insertEdgeVertex, mergeFaces, splitFace } from "../../mesh";
import { kindEdgeIds, minGateSpacingMeters, openBarrierPassage, throughEdgesAt } from "../../passages";
import { enclosedTownFaces, repairRiverWalls } from "../../riverWallRouting";
import { defaultRoadWidthMeters, townExtentMeters } from "../../settlementExtent";
import { clipSurveyedRiverWalls } from "../../surveyedRiverWalls";
import { lineHitsDocumentWater } from "../../waterGeometry";
import { GEN_PREFIX } from "../constants";
import type { Plan } from "../contracts";
import { isInteriorRiverLanding } from "../routing/dryApproaches";
import { openWallRiverMouths } from "../routing/gateApproaches";
import type { AssemblyCheckpoint, AssemblyMark, AssemblyReject } from "./contracts";
import { faceFor, settingsLegacy } from "./documentProperties";
import { applyLandmarks } from "./landmarks";

export interface ApplyGatesInput {
  plan: Plan;
  stageStep: number;
  next: CityDocument;
  faceIdOf: string[];
  nearest: import("../planning/meshLookup").NearestVertex;
  mesh: import("../../../types/document").Mesh;
  firstWallId: string | undefined;
  urbanRegions: Point[][];
  mark: AssemblyMark;
  reject: AssemblyReject;
  wallCheckpoint: AssemblyCheckpoint | undefined;
  source: CityDocument;
  program: CityProgram;
}

/** Repairs wall/river clearance before selecting gate passages, then writes landmarks. Returns the current curtain membership for routing; rejected candidates remain on the attempt document only. */
export function applyGates(input: ApplyGatesInput) {
  let {
    plan,
    stageStep,
    next,
    faceIdOf,
    nearest,
    mesh,
    firstWallId,
    urbanRegions,
    mark,
    reject,
    wallCheckpoint,
    source,
    program
  } = input;
  let actualTownFaces: Set<Id> | null = null;
  let routingPlan = plan;
  if (stageStep >= 4) {
    // Round shared river/wall vertices before clearance repair, passage splits
    // and gate/road placement constrain them. Keep the raw curtain checkpoint
    // available for diagnostics; subsequent checkpoints use this prepared mesh.
    const precincts = [...plan.precincts, ...plan.templeHarbor];
    const reservedVertices = new Set(
      [
        ...reservedCastleFaces(next),
        ...(plan.castleSite ? [plan.castleSite.faceId] : []),
        ...precincts.flatMap(precinct => precinct.cellIds.map(id => faceIdOf[id]))
      ].flatMap(id => (next.mesh.faces[id] ? faceVertices(next.mesh, next.mesh.faces[id]) : []))
    );
    // Polygonal plazas may have no reserved faces; keep their inserted ring
    // aligned with the planned civic landmarks as the outer boundary rounds.
    for (const point of precincts.flatMap(precinct => precinct.polygon ?? [])) {
      const id = nearest(point);
      if (id && Math.hypot(mesh.vertices[id].point[0] - point[0], mesh.vertices[id].point[1] - point[1]) < 1e-6)
        reservedVertices.add(id);
    }
    const lockedBefore = new Map([...reservedVertices].map(id => [id, next.mesh.vertices[id].locked]));
    // Outer-wall smoothing and gate preparation must preserve the already
    // accepted inner curtain. Passage splits below still update its circuit.
    if (firstWallId)
      for (const ref of boundaryEdges(next.mesh, next.defenseCircuits!.find(c => c.id === firstWallId)!.areaFaceIds)) {
        const edge = next.mesh.edges[ref.edgeId];
        for (const id of [edge.a, edge.b]) {
          if (!lockedBefore.has(id)) lockedBefore.set(id, next.mesh.vertices[id].locked);
          reservedVertices.add(id);
        }
      }
    for (const id of reservedVertices) next.mesh.vertices[id].locked = true;
    next = finishCityGeometry(next, "boundaries");
    for (const [id, locked] of lockedBefore) next.mesh.vertices[id].locked = locked;
    next = clipSurveyedRiverWalls(next, plan.openWaterfront);
    mesh = next.mesh;
    urbanRegions = [...plan.urban]
      .map(id => faceFor(mesh, faceIdOf, id))
      .filter(face => !!face)
      .map(face => facePoints(mesh, face));
    mark("smooth-boundaries");
    // Cell splitting handles ordinary bank overlaps. Resolve any residual
    // coastal span before placing gates, so later junction repairs cannot
    // consume an already published gate vertex.
    next = openWallRiverMouths(next);
    const acceptedInnerGroups = new Map(
      next.featureGroups
        .filter(g => firstWallId && next.defenseCircuits!.find(c => c.id === firstWallId)!.wallGroupIds.includes(g.id))
        .map(g => [g.id, g.locked])
    );
    for (const group of next.featureGroups) if (acceptedInnerGroups.has(group.id)) group.locked = true;
    const riverRepair = repairRiverWalls(
      next,
      urbanRegions,
      new Set([...reservedCastleFaces(next), ...(plan.castleSite ? [plan.castleSite.faceId] : [])])
    );
    next = riverRepair.document;
    for (const group of next.featureGroups)
      if (acceptedInnerGroups.has(group.id)) group.locked = acceptedInnerGroups.get(group.id)!;
    if (riverRepair.issues.length)
      return {
        stopped: true as const,
        document: reject(
          next,
          "wall-river-routing",
          "wall-river-routing-failed",
          editorText("cityEditor.messages.cannotSecureWallRiverSeparationDetoursAndRiverPassages"),
          {
            issues: riverRepair.issues.length,
            preparedRiverPassages: riverRepair.preparedPassages.length,
            crossingSplitFaces: riverRepair.splitFaces
          },
          [
            ...riverRepair.adjustments,
            ...riverRepair.preparedPassages.map(id =>
              editorText("cityEditor.messages.riverPassagesPrepared", { value0: id })
            ),
            ...riverRepair.issues
          ]
        )
      };
    const firstWallGroups = new Set(
      firstWallId ? next.defenseCircuits!.find(c => c.id === firstWallId)!.wallGroupIds : []
    );
    actualTownFaces = enclosedTownFaces(
      firstWallId ? { ...next, featureGroups: next.featureGroups.filter(g => !firstWallGroups.has(g.id)) } : next
    );
    if (actualTownFaces) {
      urbanRegions = [...actualTownFaces].map(id => facePoints(next.mesh, next.mesh.faces[id]));
      routingPlan = {
        ...plan,
        urban: new Set(faceIdOf.flatMap((id, index) => (actualTownFaces!.has(id) ? [index] : [])))
      };
      for (const face of Object.values(next.mesh.faces)) {
        if (face.properties.locked || reservedCastleFaces(next).has(face.id)) continue;
        if (face.properties.water !== "land") continue;
        if (actualTownFaces.has(face.id)) {
          face.properties.settlement = "core";
        } else if (face.properties.settlement === "core") {
          face.properties.settlement = "outskirts";
        }
      }
    }
    if (stageStep === 4 && wallCheckpoint === "riverPassages") return { stopped: true as const, document: next };
    mesh = next.mesh;
    const wallVertices = new Set<Id>();
    for (const group of next.featureGroups) {
      if (group.kind !== "wall" || firstWallGroups.has(group.id)) continue;
      for (const segment of group.segments) {
        const edge = mesh.edges[segment.edgeId];
        if (edge) wallVertices.add(edge.a).add(edge.b);
      }
    }
    // Reserve gates only on banks whose exterior land reaches the frame.
    // The cell graph deliberately ignores dry-corner bottlenecks: those can
    // be repaired by splitting cells without changing the gate later.
    const coreIds = actualTownFaces ?? new Set([...plan.urban].map(id => faceIdOf[id]));
    const riverEdges = kindEdgeIds(next, "river");
    const reachable = new Set<Id>();
    const queue: Id[] = [];
    for (const edge of Object.values(mesh.edges)) {
      if (edge.leftFace && edge.rightFace) continue;
      const id = edge.leftFace ?? edge.rightFace;
      if (!id || coreIds.has(id) || mesh.faces[id].properties.water !== "land" || reachable.has(id)) continue;
      reachable.add(id);
      queue.push(id);
    }
    for (const id of queue) {
      for (const ref of mesh.faces[id].boundary) {
        if (riverEdges.has(ref.edgeId)) continue;
        const edge = mesh.edges[ref.edgeId];
        const other = edge.leftFace === id ? edge.rightFace : edge.leftFace;
        if (!other || coreIds.has(other) || mesh.faces[other].properties.water !== "land" || reachable.has(other))
          continue;
        reachable.add(other);
        queue.push(other);
      }
    }
    const exteriorRegions = [...reachable].map(id => facePoints(mesh, mesh.faces[id]));
    const wallWidth = Math.max(4, source.frame.blockSizeMeters * 0.14);
    const minGateSpacing = minGateSpacingMeters(wallWidth);
    // A cape or island keeps most of its curtain on the water. Gate count follows
    // the landward share of the built edge, so two gates are not planted on the
    // same short land neck. Inland towns (little or no sea front) are unchanged.
    let seaFront = 0;
    let landFront = 0;
    // Measure the town's own rim (core faces against the rest), not ward
    // buildability: an unbuildable cemetery or field beside the town used to
    // count as extra land front, so moving the cemetery flipped the budget
    // (Senia/Antiatuate: land front 2009 → 1474 m, gates 2 → 1).
    for (const edge of Object.values(mesh.edges)) {
      const left = edge.leftFace ? mesh.faces[edge.leftFace] : null;
      const right = edge.rightFace ? mesh.faces[edge.rightFace] : null;
      if (!left || !right) continue;
      if (coreIds.has(left.id) === coreIds.has(right.id)) continue;
      const sea = left.properties.water === "sea" || right.properties.water === "sea";
      const a = mesh.vertices[edge.a]?.point;
      const b = mesh.vertices[edge.b]?.point;
      if (!a || !b) continue;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (sea) seaFront += length;
      else landFront += length;
    }
    const frontTotal = seaFront + landFront;
    const seaShare = frontTotal > 0 ? seaFront / frontTotal : 0;
    // Only a land front too short for the planned gates is a shared neck; a
    // long one keeps every gate even when the town is ~30% sea (Antiatuate:
    // 1138 m of land rim, 30.8% sea, its second FMG road lost its gate).
    const shortLandFront = landFront < plan.gates.length * minGateSpacing * 4;
    const gateBudget =
      !(plan.riverPort && plan.importedRoads !== undefined) && seaShare >= 0.3 && shortLandFront
        ? Math.max(1, Math.min(plan.gates.length, Math.round(plan.gates.length * (1 - seaShare))))
        : plan.gates.length;
    const outerGates = () => townGates(next).filter(g => !firstWallId || g.circuitId !== firstWallId);
    const placedPoints: Point[] = outerGates().flatMap(gate => {
      const point = mesh.vertices[gate.vertexId]?.point;
      return point ? [[point[0], point[1]] as Point] : [];
    });
    const tooCloseToGate = (point: Point): boolean =>
      placedPoints.some(placed => Math.hypot(placed[0] - point[0], placed[1] - point[1]) < minGateSpacing);
    // A gate whose road ends at a fixed bridge head stands square in front of
    // the bridge. On a riverside wall the existing outward arms all touch the
    // water, so the gate used to slide along the wall (Senia/Gozelsk: 95 m)
    // and the road could not reach it along the narrow bank.
    const bridgeHeadFor = (gate: (typeof plan.gates)[number]): Point | null => {
      const end = gate.roadIndex !== undefined ? plan.importedRoads?.[gate.roadIndex]?.path.at(-1) : undefined;
      if (!end || !next.importedFixedCrossings) return null;
      for (const crossing of next.importedFixedCrossings.crossings ?? [])
        for (const head of [crossing.approachA, crossing.approachB])
          if (head && Math.hypot(head[0] - end[0], head[1] - end[1]) < 1) return [head[0], head[1]];
      return null;
    };
    const roadWidth = defaultRoadWidthMeters(townExtentMeters(next.frame));
    // Cut the exterior face from the gate vertex toward the bridge head and put
    // a vertex on the head, so the gate's outward arm runs straight to it.
    const armToBridgeHead = (document: CityDocument, vertexId: Id, head: Point): CityDocument | null => {
      const origin = document.mesh.vertices[vertexId].point;
      const dir: Point = [head[0] - origin[0], head[1] - origin[1]];
      const reach = Math.hypot(dir[0], dir[1]);
      if (reach < 1) return null;
      const far: Point = [origin[0] + dir[0] * 50, origin[1] + dir[1] * 50];
      for (const ref of Object.values(document.mesh.edges).filter(e => e.a === vertexId || e.b === vertexId)) {
        for (const faceId of [ref.leftFace, ref.rightFace]) {
          if (!faceId) continue;
          const face = document.mesh.faces[faceId];
          const center = polygonCentroid(facePoints(document.mesh, face));
          if (face.properties.water !== "land" || urbanRegions.some(region => pointInPolygon(center, region))) continue;
          let best: { edgeId: Id; t: number; dist: number } | null = null;
          for (const b of face.boundary) {
            const edge = document.mesh.edges[b.edgeId];
            if (edge.a === vertexId || edge.b === vertexId) continue;
            const pa = document.mesh.vertices[edge.a].point,
              pb = document.mesh.vertices[edge.b].point;
            const hit = segmentSegmentHit(origin, far, pa, pb);
            if (!hit) continue;
            const dist = Math.hypot(hit.point[0] - origin[0], hit.point[1] - origin[1]);
            const t = Math.hypot(hit.point[0] - pa[0], hit.point[1] - pa[1]) / Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
            if (!best || dist < best.dist) best = { edgeId: b.edgeId, t, dist };
          }
          if (!best) continue;
          const edge = document.mesh.edges[best.edgeId];
          const endVertex = best.t < 0.02 ? edge.a : best.t > 0.98 ? edge.b : null;
          const inserted = endVertex
            ? { document, vertexId: endVertex }
            : insertEdgeVertex(document, best.edgeId, best.t);
          if (!inserted) continue;
          const split = splitFace(inserted.document, faceId, vertexId, inserted.vertexId);
          if (!split) continue;
          if (best.dist <= reach + 1) return split;
          const arm = edgeBetween(split.mesh, vertexId, inserted.vertexId);
          if (!arm) return split;
          const fraction = arm.a === vertexId ? reach / best.dist : 1 - reach / best.dist;
          return insertEdgeVertex(split, arm.id, fraction)?.document ?? split;
        }
      }
      return null;
    };
    // The matching inward arm: continue the bridge-head line through the gate
    // into the town cell, so the passage is one straight line from the bridge
    // (Odeck: the shortest town-side split bent the road and drowned the gate).
    const armIntoTown = (document: CityDocument, vertexId: Id, head: Point): CityDocument | null => {
      const origin = document.mesh.vertices[vertexId].point;
      const length = Math.hypot(origin[0] - head[0], origin[1] - head[1]);
      if (length < 1) return null;
      const dir: Point = [(origin[0] - head[0]) / length, (origin[1] - head[1]) / length];
      const far: Point = [
        origin[0] + dir[0] * document.frame.extentMeters,
        origin[1] + dir[1] * document.frame.extentMeters
      ];
      const probe: Point = [origin[0] + dir[0] * 0.5, origin[1] + dir[1] * 0.5];
      for (const face of Object.values(document.mesh.faces)) {
        if (face.properties.water !== "land" || face.properties.locked) continue;
        const ids = faceVertices(document.mesh, face);
        if (!ids.includes(vertexId)) continue;
        const polygon = facePoints(document.mesh, face);
        if (!pointInPolygon(probe, polygon)) continue;
        if (!urbanRegions.some(region => pointInPolygon(polygonCentroid(polygon), region))) return null;
        let best: { edgeId: Id; t: number; dist: number } | null = null;
        for (const b of face.boundary) {
          const edge = document.mesh.edges[b.edgeId];
          if (edge.a === vertexId || edge.b === vertexId) continue;
          const pa = document.mesh.vertices[edge.a].point,
            pb = document.mesh.vertices[edge.b].point;
          const hit = segmentSegmentHit(origin, far, pa, pb);
          if (!hit) continue;
          const dist = Math.hypot(hit.point[0] - origin[0], hit.point[1] - origin[1]);
          const t = Math.hypot(hit.point[0] - pa[0], hit.point[1] - pa[1]) / Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
          if (!best || dist < best.dist) best = { edgeId: b.edgeId, t, dist };
        }
        if (!best) return null;
        const edge = document.mesh.edges[best.edgeId];
        // Snap to an existing corner within a couple of metres rather than make a sliver.
        const span = Math.hypot(
          document.mesh.vertices[edge.b].point[0] - document.mesh.vertices[edge.a].point[0],
          document.mesh.vertices[edge.b].point[1] - document.mesh.vertices[edge.a].point[1]
        );
        const endVertex = best.t * span < 2 ? edge.a : (1 - best.t) * span < 2 ? edge.b : null;
        const inserted = endVertex
          ? { document, vertexId: endVertex }
          : insertEdgeVertex(document, best.edgeId, best.t);
        if (!inserted || edgeBetween(inserted.document.mesh, vertexId, inserted.vertexId)) return null;
        return splitFace(inserted.document, face.id, vertexId, inserted.vertexId);
      }
      return null;
    };
    // The bridge-head arm adds a fifth edge at a riverside gate. An older
    // exterior arm into the river then reads as the straighter passage and
    // drowns the gate (Gothengsfeld v81). Merge the cells it separates.
    const dropWetExteriorArms = (document: CityDocument, vertexId: Id): CityDocument => {
      let result = document;
      const walls = kindEdgeIds(result, "wall");
      for (const edge of Object.values(result.mesh.edges).filter(e => e.a === vertexId || e.b === vertexId)) {
        const current = result.mesh.edges[edge.id];
        if (!current || walls.has(edge.id) || !current.leftFace || !current.rightFace) continue;
        const sides = [current.leftFace, current.rightFace].map(id => result.mesh.faces[id]);
        if (
          sides.some(
            face =>
              face.properties.water !== "land" ||
              face.properties.locked ||
              urbanRegions.some(region => pointInPolygon(polygonCentroid(facePoints(result.mesh, face)), region))
          )
        )
          continue;
        const a = result.mesh.vertices[current.a].point,
          b = result.mesh.vertices[current.b].point;
        if (!lineHitsDocumentWater(result, [a, b], roadWidth, true)) continue;
        result = mergeFaces(result, current.leftFace, current.rightFace) ?? result;
      }
      return result;
    };
    plan.gates.forEach((gate, i) => {
      if (isInteriorRiverLanding(plan, program, urbanRegions, gate.roadIndex)) return;
      const bridgeHead = bridgeHeadFor(gate);

      if (outerGates().length >= gateBudget) return;
      if (townGates(next).some(g => g.id === `${GEN_PREFIX}gate-${i}` && g.locked)) return;
      const riverVertices = new Set(
        [...kindEdgeIds(next, "river")].flatMap(id => [mesh.edges[id].a, mesh.edges[id].b])
      );
      const occupied = new Set(outerGates().map(g => g.vertexId));
      const castleFaces = new Set([...reservedCastleFaces(next), ...(plan.castleSite ? [plan.castleSite.faceId] : [])]);
      const castleVertices = new Set(
        [...castleFaces].flatMap(id => (mesh.faces[id] ? faceVertices(mesh, mesh.faces[id]) : []))
      );
      const candidates = [...wallVertices].filter(
        id => !occupied.has(id) && !riverVertices.has(id) && !castleVertices.has(id)
      );
      candidates.sort((a, b) => {
        const p = mesh.vertices[a].point,
          q = mesh.vertices[b].point;
        return (
          Math.hypot(p[0] - gate.point[0], p[1] - gate.point[1]) -
          Math.hypot(q[0] - gate.point[0], q[1] - gate.point[1])
        );
      });
      if (bridgeHead) {
        // Square in front of the bridge: nearest the head with a dry line to it.
        const dryTo = (id: Id) => !lineHitsDocumentWater(next, [mesh.vertices[id].point, bridgeHead], roadWidth, true);
        const facing = candidates.filter(dryTo).sort((a, b) => {
          const p = mesh.vertices[a].point,
            q = mesh.vertices[b].point;
          return (
            Math.hypot(p[0] - bridgeHead[0], p[1] - bridgeHead[1]) -
            Math.hypot(q[0] - bridgeHead[0], q[1] - bridgeHead[1])
          );
        });
        candidates.splice(0, candidates.length, ...facing, ...candidates.filter(id => !facing.includes(id)));
      }
      for (const vertexId of candidates) {
        const point = mesh.vertices[vertexId]?.point;
        if (!point || tooCloseToGate(point)) continue;
        // Gate preparation must not collapse a neighbouring reserved castle corner.
        const lockedBefore = new Map([...castleVertices].map(id => [id, mesh.vertices[id].locked]));
        for (const id of castleVertices) mesh.vertices[id].locked = true;
        const outward =
          bridgeHead && !lineHitsDocumentWater(next, [point, bridgeHead], roadWidth, true)
            ? armToBridgeHead(next, vertexId, bridgeHead)
            : null;
        const armed = outward && bridgeHead ? (armIntoTown(outward, vertexId, bridgeHead) ?? outward) : outward;
        const dried = armed ? dropWetExteriorArms(armed, vertexId) : armed;
        const opened = openBarrierPassage(dried ?? next, vertexId, "wall");
        for (const [id, locked] of lockedBefore) {
          if (mesh.vertices[id]) mesh.vertices[id].locked = locked;
          if (opened?.mesh.vertices[id]) opened.mesh.vertices[id].locked = locked;
        }
        if (!opened) continue;
        if (
          throughEdgesAt(opened, vertexId, "wall").some(edge =>
            [edge.leftFace, edge.rightFace].some(id => id && opened.mesh.faces[id].properties.water !== "land")
          )
        )
          continue;
        const arms = throughEdgesAt(opened, vertexId, "wall");
        // A partial land cell can hide a submerged passage arm. Both sides
        // of a gate need a dry road before committing this candidate.
        if (
          opened.importedFixedCrossings &&
          arms.some(edge =>
            lineHitsDocumentWater(
              opened,
              [opened.mesh.vertices[edge.a].point, opened.mesh.vertices[edge.b].point],
              defaultRoadWidthMeters(townExtentMeters(opened.frame)),
              true
            )
          )
        )
          continue;
        const inRegion = (edge: (typeof arms)[number], regions: Point[][]) =>
          [edge.leftFace, edge.rightFace].some(id => {
            if (!id) return false;
            const center = polygonCentroid(facePoints(opened.mesh, opened.mesh.faces[id]));
            return regions.some(region => pointInPolygon(center, region));
          });
        if (!arms.some(edge => inRegion(edge, urbanRegions)) || !arms.some(edge => inRegion(edge, exteriorRegions)))
          continue;
        next = opened;
        mesh = next.mesh;
        const placed = mesh.vertices[vertexId]?.point ?? point;
        placedPoints.push([placed[0], placed[1]]);
        next.gates.push({
          id: `${GEN_PREFIX}gate-${i}`,
          vertexId,
          ...(settingsLegacy(plan) ? {} : { role: "town" as const }),
          locked: false
        });
        break;
      }
    });
    if (stageStep === 4 && wallCheckpoint === "passages") {
      // Selection uses temporary gates to reserve spacing and stable indices.
      // Display the opened mesh before materializing those generated gates.
      next.gates = next.gates.filter(gate => gate.locked || !gate.id.startsWith(GEN_PREFIX));
      return { stopped: true as const, document: next };
    }
    // Reserved precinct landmarks as point-anchored elements.
    applyLandmarks(next, mesh, faceIdOf, plan);
  }

  return { stopped: false as const, actualTownFaces, routingPlan, next, mesh, urbanRegions };
}

export type ApplyGatesResult = ReturnType<typeof applyGates>;
