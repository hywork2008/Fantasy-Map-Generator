import { measureProcessing, type ProcessingProfiler } from "../../../../utils/processingProfiler";
import { connectAutomaticFixedApproaches } from "../../../core/automaticFixedApproaches";
import {
  straightenBridgeGateLinks,
  straightenFrameRoadJunctions,
  straightenThroughStreets
} from "../../../core/frameRoadJunction";
import type { CityGeography } from "../../../core/gen/types";
import type { GenerationObserver } from "../../../core/generationDiagnostics";
import { installRegionalRoadGates } from "../../../core/regionalRoadGates";
import type { CityDocument } from "../../../core/types";
import type { GenerationSettings } from "../../../types/generation";
import { frameRoadAttachedToTown, repairFrameRoadTownConnections } from "./frameRoadConnection";
/** Finishes town-side fixed crossing approaches and frame attachments on the candidate, emitting the existing diagnostics after geometry finishing. */
export function finishFixedConnections(
  settled: CityDocument,
  settings: GenerationSettings,
  geo: CityGeography,
  attempt: number,
  observer?: GenerationObserver,
  profiler?: ProcessingProfiler
): CityDocument {
  const fixedApproachStarted = performance.now();
  const fixedApproaches = measureProcessing(profiler, "fixed-crossing-approaches", () =>
    connectAutomaticFixedApproaches(settled)
  );
  observer?.({
    phase: "fixed-crossing-approaches",
    elapsedMs: performance.now() - fixedApproachStarted,
    attempt,
    counts: {
      adopted: fixedApproaches.diagnostics.filter(d => d.status === "adopted").length,
      unresolved: fixedApproaches.diagnostics.filter(d => d.status === "unresolved").length
    },
    fixedApproaches: fixedApproaches.diagnostics
  });
  // Streets to a fixed crossing exist only now; straighten their junctions too.
  let withApproaches = fixedApproaches.document;
  measureProcessing(profiler, "frame-road-junctions-fixed", () =>
    straightenFrameRoadJunctions(withApproaches, settings.descriptor)
  );
  measureProcessing(profiler, "through-streets", () => straightenThroughStreets(withApproaches, settings.descriptor));
  measureProcessing(profiler, "bridge-gate-links", () =>
    straightenBridgeGateLinks(withApproaches, settings.descriptor)
  );
  measureProcessing(profiler, "frame-road-repair", () => repairFrameRoadTownConnections(withApproaches));
  withApproaches = measureProcessing(profiler, "regional-road-gates", () => installRegionalRoadGates(withApproaches));
  // Count checks above only establish that every imported street exists. The
  // final dry town-side attachment must also be drawable after all finishing.
  if (geo.importedRoads !== undefined) {
    const disconnected = (withApproaches.frameRoads ?? []).filter(leg => {
      const source = withApproaches.featureGroups.find(
        group => group.kind === "road" && group.sourceRoad?.index === leg.sourceIndex
      );
      return (
        source?.kind === "road" &&
        source.sourceRoad?.terminal !== "riverLanding" &&
        !frameRoadAttachedToTown(withApproaches, leg)
      );
    });
    observer?.({
      phase: "road-connection-validation",
      elapsedMs: 0,
      attempt,
      counts: { checked: geo.importedRoads.length, disconnected: disconnected.length },
      roadConnectionIssues: disconnected.map(leg => ({
        sourceIndex: leg.sourceIndex,
        routeId: leg.routeId,
        branchIndex: leg.branchIndex ?? 0
      }))
    });
  }

  return withApproaches;
}
