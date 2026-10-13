import { splitDryWallRuns } from "../../../core/gen/plausibility";
import { defaultRoadWidthMeters, townExtentMeters } from "../../../core/gen/settlementExtent";
import type { CityProgram } from "../../../core/gen/types";
import { clipSurveyedRiverWalls } from "../../../core/surveyedRiverWalls";
import type { CityDocument, Id } from "../../../core/types";
import { lineHitsDocumentWater, lineHitsWater, waterPolygons } from "../../../core/waterGeometry";
import { GEN_PREFIX } from "../constants";
import type { Plan } from "../contracts";
import type { AssemblyCheckpoint } from "./contracts";
import { appendGeneratedGroup } from "./generatedFeatures";
import { seaOpeningEdgeIds, unbannedRuns } from "./wallGeometry";

export interface ApplyOuterWallsInput {
  stageStep: number;
  program: CityProgram;
  plan: Pick<
    Plan,
    "avoidSea" | "templeHarbor" | "precincts" | "borderLoops" | "waterPolygon" | "wallMaterial" | "legacyCastles"
  >;
  mesh: import("../../../core/types").Mesh;
  next: CityDocument;
  source: CityDocument;
  wallCheckpoint: AssemblyCheckpoint | undefined;
}

/** Writes the planned outer curtain and coastal openings. The raw-wall checkpoint stops before boundary smoothing and gate preparation. */
export function applyOuterWalls(input: ApplyOuterWallsInput) {
  const { stageStep, program, plan, mesh, next, source, wallCheckpoint } = input;
  // ④ walls + gates + plaza / citadel. When avoidSea is on, drop edges whose
  // midpoint sits in the water so the sea side is left open (§3.E.2), splitting
  // the remainder into contiguous runs (`validate` requires that).
  if (stageStep >= 4 && program.walls) {
    let wallIndex = 0;
    const openEdges = new Set<Id>();
    const coastMode = program.wallPlan?.coast ?? "open";
    // `opening` keeps the sea wall and drops a single harbour gap below.
    const keepSeaWall = coastMode === "seaWall" || coastMode === "opening";
    if (plan.avoidSea && !keepSeaWall) {
      for (const edge of Object.values(mesh.edges)) {
        if ([edge.leftFace, edge.rightFace].some(id => id && mesh.faces[id].properties.water !== "land"))
          openEdges.add(edge.id);
      }
    }
    if (coastMode === "opening") {
      const harbor =
        plan.templeHarbor.find(precinct => precinct.kind === "harbor") ??
        plan.precincts.find(precinct => precinct.kind === "harbor");
      for (const id of seaOpeningEdgeIds(mesh, plan.borderLoops, plan.waterPolygon, harbor?.anchor ?? null)) {
        openEdges.add(id);
      }
    }
    const generatedWallMaterial = plan.wallMaterial ?? "stone";
    const isGeneratedWallWood = generatedWallMaterial === "wood";
    plan.borderLoops.forEach(loop => {
      const runs =
        plan.avoidSea && plan.waterPolygon
          ? // The planning coast polygon is a wandering graph walk; cells it
            // grazed but did not classify as sea are dry town (Allagospo).
            splitDryWallRuns(loop.points, loop.segments, plan.waterPolygon, ref => {
              const edge = mesh.edges[ref.edgeId];
              return [edge.leftFace, edge.rightFace].every(id => !id || mesh.faces[id].properties.water === "land");
            })
          : [loop.segments];
      for (const ref of loop.segments) {
        const edge = mesh.edges[ref.edgeId];
        // Surveyed water cuts across coarse land cells. Retain these wall edges
        // until their dry portions can be split at the actual bank.
        if (
          next.importedFixedCrossings &&
          [edge.leftFace, edge.rightFace].every(id => !id || mesh.faces[id].properties.water === "land")
        ) {
          continue;
        }
        if (
          next.importedFixedCrossings
            ? lineHitsDocumentWater(
                next,
                [mesh.vertices[edge.a].point, mesh.vertices[edge.b].point],
                defaultRoadWidthMeters(townExtentMeters(next.frame)),
                true
              )
            : lineHitsWater([mesh.vertices[edge.a].point, mesh.vertices[edge.b].point], waterPolygons(next))
        )
          openEdges.add(edge.id);
      }
      for (const segments of runs.flatMap(run => unbannedRuns(run, openEdges))) {
        if (segments.length < 1) continue;
        appendGeneratedGroup(next, {
          id: `${GEN_PREFIX}wall-${wallIndex}`,
          kind: "wall",
          name: `Wall ${wallIndex + 1}`,
          segments,
          style: {
            widthMeters: isGeneratedWallWood ? 2.4 : Math.max(4, source.frame.blockSizeMeters * 0.14),
            color: isGeneratedWallWood ? "#634327" : "#41382e"
          },
          wallMaterial: generatedWallMaterial,
          locked: false
        });
        wallIndex++;
      }
    });
  }
  if (stageStep === 4 && wallCheckpoint === "walls")
    return { stopped: true as const, document: clipSurveyedRiverWalls(next) };

  return { stopped: false as const };
}

export type ApplyOuterWallsResult = ReturnType<typeof applyOuterWalls>;
