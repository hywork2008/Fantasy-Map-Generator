import { createHash } from "node:crypto";
import { worldContext } from "../../../context/worldContext";
import { getBurgSiteDescriptor } from "../../../services/burgSiteDescriptor";
import { ProcessingProfiler } from "../../../utils/processingProfiler";
import { buildBlockFabric, setFabricBuildRecorder } from "../../generators/blockInfill";
import { documentBridgeSkewLimit, overSkewedBridgeDecks } from "../../generators/bridgeDeck";
import { citySpatialMetrics } from "../../generators/citySpatialMetrics";
import { generateCityOnDocument } from "../../generators/generation/generateCity";
import { nearestOnPolyline, polygonArea } from "../../generators/geom";
import { explainGeneratedCrossingFailures } from "../../generators/passages";
import { measureHousingCapacity } from "../../generators/residentialCapacity";
import type { HousingFitStats } from "../../types/contracts/fitImportedHousing";
import type { GenerationSample } from "../../types/contracts/generationDiagnostics";
import type { CityDocument } from "../../types/document";
import type { GenerationSettings } from "../../types/generation";
import { parseIncomingPayload } from "../io/incomingCity";
import { burgIdsForTokens, cityEditorDocument, cityEditorSettings, loadArchiveWorld } from "./housingReport";

/** Export a reproducible input list and time the FMG side independently of CE. */
export async function prepareCityPerformanceInputs(
  archive: string,
  tokens: string[] = [],
  limit?: number,
  progress?: (burgId: number) => void
) {
  const started = performance.now();
  await loadArchiveWorld(archive);
  const archiveReadMs = performance.now() - started;
  const available = (worldContext.pack.burgs ?? []).flatMap((burg, index) =>
    burg && !burg.removed && (burg.i ?? index) > 0 ? [burg.i ?? index] : []
  );
  const selected = tokens.length ? burgIdsForTokens(tokens).map(item => item.burgId) : available;
  if (selected.some(id => id === null || !available.includes(id))) throw new Error("Unknown or removed burg selection");
  const ids = [...new Set(selected as number[])].slice(0, limit);
  const rows = ids.map(burgId => {
    progress?.(burgId);
    const timings: Record<string, number> = {};
    const profiler = new ProcessingProfiler();
    const measure = <T>(phase: string, action: () => T): T => {
      const start = performance.now();
      try {
        return action();
      } finally {
        timings[phase] = performance.now() - start;
      }
    };
    const base = {
      schema_version: "1",
      archive,
      burg_id: String(burgId),
      name: worldContext.pack.burgs[burgId]?.name ?? ""
    };
    try {
      const descriptor = measure("fmg_descriptor_ms", () =>
        profiler.measure("descriptor", () => getBurgSiteDescriptor(burgId, undefined, profiler))
      );
      if (!descriptor) throw new Error("No site descriptor");
      const json = measure("fmg_serialize_ms", () => JSON.stringify(descriptor));
      const share = measure("export_share_parse_ms", () => parseIncomingPayload(json));
      if (!share) throw new Error("Invalid FMG descriptor");
      const shareJson = measure("export_share_serialize_ms", () => JSON.stringify(share));
      return {
        ...base,
        source_extent_meters: String(descriptor.frame.extentMeters),
        seed: share.seed,
        population: String(descriptor.burg.population),
        dwellings: String(descriptor.burg.dwellings),
        grid: share.grid,
        size: share.size,
        payload_characters: String(json.length),
        share_json: shareJson,
        fmg_breakdown_json: JSON.stringify(profiler.snapshot()),
        ...timings
      };
    } catch (error) {
      return {
        ...base,
        share_json: "",
        export_error: error instanceof Error ? error.message : String(error),
        fmg_breakdown_json: JSON.stringify(profiler.snapshot()),
        ...timings
      };
    }
  });
  return { rows, archiveReadMs };
}

