import type { RoadRoutingTrace } from "../../../types/contracts/generationDiagnostics";
import type { CityDocument, Id } from "../../../types/document";
import type { Cell, CityProgram } from "../../../types/geometry";
import { type GenerationObserver, generationTimer, reportGenerationFailure } from "../../generationDiagnostics";
import { clone } from "../../mesh";
import type { Plan } from "../contracts";
import { applyRoads } from "../routing/assembleRoads";
import { applyCircuits } from "./circuits";
import type { AssemblyCheckpoint } from "./contracts";
import { finalizeAssembly } from "./finalize";
import { applyFirstWall } from "./firstWall";
import { applyGates } from "./gates";
import { applyOuterWalls } from "./outerWalls";
import { applyTerrain } from "./terrain";

/** Owns one mutable attempt clone. Each stage returns its current references or an explicit checkpoint/rejection; the caller adopts only a returned document. */
export function applyPlan(
  source: CityDocument,
  cells: Cell[],
  faceIdOf: string[],
  plan: Plan,
  program: CityProgram,
  stageStep: number,
  complete = false,
  observer?: GenerationObserver,
  attempt = 1,
  onRejected?: (
    document: CityDocument,
    sample: import("../../../types/contracts/generationDiagnostics").GenerationSample
  ) => void,
  wallCheckpoint?: AssemblyCheckpoint
): CityDocument | null {
  const mark = generationTimer(observer, attempt);
  let next = clone(source);
  next.burialProfile = structuredClone(plan.burialProfile ?? source.burialProfile);
  delete next.townWallGeneration;
  const gateRouting = new Map<Id, RoadRoutingTrace[]>();
  const reject = (
    rejectedDocument: CityDocument,
    phase: string,
    reason: string,
    message: string,
    counts?: Record<string, number>,
    details?: string[],
    routing?: RoadRoutingTrace[]
  ): null => {
    const sample = reportGenerationFailure(observer, attempt, phase, reason, message, counts, details, routing);
    onRejected?.(rejectedDocument, sample);
    return null;
  };
  const terrain = applyTerrain({ plan, next, cells, faceIdOf, source, wallCheckpoint, stageStep });
  if (terrain.stopped) return terrain.document;
  let { mesh, nearest, urbanRegions } = terrain;
  ({ cells, faceIdOf } = terrain);

  mark("apply-terrain");
  const firstWall = applyFirstWall({
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
  });
  if (firstWall.stopped) return firstWall.document;
  const { innerFirst, firstWallId, castleInstalledFirst } = firstWall;
  ({ plan, mesh, next, nearest, urbanRegions } = firstWall);

  const outerWalls = applyOuterWalls({ stageStep, program, plan, mesh, next, source, wallCheckpoint });
  if (outerWalls.stopped) return outerWalls.document;

  const gates = applyGates({
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
  });
  if (gates.stopped) return gates.document;
  const { actualTownFaces, routingPlan } = gates;
  ({ next, mesh, urbanRegions } = gates);

  const circuits = applyCircuits({
    stageStep,
    plan,
    next,
    urbanRegions,
    program,
    actualTownFaces,
    faceIdOf,
    firstWallId,
    castleInstalledFirst,
    source,
    reject,
    mesh
  });
  if (circuits.stopped) return circuits.document;
  ({ next, mesh } = circuits);

  mark("wall-junctions");
  const roads = applyRoads({
    stageStep,
    next,
    plan,
    complete,
    innerFirst,
    wallCheckpoint,
    mark,
    mesh,
    source,
    routingPlan,
    faceIdOf,
    program,
    urbanRegions,
    observer,
    attempt,
    gateRouting,
    cells
  });
  if (roads.stopped) return roads.document;
  ({ next, mesh } = roads);

  mark("route-junctions");
  const finalize = finalizeAssembly({
    next,
    complete,
    stageStep,
    reject,
    mesh,
    gateRouting,
    program,
    cells,
    plan,
    faceIdOf,
    mark
  });
  return finalize.document;
}
