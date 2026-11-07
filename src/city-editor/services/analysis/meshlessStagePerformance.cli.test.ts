import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { ProcessingProfiler } from "../../../utils/processingProfiler";
import { generationStages } from "../../controllers/generationStages";
import { createGridDocument, DEFAULT_CITY_SIZE, DEFAULT_GRID_KIND } from "../../generators/document";
import { circuitRing } from "../../generators/fortifications";
import { generateCityOnDocument } from "../../generators/generation/generateCity";
import { clearGenerationPreviewCache, generateStageOnDocument } from "../../generators/generation/previews";
import { defaultGenerationSettings } from "../../generators/generation/settings";
import { polygonArea } from "../../generators/geom";
import { withoutGeneratedFacilities } from "../../generators/populationFacilities";
import { defaultPopulationSettings } from "../../generators/populationPlan";
import { generateRuralFieldStage } from "../../generators/ruralFieldStage";
import { vectorInputFromEditor } from "../../generators/vector/generation/editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../../generators/vector/generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "../../generators/vector/generation/urban";
import { regionArea } from "../../generators/vector/geometry/regions";
import { sampledClosedRing } from "../../generators/vector/geometry/routing";
import { validateVectorDocument } from "../../generators/vector/validation/document";
import { renderEditorSvg } from "../../renderers/editorSvg";
import { renderVectorDocument } from "../../renderers/vector/documentSvg";
import type { GenerationSample } from "../../types/contracts/generationDiagnostics";

