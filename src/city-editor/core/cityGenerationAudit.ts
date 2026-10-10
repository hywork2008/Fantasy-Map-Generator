import { parseIncomingPayload } from "../io/incomingCity";
import { featureGroupVertices } from "./features";
import {
  frameRoadApproachBend,
  frameRoadConnectedToTown,
  frameRoadJunction,
  frameRoadJunctionIssue
} from "./frameRoadConnection";
import { frameRoadTarget } from "./frameRoads";
import { defaultRoadWidthMeters, townExtentMeters } from "./gen/settlementExtent";
import type { BurgSiteDescriptor } from "./gen/site/burgSiteDescriptor";
import { importedRoadsForSite } from "./gen/site/importedRoads";
import { generateCityOnDocument } from "./generate";
import type { GenerationDebugPreview } from "./generationDebug";
import type { GenerationSample } from "./generationDiagnostics";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";
import type { CityDocument, Point } from "./types";
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
    roadReach: city ? roadReach(city, share.descriptor) : null,
    fixedApproaches: fixed,
    completeFixedApproaches: fixed.every(s => s.status === "adopted"),
    phases: samples.map(({ phase, elapsedMs, attempt, counts }) => ({
      phase,
      elapsedMs,
      attempt,
      counts
    })),
    preview
  };
}

/** Where each land road ends after generation, compared with the descriptor path. Not a reject reason. */
function roadReach(city: CityDocument, descriptor: BurgSiteDescriptor) {
  const round = (value: number) => Math.round(value * 10) / 10;
  const rows: {
    sourceIndex: number;
    routeId: number;
    descriptorEndDistance: number;
    renderedEndDistance: number | null;
    connectedToTown: boolean;
    junction: string | null;
    stubLength: number | null;
    bendDegrees: number | null;
    reachesTarget: boolean;
  }[] = [];
  descriptor.roads.forEach((road, sourceIndex) => {
    if (road.group === "searoutes") return;
    const targets = road.sharedBranches?.length
      ? road.sharedBranches.flatMap((branch, branchIndex) =>
          branch.path.length ? [{ routeId: branch.routeId, branchIndex, path: branch.path }] : []
        )
      : road.path.length
        ? [{ routeId: road.routeId, branchIndex: 0, path: road.path }]
        : [];
    for (const target of targets) {
      const targetEnd = frameRoadTarget(target.path, city.frame.extentMeters / 2);
      if (!targetEnd) continue;
      const leg = city.frameRoads?.find(
        item =>
          item.sourceIndex === sourceIndex &&
          item.routeId === target.routeId &&
          (item.branchIndex ?? 0) === target.branchIndex
      );
      const frameEnd = leg?.pieces.at(-1)?.points.at(-1);
      const meshEnd = outerMeshPoint(city, sourceIndex);
      const rendered = frameEnd ?? meshEnd;
      const gap = rendered ? Math.hypot(rendered[0] - targetEnd[0], rendered[1] - targetEnd[1]) : Infinity;
      const junction = leg ? frameRoadJunction(city, leg, descriptor) : null;
      const connectedToTown = leg ? frameRoadConnectedToTown(city, leg) : !!meshEnd;
      rows.push({
        sourceIndex,
        routeId: target.routeId,
        descriptorEndDistance: round(Math.hypot(targetEnd[0], targetEnd[1])),
        renderedEndDistance: rendered ? round(Math.hypot(rendered[0], rendered[1])) : null,
        connectedToTown,
        junction: leg ? frameRoadJunctionIssue(city, leg, descriptor) : null,
        stubLength: junction ? round(junction.stubLength) : null,
        bendDegrees: leg && junction ? round(frameRoadApproachBend(city, leg, descriptor)) : null,
        reachesTarget: connectedToTown && gap <= 25
      });
    }
  });
  return rows;
}

function outerMeshPoint(city: CityDocument, sourceIndex: number): Point | null {
  let best: Point | null = null;
  let bestD = -1;
  for (const group of city.featureGroups) {
    if (group.kind !== "road" || group.sourceRoad?.index !== sourceIndex) continue;
    for (const id of featureGroupVertices(city, group)) {
      const point = city.mesh.vertices[id]?.point;
      if (!point) continue;
      const d = point[0] * point[0] + point[1] * point[1];
      if (d > bestD) {
        bestD = d;
        best = point;
      }
    }
  }
  return best;
}
