import { editorText } from "../../../../i18n/editorMessages";
import type { RoadRoutingTrace } from "../../../types/contracts/generationDiagnostics";
import type { CityDocument, Id } from "../../../types/document";
import type { Cell, CityProgram } from "../../../types/geometry";
import { finalizeCastles } from "../../castles";
import { syncDocumentCemeteries } from "../../cemeteryLayout";
import { reservedCastleFaces, townCircuits, townGates } from "../../fortifications";
import { polygonArea } from "../../geom";
import { facePoints, validate } from "../../mesh";
import { kindEdgeIds, throughEdgesAt, vertexHasCrossing, vertexHasKindPassage } from "../../passages";
import { installRegionalRoadGates } from "../../regionalRoadGates";
import { GEN_PREFIX } from "../constants";
import type { Plan } from "../contracts";
import type { AssemblyMark, AssemblyReject } from "./contracts";
import { faceFor } from "./documentProperties";
import { settleTempleOnDocument } from "./temple";

export interface FinalizeAssemblyInput {
  next: CityDocument;
  complete: boolean;
  stageStep: number;
  reject: AssemblyReject;
  mesh: import("../../../types/document").Mesh;
  gateRouting: Map<string, RoadRoutingTrace[]>;
  program: CityProgram;
  cells: Cell[];
  plan: Pick<Plan, "urban" | "wardsOnly">;
  faceIdOf: string[];
  mark: AssemblyMark;
}

