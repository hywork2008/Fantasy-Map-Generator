import { editorText } from "../../i18n/editorMessages";
export interface RoadRoutingTrace {
  routeId?: string;
  outside: boolean;
  plannedPoints: number[][];
  waypoints: string[];
  status: "connected" | "failed";
  reason?: string;
  path: string[];
  edges?: string[];
  searches: Array<{
    start: string;
    end: string;
    classification: "planned" | "current-curtain";
    reachedCount: number;
    partialPath: string[];
    partialEdges: string[];
    blocked: Array<{ edge: string; from: string; to: string; reason: string }>;
  }>;
}

/** Transient diagnostics; never stored in a city document or undo history. */
export interface GenerationFailure {
  /** Machine-readable cause, e.g. `urban-area-too-small`. */
  reason: string;
  /** One-line description of what went wrong. */
  message: string;
  /** Extra "how" lines: ids, thresholds, validate() messages. */
  details?: string[];
  routing?: RoadRoutingTrace[];
}

export interface GenerationSample {
  /** FMG frame roads that remain unattached after safe repair. */
  roadConnectionIssues?: { sourceIndex: number; routeId: number; branchIndex: number }[];
  routing?: RoadRoutingTrace[];
  fixedApproaches?: import("./automaticFixedApproaches").AutomaticFixedApproachResult["diagnostics"];
  housingFit?: import("./gen/fitImportedHousing").HousingFitStats;
  phase: string;
  elapsedMs: number;
  attempt: number;
  counts?: Record<string, number>;
  failure?: GenerationFailure;
}
export type GenerationObserver = (sample: GenerationSample) => void;

export function generationTimer(observer?: GenerationObserver, attempt = 1) {
  let started = performance.now();
  return (phase: string, counts?: Record<string, number>) => {
    const now = performance.now();
    observer?.({ phase, elapsedMs: now - started, attempt, counts });
    started = performance.now();
  };
}

/** Japanese stage label for progress text and console reports. */
export function generationPhaseLabel(phase: string): string {
  if (phase === "prepare") return editorText("cityEditor.messages.preparation");
  if (phase === "complete") return editorText("cityEditor.messages.overall");
  if (phase === "apply-validation") return editorText("cityEditor.messages.meshValidation");
  if (phase.includes("wall")) return editorText("cityEditor.messages.wallsAndGates");
  if (phase.includes("coast") || phase.includes("river") || phase.includes("terrain"))
    return editorText("cityEditor.messages.terrain");
  if (phase === "urban") return editorText("cityEditor.messages.urbanArea");
  if (phase.includes("street") || phase.includes("route") || phase.includes("road"))
    return editorText("cityEditor.messages.roadsAndBridges");
  if (phase.includes("rectify") || phase.includes("geometry"))
    return editorText("cityEditor.messages.geometryFinishing");
  if (phase.includes("crossing")) return editorText("cityEditor.messages.intersectionValidation");
  if (phase.includes("validation")) return editorText("cityEditor.messages.connectionValidation");
  return editorText("cityEditor.messages.cityComposition");
}

export function reportGenerationFailure(
  observer: GenerationObserver | undefined,
  attempt: number,
  phase: string,
  reason: string,
  message: string,
  counts?: Record<string, number>,
  details?: string[],
  routing?: RoadRoutingTrace[]
): GenerationSample {
  const sample: GenerationSample = {
    phase,
    elapsedMs: 0,
    attempt,
    counts,
    failure: { reason, message, details, routing }
  };
  observer?.(sample);
  if (!observer) logGenerationFailures([sample]);
  return sample;
}

export function generationFailuresOf(samples: readonly GenerationSample[]): GenerationSample[] {
  return samples.filter(sample => sample.failure);
}