/** Runs the same incoming-share grid/settings and full retry policy as the CE UI. */
export async function measureCityPerformance(
  row: Record<string, string>,
  render = false,
  progress?: (sample: GenerationSample) => void,
  overrides: Partial<GenerationSettings> = {},
  svgSink?: (svg: string) => void
) {
  const started = performance.now();
  const timings: Record<string, number> = {};
  const profiler = new ProcessingProfiler();
  const phases: Array<{
    phase: string;
    elapsedMs: number;
    attempt: number;
    counts?: Record<string, number>;
    failure?: { reason: string; message: string; details?: string[] };
  }> = [];
  const measure = <T>(phase: string, action: () => T): T => {
    const start = performance.now();
    try {
      return action();
    } finally {
      timings[phase] = performance.now() - start;
    }
  };
  const base = { burgId: Number(row.burg_id), name: row.name };
  let generated = false;
  let spatialMetrics: ReturnType<typeof citySpatialMetrics> | null = null;
  let housingFit: HousingFitStats | null = null;
  // `buildBlockFabric` calls during generation, by the profiler path that made them.
  const fabricBuilds: Record<string, { built: number; cached: number }> = {};
  setFabricBuildRecorder(cached => {
    const path = (profiler.currentPath() ?? "(outside)").replace(/attempt-\d+/g, "attempt-*");
    fabricBuilds[path] ??= { built: 0, cached: 0 };
    const entry = fabricBuilds[path];
    entry[cached ? "cached" : "built"]++;
  });
  try {
    if (row.schema_version !== "1") throw new Error("Unsupported CSV schema_version");
    if (row.export_error) throw new Error(`Descriptor export: ${row.export_error}`);
    const share = measure("incomingParseMs", () => parseIncomingPayload(row.share_json));
    if (!share?.descriptor || String(share.descriptor.burg.id) !== row.burg_id)
      throw new Error("Invalid CE share_json or mismatched burg_id");
    const document = measure("gridMs", () => cityEditorDocument(share));
    const settings = measure("settingsMs", () => ({ ...cityEditorSettings(share), ...overrides }));
    const city = measure("generationMs", () =>
      profiler.measure("generation", () =>
        generateCityOnDocument(
          document,
          settings,
          share.seed,
          sample => {
            const { phase, elapsedMs, attempt, counts } = sample;
            if (sample.housingFit) housingFit = sample.housingFit;
            phases.push({
              phase,
              elapsedMs,
              attempt,
              counts,
              ...(sample.failure
                ? {
                    failure: {
                      reason: sample.failure.reason,
                      message: sample.failure.message,
                      details: sample.failure.details
                    }
                  }
                : {})
            });
            progress?.(sample);
          },
          undefined,
          profiler
        )
      )
    );
    setFabricBuildRecorder(null);
    generated = city !== null;
    if (city) spatialMetrics = measure("spatialMetricsMs", () => citySpatialMetrics(city));
    const quality = city ? measure("qualityMs", () => cityQualityMetrics(city)) : null;
    let svgNodes: number | null = null;
    if (city && render) {
      // Load the renderer outside the SVG construction timer; module startup is reported separately.
      const importStart = performance.now();
      const { renderEditorSvg } = await import("../../renderers/editorSvg");
      timings.rendererImportMs = performance.now() - importStart;
      const extent = city.frame.extentMeters;
      const svg = measure("svgBuildMs", () =>
        renderEditorSvg(
          city,
          "select",
          { faceId: null, edgeId: null, vertexId: null, groupId: null },
          `${-extent / 2} ${-extent / 2} ${extent} ${extent}`,
          1,
          false,
          null,
          null,
          null,
          null,
          false,
          false,
          sample => {
            phases.push({
              phase: `render.${sample.phase}`,
              elapsedMs: sample.elapsedMs,
              attempt: sample.attempt,
              counts: sample.counts
            });
          },
          false,
          false,
          "detailed"
        )
      );
      svgNodes = svg.querySelectorAll("*").length;
      svgSink?.(svg.outerHTML);
    }
    return {
      ...base,
      status: city ? "generated" : "rejected",
      generated: city !== null,
      seed: share.seed,
      generationSeed: city?.generationSeed ?? null,
      grid: share.grid,
      size: share.size,
      population: share.descriptor.burg.population,
      dwellings: share.descriptor.burg.dwellings,
      faces: Object.keys(document.mesh.faces).length,
      generatedFaces: city ? Object.keys(city.mesh.faces).length : null,
      spatialMetrics,
      housingFit,
      quality,
      fabricBuilds,
      fingerprint: city ? cityFingerprint(city) : null,
      attempts: Math.max(0, ...phases.filter(s => !s.phase.startsWith("render.")).map(s => s.attempt)),
      timings,
      totalMs: performance.now() - started,
      svgNodes,
      generationBreakdown: profiler.snapshot(),
      phases
    };
  } catch (error) {
    return {
      ...base,
      status: generated ? "render-error" : "error",
      generated,
      spatialMetrics,
      housingFit,
      fabricBuilds,
      timings,
      totalMs: performance.now() - started,
      error: error instanceof Error ? error.message : String(error),
      generationBreakdown: profiler.snapshot(),
      phases
    };
  } finally {
    setFabricBuildRecorder(null);
  }
}