const output = process.env.CE_STAGE_PERFORMANCE_OUT;
it.runIf(!!output)(
  "records fixed default mesh and meshless stage costs without exporting city geometry",
  () => {
    const seed = "b5o620";
    const settings = {
      ...defaultGenerationSettings(),
      buildingPattern: "medieval" as const,
      townWallRings: "single" as const,
      population: defaultPopulationSettings(),
      historicalPeriod: "ageOfExploration" as const
    };
    const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
    const measure = <T>(fn: () => T) => {
      const start = performance.now();
      const value = fn();
      return { value, ms: performance.now() - start };
    };
    const grid = measure(() => createGridDocument({ size: DEFAULT_CITY_SIZE, grid: DEFAULT_GRID_KIND, seed }));
    const profiler = new ProcessingProfiler(),
      samples: GenerationSample[] = [];
    const complete = measure(() =>
      profiler.measure("generation", () =>
        generateCityOnDocument(structuredClone(grid.value), settings, seed, s => samples.push(s), undefined, profiler)
      )
    );
    const meshSvg = complete.value
      ? measure(() =>
          renderEditorSvg(
            complete.value!,
            "select",
            { faceId: null, edgeId: null, vertexId: null, groupId: null },
            "-600 -600 1200 1200",
            1
          )
        )
      : null;
    const result: Record<string, unknown> = {
      measuredAt: new Date().toISOString(),
      seed,
      settings,
      input: {
        size: DEFAULT_CITY_SIZE,
        grid: DEFAULT_GRID_KIND,
        frame: grid.value.frame,
        faces: Object.keys(grid.value.mesh.faces).length,
        sha256: hash(grid.value)
      },
      environment: {
        node: process.version,
        cpu: cpus()[0].model,
        logicalCpus: cpus().length,
        os: `${platform()} ${release()}`,
        runtime: "Vitest/jsdom; one worker; sequential; no browser layout, paint or Worker transfer",
        revision: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()
      },
      mesh: {
        gridMs: grid.ms,
        generationMs: complete.ms,
        success: !!complete.value,
        svgMs: meshSvg?.ms,
        svgNodes: meshSvg?.value.querySelectorAll("*").length,
        report: complete.value?.populationReport,
        outputSha256: hash(complete.value),
        samples,
        breakdown: profiler.snapshot(),
        startOrder: profiler.startOrder()
      },
      checkpoints: []
    };
    const save = () => writeFileSync(resolve(output!), `${JSON.stringify(result, null, 2)}\n`);
    save();
    console.log(`mesh full: ${complete.ms.toFixed(1)} ms; success=${!!complete.value}`);
    expect(complete.value).not.toBeNull();
    for (const stage of generationStages(settings)) {
      clearGenerationPreviewCache();
      const phases: GenerationSample[] = [];
      const checkpoint = measure(() => {
        let doc = generateStageOnDocument(
          structuredClone(grid.value),
          settings,
          seed,
          stage.processStep,
          undefined,
          stage.wallCheckpoint,
          s => phases.push(s)
        );
        if (doc && ["geometry", "blocks"].includes(stage.id)) doc = withoutGeneratedFacilities(doc);
        if (doc && ["farmland", "conceal"].includes(stage.id)) doc = generateRuralFieldStage(doc);
        return doc;
      });
      (result.checkpoints as unknown[]).push({
        order: stage.step,
        id: stage.id,
        label: stage.label,
        processStep: stage.processStep,
        checkpoint: stage.wallCheckpoint ?? null,
        ms: checkpoint.ms,
        success: !!checkpoint.value,
        samples: phases
      });
      save();
      console.log(
        `checkpoint ${stage.step} ${stage.id}: ${checkpoint.ms.toFixed(1)} ms; success=${!!checkpoint.value}`
      );
    }
    const spans: { order: number; phase: string; ms: number }[] = [];
    const record = (prefix: string) => (phase: string, ms: number) =>
      spans.push({ order: spans.length + 1, phase: `${prefix}.${phase}`, ms });
    const input = measure(() => vectorInputFromEditor({ seed, settings, frame: grid.value.frame }));
    spans.push({ order: 1, phase: "input", ms: input.ms });
    const routingSpans: { phase: string; ms: number }[] = [];
    const skeleton = measure(() =>
      generateVectorSkeleton(
        input.value,
        { ...DEFAULT_VECTOR_GENERATION, seed, wall: settings.config.features.walls ? "ellipse" : "none" },
        record("skeleton"),
        (phase, ms) => routingSpans.push({ phase, ms })
      )
    );
    const urban = measure(() =>
      generateVectorUrban(skeleton.value.document, { ...DEFAULT_VECTOR_URBAN, population: 5000 }, undefined, {
        timings: record("urban")
      })
    );
    const validationSpans: { phase: string; ms: number }[] = [];
    const validation = measure(() =>
      validateVectorDocument(urban.value, false, (phase, ms) => validationSpans.push({ phase, ms }))
    );
    expect(validation.value).toEqual([]);
    const vectorSvg = measure(() => renderVectorDocument(urban.value));
    result.meshless = {
      routingSpans,
      validationMs: validation.ms,
      validationSpans,
      inputMs: input.ms,
      skeletonMs: skeleton.ms,
      urbanMs: urban.ms,
      generationMs: input.ms + skeleton.ms + urban.ms,
      svgMs: vectorSvg.ms,
      svgNodes: vectorSvg.value.querySelectorAll("*").length,
      report: urban.value.urban!.report,
      paths: Object.keys(urban.value.paths).length,
      placements: Object.keys(urban.value.placements).length,
      spans,
      outputSha256: hash(urban.value)
    };
    const meshWallArea = (complete.value!.defenseCircuits ?? [])
      .filter(c => c.scope === "town")
      .reduce((n, c) => n + Math.abs(polygonArea(circuitRing(complete.value!, c))), 0);
    const vectorWallArea = regionArea({ outer: sampledClosedRing(urban.value, "auto-wall"), holes: [] });
    result.conditions = {
      mesh: {
        frameExtentMeters: complete.value!.frame.extentMeters,
        wallAreaM2: meshWallArea,
        civicElements: complete
          .value!.elements.filter(e => e.kind === "plaza" || e.kind === "temple")
          .map(e => ({ kind: e.kind, point: e.point, sizeMeters: e.sizeMeters })),
        cemeteryCount: complete.value!.cemeteries?.length ?? 0
      },
      meshless: {
        frameExtentMeters: urban.value.frame.extentMeters,
        wallAreaM2: vectorWallArea,
        civicFeatures: Object.values(urban.value.environment!.features).map(f => ({
          id: f.id,
          kind: f.kind,
          areaM2: regionArea(f.boundary)
        })),
        cemeteryCount: urban.value.environment!.landscape!.cemeteries.length
      },
      wallAreaRatio: vectorWallArea / meshWallArea
    };
    result.measurementSources = [
      "src/city-editor/services/analysis/meshlessStagePerformance.cli.test.ts",
      "src/city-editor/generators/generationTiming.ts",
      "src/city-editor/generators/vector/generation/pipeline.ts",
      "src/city-editor/generators/vector/generation/urban.ts",
      "src/city-editor/generators/vector/generation/routes.ts",
      "src/city-editor/generators/vector/validation/document.ts",
      "src/city-editor/generators/vector/validation/urban.ts",
      "src/city-editor/generators/vector/geometry/surfaces.ts",
      "src/city-editor/generators/vector/generation/civic.ts",
      "src/city-editor/generators/vector/generation/editorInput.ts"
    ].map(path => ({ path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") }));
    save();
    expect(urban.value.frame.extentMeters).toBe(complete.value!.frame.extentMeters);
    expect(Math.abs(vectorWallArea / meshWallArea - 1)).toBeLessThan(0.05);
    expect(Object.keys(urban.value.environment!.features)).toEqual([
      "feature:civic-plaza",
      "feature:civic-church",
      "feature:civic-cemetery"
    ]);
    expect(urban.value.environment!.landscape!.cemeteries.length).toBe(1);
    expect(urban.value.urban!.report.unplacedPopulation).toBe(0);
    expect(urban.value.urban!.report.requiredFacilities).toBe(0);
    expect(spans.reduce((n, s) => n + s.ms, 0)).toBeLessThanOrEqual(input.ms + skeleton.ms + urban.ms);
    console.log(
      `meshless full: ${(input.ms + skeleton.ms + urban.ms).toFixed(1)} ms; svg=${vectorSvg.ms.toFixed(1)} ms`
    );
  },
  600000
);
