await import("../../src/test-setup");
const { createGridDocument } = await import("../../src/city-editor/core/document");
const { defaultGenerationSettings, generateCityOnDocument } = await import("../../src/city-editor/core/generate");
const { townCircuits, townGates, reservedCastleFaces } = await import("../../src/city-editor/core/fortifications");
const { auditTownDefenseClosure } = await import("../../src/city-editor/core/townDefenseClosure");
const { facePoints } = await import("../../src/city-editor/core/mesh");
const { polygonArea } = await import("../../src/city-editor/core/gen/geom");
const { serializeCitySvg } = await import("../../src/city-editor/render/svg");
const { DEFAULT_PATCH_PARAMS } = await import("../../src/city-editor/core/gen/patches");
import type { CreateGridOptions } from "../../src/city-editor/core/document";
import type { GenerationSettings } from "../../src/city-editor/core/generate";
import type { GenerationSample } from "../../src/city-editor/core/generationDiagnostics";

export function runTownWallOrderCase(input: CreateGridOptions, condition: "A" | "B" | "C" | "D", river: "none" | "through" | "meander", castle: "none" | "small" | "standard", draw: boolean) {
  const document = createGridDocument({ ...input, ...(input.patchParams ? { patchParams: { ...DEFAULT_PATCH_PARAMS, ...input.patchParams } } : {}) });
  const settings: GenerationSettings = {
    ...defaultGenerationSettings(), townWallRings: "double",
    townWallBuildOrder: condition === "A" || condition === "C" ? "outer-first" : "inner-first",
    townWallDefensePolicy: condition === "A" || condition === "B" ? "legacy" : "closed",
    castle: castle === "none" ? undefined : { size: castle }
  };
  settings.config.rivers = river === "none" ? [] : [river];
  settings.config.features.citadel = castle !== "none";
  const samples: GenerationSample[] = [];
  const started = performance.now();
  // Capture the first failure: paired conditions never silently use different
  // junction-retry seeds or remove unsuccessful cases from the denominator.
  const city = generateCityOnDocument(document, settings, input.seed ?? "wall-order", s => samples.push(s), () => {});
  const milliseconds = performance.now() - started;
  const circuits = city ? townCircuits(city) : [];
  const reports = city ? circuits.map(c => auditTownDefenseClosure(city, c.id, true)) : [];
  const old = circuits.length > 1 ? circuits[0] : undefined;
  const reserved = city ? reservedCastleFaces(city) : new Set();
  const area = (ids: string[]) => city ? ids.reduce((sum, id) => sum + Math.abs(polygonArea(facePoints(city.mesh, city.mesh.faces[id]))), 0) : 0;
  const svg = draw && city ? serializeCitySvg(city) : undefined;
  return {
    row: {
      condition, grid: input.grid, size: input.size, seed: input.seed, river, castle,
      generated: !!city, rings: circuits.length, double: circuits.length === 2,
      fallback: !!city && circuits.length < 2,
      fallbackReason: city?.townWallGeneration?.fallbackReason ?? (circuits.length < 2 ? samples.findLast(s => s.phase === "inner-wall")?.counts?.failureCode : undefined),
      failureReason: samples.findLast(s => s.failure)?.failure?.reason,
      closed: !!city && reports.every(r => r.ok),
      undefendedMeters: reports.reduce((n, r) => n + r.undefendedLengthMeters, 0),
      riverOpeningMeters: reports.reduce((n, r) => n + r.riverOpeningLengthMeters, 0),
      invasionPaths: reports.reduce((n, r) => n + r.invasionPaths, 0),
      waterGates: reports.reduce((n, r) => n + r.waterGates, 0),
      innerArea: area(old?.areaFaceIds ?? []), outerArea: area(circuits.at(-1)?.areaFaceIds ?? []),
      freeInnerFaces: old?.areaFaceIds.filter(id => !reserved.has(id)).length ?? 0,
      innerGates: old && city ? townGates(city, old.id).length : 0,
      outerGates: city && circuits.length ? townGates(city, circuits.at(-1)!.id).length : 0,
      milliseconds: Math.round(milliseconds), attempts: samples.at(-1)?.attempt ?? 1
    },
    input: document, settings, document: city, reports, samples, svg
  };
}
