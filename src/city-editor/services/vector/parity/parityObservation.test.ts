import { readFileSync, writeFileSync } from "node:fs";
import { describe, it } from "vitest";
import { createGridDocument } from "../../../generators/document";
import { generateCityOnDocument } from "../../../generators/generation/generateCity";
import { defaultGenerationSettings } from "../../../generators/generation/settings";
import { defaultPopulationSettings } from "../../../generators/populationPlan";
import { vectorInputFromEditor } from "../../../generators/vector/generation/editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../../../generators/vector/generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "../../../generators/vector/generation/urban";
import type { GenerationSettings } from "../../../types/generation";
import { meshCensus, type ParityCensus, vectorCensus } from "./census";

const output = process.env.CE_MESHLESS_PARITY_OUT;
const casesPath = process.env.CE_MESHLESS_PARITY_CASES ?? "docs/plan/data/ce-meshless-parity-cases.json";

interface ParityCase {
  id: string;
  seed: string;
  population: number;
  /** False: the mesh editor runs without population settings (it requires the organic layout and mesh-first). */
  meshPopulation?: boolean;
  covers: string[];
  settings?: Partial<GenerationSettings>;
  config: Partial<GenerationSettings["config"]>;
}

const attempt = <T>(run: () => T): { value?: T; error?: string; ms: number } => {
  const started = performance.now();
  try {
    return { value: run(), ms: Math.round(performance.now() - started) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      ms: Math.round(performance.now() - started)
    };
  }
};

const STRUCTURAL = new Set<string>(["wallCircuits", "castles", "bastionedTown", "harbors", "ships", "bridges"]);
/** Kinds the mesh editor generated and meshless did not (or the other way), ignoring positions and shapes. */
function differences(mesh: ParityCensus, meshless: ParityCensus) {
  const missing: string[] = [],
    extra: string[] = [],
    fewer: string[] = [];
  for (const key of Object.keys(mesh) as (keyof ParityCensus)[]) {
    const a = mesh[key],
      b = meshless[key];
    if (typeof a !== "number" || typeof b !== "number" || key.endsWith("Population")) continue;
    if (a > 0 && b === 0) missing.push(key);
    if (a === 0 && b > 0) extra.push(key);
    // Structural elements, where one fewer means a missing ring, castle or harbour, not a different layout.
    if (a > b && b > 0 && STRUCTURAL.has(key)) fewer.push(key);
  }
  if (mesh.layout !== meshless.layout) extra.push(`layout:${mesh.layout}->${meshless.layout}`);
  return { missing, extra, fewer };
}

/** Opt-in P0 comparison: the same settings, seed and population in both editors, counted by element kind. */
describe.runIf(!!output)("meshless feature parity observation (P0)", () => {
  it("generates every fixed case in both editors and counts element kinds", () => {
    const cases = JSON.parse(readFileSync(casesPath, "utf8")).cases as ParityCase[];
    const rows = cases.map(c => {
      const settings = defaultGenerationSettings();
      Object.assign(settings, structuredClone(c.settings ?? {}));
      settings.config = { ...settings.config, ...structuredClone(c.config) };
      if (c.meshPopulation !== false) settings.population = defaultPopulationSettings(c.population);
      const grid = createGridDocument({ size: "small", grid: "voronoi" });
      const failures: string[] = [];
      let meshCity: ReturnType<typeof generateCityOnDocument> = null;
      const mesh = attempt(() => {
        meshCity = generateCityOnDocument(structuredClone(grid), structuredClone(settings), c.seed, sample => {
          if (sample.failure) failures.push(`${sample.phase}:${sample.failure.reason}: ${sample.failure.message}`);
        });
        if (!meshCity) throw new Error(`mesh-generation-null ${[...new Set(failures)].slice(0, 4).join(" ")}`);
        return meshCensus(meshCity);
      });
      // The editor opens meshless with the current mesh document's frame: the generated city's when there is one.
      const frame = (meshCity as ReturnType<typeof generateCityOnDocument>)?.frame ?? grid.frame;
      // As the meshless generation panel does: its wall choice and the editor input of the same settings.
      const meshless = attempt(() => {
        const input = vectorInputFromEditor({ seed: c.seed, settings, frame, lotOccupancy: 1 });
        input.context.targetPopulation = c.population;
        const skeleton = generateVectorSkeleton(input, {
          ...DEFAULT_VECTOR_GENERATION,
          seed: c.seed,
          wall: settings.config.features.walls ? "ellipse" : "none"
        }).document;
        return vectorCensus(
          generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: c.population, lotOccupancy: 1 })
        );
      });
      return {
        id: c.id,
        covers: c.covers,
        mesh: mesh.value ?? { error: mesh.error },
        meshMs: mesh.ms,
        meshless: meshless.value ?? { error: meshless.error },
        meshlessMs: meshless.ms,
        ...(mesh.value && meshless.value ? differences(mesh.value, meshless.value) : {})
      };
    });
    writeFileSync(
      output!,
      `${JSON.stringify(
        {
          format: "ce-meshless-parity-observation",
          version: 1,
          measuredAtUtc: new Date().toISOString(),
          cases: casesPath,
          scope:
            "Element kinds and counts only. Positions and shapes are not compared. Mesh houses are the stored housing capacity's building counts; mesh woodland is derived for display from the district fabric.",
          rows
        },
        null,
        2
      )}\n`
    );
  }, 1800000);
});