/** Checks accepted gate connectivity, trims unsafe endpoints, preserves connected outskirts and validates the attempt document before adoption. */
export function finalizeAssembly(input: FinalizeAssemblyInput) {
  let { next, complete, stageStep, reject, mesh, gateRouting, program, cells, plan, faceIdOf, mark } = input;
  // An old-town gate that no routed street passes through is not a gate (two
  // gate-to-centre roads can share one). The others are an invariant below.
  const oldTownWall = townCircuits(next).length > 1 ? townCircuits(next)[0] : null;
  if (oldTownWall)
    next.gates = next.gates.filter(
      gate => gate.circuitId !== oldTownWall.id || gate.locked || vertexHasCrossing(next, gate.vertexId, "wall", "road")
    );
  // Accepted gates are an invariant. Never make an incomplete route look
  // successful by deleting its gate (and then deleting its paired roads).
  const disconnected = townGates(next).filter(
    gate =>
      !gate.locked &&
      gate.id.startsWith(GEN_PREFIX) &&
      (!vertexHasKindPassage(next, gate.vertexId, "wall") ||
        ((complete || stageStep >= 6) && !plan.wardsOnly && !vertexHasCrossing(next, gate.vertexId, "wall", "road")))
  );
  if (disconnected.length) {
    return {
      stopped: true as const,
      document: reject(
        next,
        "gate-routing",
        "unconnected-gates",
        editorText("cityEditor.messages.cannotSecureRoadConnectionsForGates", { value0: disconnected.length }),
        { gates: townGates(next).length, disconnected: disconnected.length, ...gateSiteCounts(next, disconnected) },
        disconnected.flatMap(gate => [
          `${gate.id}: ${gate.vertexId}`,
          editorText("cityEditor.messages.gateWallPassageWallRoadCrossing", {
            value0: gate.vertexId,
            value1: vertexHasKindPassage(next, gate.vertexId, "wall"),
            value2: vertexHasCrossing(next, gate.vertexId, "wall", "road")
          }),
          editorText("cityEditor.messages.roadEdgesAtGate", {
            value0: gate.vertexId,
            value1:
              next.featureGroups
                .flatMap(group =>
                  group.kind === "road"
                    ? group.segments
                        .filter(ref => {
                          const edge = mesh.edges[ref.edgeId];
                          return edge.a === gate.vertexId || edge.b === gate.vertexId;
                        })
                        .map(ref => ref.edgeId)
                    : []
                )
                .join(", ") || editorText("cityEditor.messages.noneGenerate")
          }),
          editorText("cityEditor.messages.allEdgesAtGate", {
            value0: gate.vertexId,
            value1: Object.values(mesh.edges)
              .filter(e => e.a === gate.vertexId || e.b === gate.vertexId)
              .map(e => `${e.id}(to ${e.a === gate.vertexId ? e.b : e.a}, L:${e.leftFace}, R:${e.rightFace})`)
              .join(", ")
          }),
          editorText("cityEditor.messages.passableEdgesAtGate", {
            value0: gate.vertexId,
            value1: throughEdgesAt(next, gate.vertexId, "wall")
              .map(e => e.id)
              .join(", ")
          })
        ]),
        disconnected.flatMap(gate => gateRouting.get(gate.id) ?? [])
      )
    };
  }

  // Trim or remove any road endpoints that terminate on curtain wall vertices without a gate.
  if (complete && program.walls) {
    const wallEdges = kindEdgeIds(next, "wall");
    const wallVertices = new Set([...wallEdges].flatMap(id => [next.mesh.edges[id].a, next.mesh.edges[id].b]));
    const gateVertices = new Set(townGates(next).map(g => g.vertexId));

    next.featureGroups = next.featureGroups.flatMap(group => {
      // A bridge is a fixed road–river–road triple, not a gate road; an
      // old-town curtain may pass its bank vertex (double walls).
      if (
        group.locked ||
        group.kind !== "road" ||
        !group.id.startsWith(GEN_PREFIX) ||
        group.id.startsWith(`${GEN_PREFIX}bridge-`)
      )
        return [group];
      const segments = [...group.segments];
      const segStart = (seg: (typeof segments)[0]) => {
        const e = next.mesh.edges[seg.edgeId];
        return seg.forward ? e.a : e.b;
      };
      const segEnd = (seg: (typeof segments)[0]) => {
        const e = next.mesh.edges[seg.edgeId];
        return seg.forward ? e.b : e.a;
      };
      while (segments.length > 0) {
        const startV = segStart(segments[0]);
        if (wallVertices.has(startV) && !gateVertices.has(startV)) {
          segments.shift();
        } else {
          break;
        }
      }
      while (segments.length > 0) {
        const endV = segEnd(segments[segments.length - 1]);
        if (wallVertices.has(endV) && !gateVertices.has(endV)) {
          segments.pop();
        } else {
          break;
        }
      }
      return segments.length > 0 ? [{ ...group, segments }] : [];
    });
  }

  // Keep connected suburban districts, including those reached through local
  // lanes. Requiring every face to touch a major road would erase the outer
  // residential belt before buildLocalFabric can create its access network.
  if (complete && program.walls && next.featureGroups.some(g => g.kind === "wall")) {
    const activeGateVertices = new Set(townGates(next).map(gate => gate.vertexId));
    const roadEdges = new Set(
      next.featureGroups.flatMap(g => (g.kind === "road" ? g.segments.map(s => s.edgeId) : []))
    );
    const reachable = new Set<Id>();
    if (next.gridKind === "evolution") {
      const barriers = new Set([...kindEdgeIds(next, "wall"), ...kindEdgeIds(next, "river")]);
      const land = new Set(
        Object.values(mesh.faces)
          .filter(f => f.properties.water === "land" && f.properties.buildable && f.properties.ward !== "farm")
          .map(f => f.id)
      );
      const queue = [...land].filter(id =>
        mesh.faces[id].boundary.some(ref => roadEdges.has(ref.edgeId) && !barriers.has(ref.edgeId))
      );
      for (const id of queue) reachable.add(id);
      for (let i = 0; i < queue.length; i++) {
        const face = mesh.faces[queue[i]];
        for (const ref of face.boundary) {
          const edge = mesh.edges[ref.edgeId];
          const other = edge.leftFace === face.id ? edge.rightFace : edge.leftFace;
          if (
            !other ||
            !land.has(other) ||
            reachable.has(other) ||
            barriers.has(edge.id) ||
            edge.locked ||
            face.properties.locked ||
            mesh.faces[other].properties.locked
          )
            continue;
          reachable.add(other);
          queue.push(other);
        }
      }
    }
    for (let cellId = 0; cellId < cells.length; cellId++) {
      if (plan.urban.has(cellId)) continue;
      const face = faceFor(mesh, faceIdOf, cellId);
      if (!face || face.properties.locked || face.properties.water !== "land" || reservedCastleFaces(next).has(face.id))
        continue;
      if (
        !face.properties.ward ||
        face.properties.ward === "empty" ||
        face.properties.ward === "park" ||
        face.properties.ward === "farm" ||
        face.properties.ward === "harbor" ||
        face.properties.ward === "cemetery"
      )
        continue;

      const hasRoad = face.boundary.some(b => roadEdges.has(b.edgeId));
      const hasGate = face.boundary.some(b => {
        const edge = next.mesh.edges[b.edgeId];
        return edge && (activeGateVertices.has(edge.a) || activeGateVertices.has(edge.b));
      });
      if (!hasRoad && !hasGate && !reachable.has(face.id)) {
        face.properties.ward = "empty";
        face.properties.buildable = false;
      }
    }
  }

  if (stageStep >= 6) settleTempleOnDocument(next);
  if (stageStep >= 5 && next.castles?.length && !finalizeCastles(next, true)) {
    return {
      stopped: true as const,
      document: reject(
        next,
        "castle",
        "castle-no-access",
        editorText("cityEditor.messages.cannotSecureABranchRoadFromTheCastleGateTo")
      )
    };
  }

  if (!complete && stageStep >= 5) next = installRegionalRoadGates(next);
  const errors = validate(next);
  mark("apply-validation", { errors: errors.length });
  if (errors.length) {
    return {
      stopped: true as const,
      document: reject(
        next,
        "apply-validation",
        "invalid-mesh",
        editorText("cityEditor.messages.meshValidationFailedWithErrors", { value0: errors.length }),
        { errors: errors.length },
        errors.slice(0, 20)
      )
    };
  }
  if (stageStep >= 6) {
    syncDocumentCemeteries(next);
  }
  return { stopped: true as const, document: next };
}