/** Generated ships and how far each lies from the nearest pier the editor draws (berthed ships sit beside one). */
function shipMetrics(city: CityDocument, fabric: ReturnType<typeof buildBlockFabric>) {
  const ships = city.elements.filter(e => e.kind === "ship" && e.point);
  if (!ships.length) return {};
  const piers = fabric.harbor?.piers ?? [];
  const gaps = ships.map(ship =>
    piers.length
      ? Math.min(...piers.map(pier => nearestOnPolyline(ship.point!, [...pier.polygon, pier.polygon[0]]).dist))
      : Infinity
  );
  return { ships: ships.length, shipsNearPier: gaps.filter(gap => gap <= 15).length };
}

/**
 * Output measures for changes that may alter the city (ce-generation-max-speed-plan.md §3.2):
 * the fabric the editor would draw, and the crossing/bridge rules re-checked on the finished town.
 */
export function cityQualityMetrics(city: CityDocument) {
  const fabric = buildBlockFabric(city);
  const footprint = fabric.buildings.reduce((sum, b) => sum + Math.abs(polygonArea(b.polygon)), 0);
  return {
    buildings: fabric.buildings.length,
    buildingFootprintMeters2: footprint,
    lanes: fabric.lanes.length,
    // Houses the editor draws, counted like the housing fit counts them (dwelling capacity).
    ...(city.housingCapacity
      ? (() => {
          const drawn = measureHousingCapacity(city, fabric.buildings, city.housingCapacity.requiredDwellings);
          return {
            drawnHousing: drawn.capacityInside + drawn.capacityOutside,
            targetDwellings: drawn.requiredDwellings
          };
        })()
      : {}),
    crossingIssues: explainGeneratedCrossingFailures(city).length,
    overSkewedBridges: overSkewedBridgeDecks(city, documentBridgeSkewLimit(city)).length,
    ...shipMetrics(city, fabric),
    roadGroups: city.featureGroups.filter(g => g.kind === "road").length,
    gates: city.gates?.length ?? 0
  };
}

/** SHA-256 of the generated city, whole and by part, so a speed-only change can prove identical output. */
export function cityFingerprint(city: CityDocument) {
  const hash = (value: unknown) =>
    createHash("sha256")
      .update(JSON.stringify(value) ?? "")
      .digest("hex")
      .slice(0, 16);
  return {
    document: hash(city),
    mesh: hash(city.mesh),
    features: hash(city.featureGroups),
    defenses: hash([city.defenseCircuits, city.gates, city.castles]),
    fabric: hash(city.fabric)
  };
}
