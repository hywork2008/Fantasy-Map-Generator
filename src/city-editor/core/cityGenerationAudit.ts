import { parseIncomingPayload } from "../io/incomingCity";
import { defaultRoadWidthMeters, townExtentMeters } from "./gen/settlementExtent";
import { importedRoadsForSite } from "./gen/site/importedRoads";
import { generateCityOnDocument } from "./generate";
import type { GenerationDebugPreview } from "./generationDebug";
import type { GenerationSample } from "./generationDiagnostics";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";
import { lineHitsDocumentWater } from "./waterGeometry";

/** Same incoming payload, grid and completed generator as the CE UI. No housing
 * derivation or debug-preview early exit changes the eight normal attempts. */
export function auditCityGeneration(
  row: Record<string, string>,
  progress?: (sample: GenerationSample) => void,
  captureRejected = false
) {
  const started = performance.now();
  if (row.schema_version !== "1") throw new Error("Unsupported CSV schema_version");
  if (row.export_error) throw new Error(`Descriptor export: ${row.export_error}`);
  const share = parseIncomingPayload(row.share_json);
  if (!share?.descriptor || String(share.descriptor.burg.id) !== row.burg_id)
    throw new Error("Invalid CE share_json or mismatched burg_id");
  const samples: GenerationSample[] = [];
  const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed, sample => {
    samples.push(sample);
    progress?.(sample);
  });
  const failures = samples.filter(s => s.failure && s.failure.reason !== "all-attempts-rejected");
  const finalAttempt = Math.max(0, ...samples.map(s => s.attempt));
  const fixed = samples.filter(s => s.attempt === finalAttempt).flatMap(s => s.fixedApproaches ?? []);
  const elapsedMs = performance.now() - started;
  // Advisory source geometry, not a reason to accept/reject a city: a path
  // through water may legitimately use a registered perpendicular bridge.
  const surveyed = cityEditorDocument(share);
  surveyed.importedFixedCrossings = share.descriptor.fixedCrossings;
  const inputRoads = surveyed.importedFixedCrossings
    ? importedRoadsForSite(share.descriptor).map(road => {
        const end = road.path.at(-1)!;
        const width = defaultRoadWidthMeters(townExtentMeters(surveyed.frame));
        return {
          sourceIndex: road.sourceIndex,
          routeId: road.routeId,
          endpoint: end,
          surveyedEndpointTouchesWater: lineHitsDocumentWater(surveyed, [end, end], width, true),
          surveyedPathTouchesWater: lineHitsDocumentWater(surveyed, road.path, width, true)
        };
      })
    : null;
  let preview: GenerationDebugPreview | undefined;
  if (!city && captureRejected)
    generateCityOnDocument(
      cityEditorDocument(share),
      cityEditorSettings(share),
      share.seed,
      () => {},
      value => {
        preview = value;
      }
    );
  return {
    burgId: share.descriptor.burg.id,
    name: share.descriptor.burg.name,
    status: city ? "generated" : "rejected",
    generated: city !== null,
    generationSeed: city?.generationSeed ?? null,
    elapsedMs,
    attempts: Math.max(0, ...samples.map(s => s.attempt)),
    reasons: [...new Set(failures.map(s => s.failure!.reason))],
    failures,
    routing: samples.flatMap(s => s.routing ?? []),
    inputRoads,
    fixedApproaches: fixed,
    completeFixedApproaches: fixed.every(s => s.status === "adopted"),
    phases: samples.map(({ phase, elapsedMs, attempt, counts }) => ({ phase, elapsedMs, attempt, counts })),
    preview
  };
}