export type FinalizeAssemblyResult = ReturnType<typeof finalizeAssembly>;

/**
 * ce:perf measurement of where unconnected gates stand (no effect on generation):
 * `gateFrameRatio` = nearest gate's distance to the display frame / half extent (0 = on the frame),
 * `gateFaceAreaRatio` = largest face touching a gate / median land-face area,
 * `gateRoadEdges` = fewest road edges meeting a gate.
 */
function gateSiteCounts(document: CityDocument, gates: { vertexId: Id }[]): Record<string, number> {
  const mesh = document.mesh;
  const half = document.frame.extentMeters / 2;
  const area = (id: Id) => Math.abs(polygonArea(facePoints(mesh, mesh.faces[id])));
  const land = Object.values(mesh.faces)
    .filter(f => f.properties.water === "land")
    .map(f => area(f.id))
    .sort((a, b) => a - b);
  const median = land[land.length >> 1] || 1;
  const roadEdges = new Set(
    document.featureGroups.flatMap(g => (g.kind === "road" ? g.segments.map(r => r.edgeId) : []))
  );
  let frame = Infinity,
    faceRatio = 0,
    roads = Infinity;
  for (const gate of gates) {
    const p = mesh.vertices[gate.vertexId]?.point;
    if (!p) continue;
    frame = Math.min(frame, (half - Math.max(Math.abs(p[0]), Math.abs(p[1]))) / half);
    const edges = Object.values(mesh.edges).filter(e => e.a === gate.vertexId || e.b === gate.vertexId);
    for (const e of edges)
      for (const f of [e.leftFace, e.rightFace])
        if (f && mesh.faces[f]) faceRatio = Math.max(faceRatio, area(f) / median);
    roads = Math.min(roads, edges.filter(e => roadEdges.has(e.id)).length);
  }
  return Number.isFinite(frame) ? { gateFrameRatio: frame, gateFaceAreaRatio: faceRatio, gateRoadEdges: roads } : {};
}
