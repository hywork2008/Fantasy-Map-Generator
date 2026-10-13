import type { RoadRoutingTrace } from "../../../types/contracts/generationDiagnostics";
import type { CityDocument } from "../../../types/document";

/** A requested assembly stopping point, before downstream routing/finishing. */
export type AssemblyCheckpoint = "walls" | "riverPassages" | "passages" | "innerWall" | "firstInnerGates";
/** Diagnostics always receive the current attempt document, never a stale capture. */
export type AssemblyReject = (
  document: CityDocument,
  phase: string,
  reason: string,
  message: string,
  counts?: Record<string, number>,
  details?: string[],
  routing?: RoadRoutingTrace[]
) => null;
export type AssemblyMark = (phase: string, counts?: Record<string, number>) => void;
