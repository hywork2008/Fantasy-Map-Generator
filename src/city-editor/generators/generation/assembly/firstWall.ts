import { editorText } from "../../../../i18n/editorMessages";
import { installCastle } from "../../../core/castles";
import { boundaryEdges, boundaryRings, refPoints, townGates } from "../../../core/fortifications";
import { addFirstTownWall, INNER_WALL_FAILURES } from "../../../core/gen/innerTownWall";
import { DEFAULT_INNER_WALLED_AREA_SHARE } from "../../../core/gen/settlementExtent";
import type { CityProgram } from "../../../core/gen/types";
import type { GenerationObserver } from "../../../core/generationDiagnostics";
import { facePoints } from "../../../core/mesh";
import { openBarrierPassage } from "../../../core/passages";
import type { CityDocument, Id, Point } from "../../../core/types";
import { GEN_PREFIX, INNER_WALL_MIN_GAP_CELLS } from "../constants";
import type { Plan } from "../contracts";
import { nearestVertexLookup } from "../planning/meshLookup";
import type { AssemblyCheckpoint, AssemblyMark, AssemblyReject } from "./contracts";
import { faceFor } from "./documentProperties";

export interface ApplyFirstWallInput {
  plan: Plan;
  stageStep: number;
  program: CityProgram;
  mesh: import("../../../core/types").Mesh;
  faceIdOf: string[];
  next: CityDocument;
  source: CityDocument;
  reject: AssemblyReject;
  mark: AssemblyMark;
  observer: GenerationObserver | undefined;
  attempt: number;
  nearest: import("../planning/meshLookup").NearestVertex;
  urbanRegions: Point[][];
  wallCheckpoint: AssemblyCheckpoint | undefined;
}

/** Builds an inner-first curtain before the outer wall. Returns remapped mesh/plan references, or the requested inner-wall checkpoint. */
export function applyFirstWall(input: ApplyFirstWallInput) {
  let {
    plan,
    stageStep,
    program,
    mesh,
    faceIdOf,
    next,
    source,
    reject,
    mark,
    observer,
    attempt,
    nearest,
    urbanRegions,
    wallCheckpoint
  } = input;
  const innerFirst = (plan.townWallBuildOrder ?? plan.innerWall?.buildOrder) === "inner-first";
  let firstWallId: Id | undefined;
  let castleInstalledFirst = false;
  if (stageStep >= 4 && innerFirst && plan.innerWall?.planned && program.walls) {
    // No outer wall/circuit exists here. Reserve the total-town footprint only
    // as an area budget; split children inherit its core tag.
    for (const id of plan.urban) {
      const face = faceFor(mesh, faceIdOf, id);
      if (face && !face.properties.locked) face.properties.settlement = "core";
    }
    if (plan.castleSite) {
      const installed = installCastle(next, plan.castleSite, plan.castleSite.faceId, source.generationSeed ?? "");
      if (!installed)
        return {
          stopped: true as const,
          document: reject(
            next,
            "castle",
            "castle-layout-too-small",
            editorText("cityEditor.messages.castleGeometryIsInvalidAfterFinishing")
          )
        };
      next = installed;
      mesh = next.mesh;
      castleInstalledFirst = true;
    }
    const center = plan.precincts.find(p => p.kind === "plaza")?.anchor ?? [0, 0];
    const first = addFirstTownWall(
      next,
      [...plan.urban].map(id => faceIdOf[id]),
      center,
      {
        share: plan.innerWall.share ?? DEFAULT_INNER_WALLED_AREA_SHARE,
        minGapCells: INNER_WALL_MIN_GAP_CELLS,
        prefix: GEN_PREFIX,
        castleInOldTown: plan.innerWall.castleRing === "inner",
        razed: plan.innerWall.razed,
        // Select the same candidate as the complete town. The raw-wall
        // checkpoint hides gates below, after their viability was checked.
        wallOnly: false,
        arteries: plan.innerArteries ?? plan.gates.map(gate => [gate.point, center]),
        wallStyle: {
          widthMeters: plan.wallMaterial === "wood" ? 2.4 : Math.max(4, source.frame.blockSizeMeters * 0.14),
          color: plan.wallMaterial === "wood" ? "#634327" : "#41382e"
        },
        wallMaterial: plan.wallMaterial ?? "stone",
        requireClosure: plan.innerWall.defensePolicy !== "legacy"
      }
    );
    mark("inner-wall", {
      innerFirst: 1,
      ok: first.report.ok ? 1 : 0,
      planned: 1,
      failureCode: first.report.failure ? INNER_WALL_FAILURES.indexOf(first.report.failure) + 1 : 0,
      faces: first.report.faces,
      gates: first.report.gates,
      areaShare: first.report.areaShare,
      gapCells: first.report.gapCells,
      riverOpenings: first.report.riverOpenings,
      cuts: first.report.cuts
    });
    if (first.report.defenseIssues?.length)
      observer?.({
        phase: "inner-wall-defense",
        elapsedMs: 0,
        attempt,
        wallDefenseIssues: first.report.defenseIssues,
        counts: { issues: first.report.defenseIssues.length }
      });
    if (first.report.ok) {
      next = first.document;
      mesh = next.mesh;
      firstWallId = "gc:defense-town-0";
      nearest = nearestVertexLookup(mesh, Math.max(1, source.frame.blockSizeMeters));
      const loops = boundaryRings(mesh, boundaryEdges(mesh, first.outerFaces));
      plan = {
        ...plan,
        borderLoops: loops.map(segments => ({ segments, points: refPoints(mesh, segments), cellIds: [] }))
      };
      urbanRegions = [...first.outerFaces].map(id => facePoints(mesh, mesh.faces[id]));
      next.townWallGeneration = { requestedOrder: "inner-first", actualOrder: "inner-first" };
      if (wallCheckpoint === "innerWall") {
        next.gates = next.gates.filter(g => g.locked || g.circuitId !== firstWallId);
        return { stopped: true as const, document: next };
      }
      if (wallCheckpoint === "firstInnerGates") {
        for (const gate of townGates(next, firstWallId)) {
          const opened = openBarrierPassage(next, gate.vertexId, "wall");
          if (opened) next = opened;
        }
        return { stopped: true as const, document: next };
      }
    }
    next.townWallGeneration = {
      requestedOrder: "inner-first",
      actualOrder: first.report.ok ? "inner-first" : "single",
      fallbackReason: first.report.failure
    };
  }
  // A rejected/unplanned inner curtain is still the end of this checkpoint.
  // Do not fall through to the single outer wall, bridge and street pipeline.
  if (innerFirst && (wallCheckpoint === "innerWall" || wallCheckpoint === "firstInnerGates")) {
    next.townWallGeneration ??= {
      requestedOrder: "inner-first",
      actualOrder: "single",
      fallbackReason: plan.innerWall?.failure ?? "unsupported-layout"
    };
    return { stopped: true as const, document: next };
  }

  return {
    stopped: false as const,
    innerFirst,
    firstWallId,
    castleInstalledFirst,
    plan,
    mesh,
    next,
    nearest,
    urbanRegions
  };
}

export type ApplyFirstWallResult = ReturnType<typeof applyFirstWall>;
