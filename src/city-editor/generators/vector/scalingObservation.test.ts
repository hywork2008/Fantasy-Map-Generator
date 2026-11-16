import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { arch, cpus, platform } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { serializeVectorDocument } from "../../services/io/vector/documentCodec";
import type { VectorCityDocument } from "../../types/vector/document";
import { syntheticVectorInput } from "./generation/input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./generation/urban";

const output = process.env.CE_MESHLESS_SCALING_OUT;
const rawDirectory = process.env.CE_MESHLESS_SCALING_RAW;

/** Fixed wall-first synthetic inputs. Area grows with population (5,000 people at 240 m). */
const SCALING_CASES = [
  { population: 1000, radius: 150 },
  { population: 5000, radius: 240 },
  { population: 20000, radius: 480 },
  { population: 50000, radius: 760 },
  { population: 200000, radius: 1520 }
] as const;
const DEFAULT_CASES = [1000, 5000, 20000, 50000];

const selected = (process.env.CE_MESHLESS_SCALING_CASES ?? DEFAULT_CASES.join(","))
  .split(",")
  .map(Number)
  .filter(Number.isFinite);

/** Deliberately opt-in: one seed per scale, phase timings and failure points, not a benchmark. */
describe.runIf(!!output)("meshless block fabric scaling observation", () => {
  it("records phase timings, counts, document size and the first failing limit per fixed scale", () => {
    const hash = (text: string) => createHash("sha256").update(text).digest("hex");
    const round = (ms: number) => Math.round(ms * 10) / 10;
    const cases = SCALING_CASES.filter(c => selected.includes(c.population));
    expect(cases.length).toBeGreaterThan(0);
    const results = cases.map(({ population, radius }) => {
      const phases: Record<string, number> = {};
      const observe = (prefix: string) => (phase: string, ms: number) => {
        const key = `${prefix}:${phase}`;
        phases[key] = round((phases[key] ?? 0) + ms);
      };
      const started = performance.now();
      let skeletonMs = 0;
      let doc: VectorCityDocument | undefined;
      let error: string | undefined;
      try {
        const skeleton = generateVectorSkeleton(
          syntheticVectorInput("m9-fixed", radius, true),
          { ...DEFAULT_VECTOR_GENERATION, branches: 4, wall: "ellipse" },
          observe("skeleton")
        ).document;
        skeletonMs = performance.now() - started;
        doc = generateVectorUrban(
          skeleton,
          { ...DEFAULT_VECTOR_URBAN, mode: "medieval", population, maxLanes: 8 },
          undefined,
          {
            timings: observe("urban")
          }
        );
      } catch (caught) {
        error = (caught instanceof Error ? caught.message : String(caught)).slice(0, 200);
      }
      const totalMs = performance.now() - started;
      let serialized: { bytes: number; sha256: string; raw?: string } | undefined;
      if (doc) {
        const text = serializeVectorDocument(doc);
        serialized = { bytes: text.length, sha256: hash(text) };
        if (rawDirectory) {
          const path = join(rawDirectory, `scaling-${population}.json`);
          if (existsSync(path)) throw new Error(`Refusing to overwrite ${path}`);
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, text);
          serialized.raw = path;
        }
      }
      const report = doc?.urban?.report;
      return {
        population,
        radius,
        outcome: doc ? "generated" : "failed",
        error,
        skeletonMs: round(skeletonMs),
        totalMs: round(totalMs),
        phases,
        counts: doc && {
          paths: Object.keys(doc.paths).length,
          ownedPaths: doc.urban?.ownedPaths.length ?? 0,
          nodes: Object.keys(doc.connections.nodes).length,
          edges: Object.keys(doc.connections.edges).length,
          placements: Object.keys(doc.placements).length,
          blocks: doc.urban?.laneBlocks.length ?? 0
        },
        housing: report && {
          requiredDwellings: report.requiredDwellings,
          capacityDwellings: report.capacityDwellings,
          housingBuildings: report.housingBuildings,
          unplacedPopulation: report.unplacedPopulation,
          reasons: report.reasons
        },
        serialized,
        maxRssMegabytes: Math.round(process.resourceUsage().maxRSS / 1024)
      };
    });
    writeFileSync(
      output!,
      `${JSON.stringify(
        {
          format: "ce-meshless-scaling-observation",
          version: 1,
          measuredAtUtc: new Date().toISOString(),
          environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model },
          scope:
            "Wall-first synthetic input (seed m9-fixed, 4 branches, ellipse wall), mode medieval, one run per scale in one process. maxRssMegabytes is the process-wide maximum so far, not a per-case peak. Not a statistical benchmark.",
          results
        },
        null,
        2
      )}\n`
    );
  }, 3_600_000);
});