export function formatGenerationFailureLog(
  samples: readonly GenerationSample[],
  context?: Record<string, string | number>
): string {
  const failures = generationFailuresOf(samples).filter(sample => sample.failure?.reason !== "all-attempts-rejected");
  const lines = [editorText("cityEditor.messages.cityEditorCityGenerationFailed")];
  if (context) {
    const parts = Object.entries(context).map(([key, value]) => `${key}=${value}`);
    if (parts.length) lines.push(editorText("cityEditor.messages.settings", { value0: parts.join(" · ") }));
  }
  if (!failures.length) {
    lines.push(editorText("cityEditor.messages.noRejectionReasonRecorded"));
    return lines.join("\n");
  }
  lines.push(editorText("cityEditor.messages.candidatesRejected", { value0: failures.length }));
  for (const sample of failures) {
    const failure = sample.failure!;
    lines.push(
      editorText("cityEditor.messages.candidateGenerationDiagnostics", {
        value0: sample.attempt,
        value1: generationPhaseLabel(sample.phase),
        value2: sample.phase,
        value3: failure.reason,
        value4: failure.message
      })
    );
    if (sample.counts) {
      const counts = Object.entries(sample.counts)
        .map(([key, value]) => `${key}=${value}`)
        .join(", ");
      if (counts) lines.push(editorText("cityEditor.messages.metrics", { value0: counts }));
    }
    for (const detail of failure.details ?? []) lines.push(`    ${detail}`);
    for (const route of failure.routing ?? []) {
      lines.push(
        editorText("cityEditor.messages.roadWaypointsPath", {
          value0: route.routeId ?? "?",
          value1: route.outside
            ? editorText("cityEditor.messages.outsideGate")
            : editorText("cityEditor.messages.gateInside"),
          value2: route.status,
          value3: route.waypoints.join(" → "),
          value4: route.path.join(" → ") || editorText("cityEditor.messages.noneGenerate")
        })
      );
      lines.push(
        editorText("cityEditor.messages.acceptedRouteEdges", {
          value0: route.edges?.join(", ") || editorText("cityEditor.messages.noneGenerate")
        })
      );
      if (route.reason) lines.push(editorText("cityEditor.messages.reason", { value0: route.reason }));
      lines.push(editorText("cityEditor.messages.plannedCoordinates", { value0: JSON.stringify(route.plannedPoints) }));
      route.searches.forEach((search, index) => {
        lines.push(
          editorText("cityEditor.messages.searchStartEndReachedVertices", {
            value0: index + 1,
            value1: search.classification,
            value2: search.start,
            value3: search.end,
            value4: search.reachedCount
          })
        );
        lines.push(
          editorText("cityEditor.messages.closestPathToTheDestinationEdges", {
            value0: search.partialPath.join(" → "),
            value1: search.partialEdges.join(", ") || editorText("cityEditor.messages.noneGenerate")
          })
        );
        for (const block of search.blocked)
          lines.push(
            editorText("cityEditor.messages.excluded", {
              value0: block.from,
              value1: block.to,
              value2: block.edge,
              value3: block.reason
            })
          );
      });
    }
  }
  return lines.join("\n");
}

/** Console report: which stage, why, and how each attempt was rejected. */
export function logGenerationFailures(
  samples: readonly GenerationSample[],
  context?: Record<string, string | number>
): void {
  const failures = generationFailuresOf(samples);
  if (!failures.length) return;
  const attempts = failures.filter(sample => sample.failure?.reason !== "all-attempts-rejected");
  console.group(
    editorText("cityEditor.messages.cityEditorCityGenerationFailedCandidatesRejected", {
      value0: attempts.length || failures.length
    })
  );
  if (context) console.error(editorText("cityEditor.messages.settingsGenerationDiagnostics"), context);
  console.error(formatGenerationFailureLog(samples, context));
  for (const sample of attempts) {
    const failure = sample.failure!;
    console.error(
      editorText("cityEditor.messages.candidateFailureSummary", {
        value0: sample.attempt,
        value1: generationPhaseLabel(sample.phase),
        value2: sample.phase,
        value3: failure.reason,
        value4: failure.message
      }),
      {
        attempt: sample.attempt,
        stage: generationPhaseLabel(sample.phase),
        phase: sample.phase,
        reason: failure.reason,
        how: failure.message,
        counts: sample.counts,
        details: failure.details,
        routing: failure.routing
      }
    );
  }
  console.groupEnd();
}
