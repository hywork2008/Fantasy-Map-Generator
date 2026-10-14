#!/usr/bin/env node
/**
 * Skeleton-first Phase S0: standalone (no FMG descriptor) generation baseline.
 * See docs/city-editor/plan/skeleton-first-generation.md §7 and
 * docs/city-editor/reviews/1014-skeleton-first-s0.md.
 *
 *   node --import tsx scripts/city-editor/skeleton/standaloneBaseline.ts --out temp/s0/standalone.jsonl
 *
 *   --out <file.jsonl>        required; refuses to overwrite
 *   --seeds 12                generation seeds per case (`ce-s0-20261014:<i>`)
 *   --cases a,b               subset of case names (default: all)
 *   --settings '{"k":v}'      extra GenerationSettings merged into every case
 *                             (S3 passes {"generationMethod":"skeleton-first"})
 *
 * Each case starts from the same untouched grid; one JSONL row per town, then a
 * per-case summary on stdout.
 */
import { existsSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import { createGridDocument } from "../../../src/city-editor/generators/document";
import { generateCityOnDocument } from "../../../src/city-editor/generators/generation/generateCity";
import { defaultGenerationSettings } from "../../../src/city-editor/generators/generation/settings";
import type { GenerationSettings } from "../../../src/city-editor/types/generation";
import { ProcessingProfiler } from "../../../src/utils/processingProfiler";
import { CASES, MESH_SEED, SEED_PREFIX } from "./cases";

function parseArgs(argv: string[]) {
  let out: string | undefined;
  let seeds = 12;
  let names: Set<string> | undefined;
  let extra: Partial<GenerationSettings> = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`Missing value for ${flag}`);
      return next;
    };
    if (flag === "--out") out = value();
    else if (flag === "--seeds") seeds = Number(value());
    else if (flag === "--cases") names = new Set(value().split(","));
    else if (flag === "--settings") extra = JSON.parse(value());
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!out) throw new Error("--out <file.jsonl> is required");
  if (!Number.isInteger(seeds) || seeds < 1) throw new Error("--seeds must be a positive integer");
  if (names && [...names].some(n => !CASES.some(c => c.name === n))) throw new Error("Unknown case name");
  return { out, seeds, cases: CASES.filter(c => !names || names.has(c.name)), extra };
}

const { out, seeds, cases, extra } = parseArgs(process.argv.slice(2));
if (existsSync(out)) throw new Error(`${out} exists; choose a new output name`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, "");

// Same as the 2026-10-02 audit: silence auxiliary warnings (port-less water etc.).
console.warn = () => {};

const ATTEMPT = /^attempt-(\d+)$/;

for (const testCase of cases) {
  const base = createGridDocument({ size: testCase.size, grid: testCase.grid, seed: MESH_SEED });
  const reasons: Record<string, number> = {};
  let failed = 0;
  let totalMs = 0;
  for (let i = 0; i < seeds; i++) {
    const seed = `${SEED_PREFIX}:${i}`;
    const settings = { ...defaultGenerationSettings(), ...extra } as GenerationSettings;
    testCase.apply(settings, seed);
    const profiler = new ProcessingProfiler();
    const rejections: { attempt: number; phase: string; reason: string }[] = [];
    // generationTimer marks: time since the previous mark of the same timer, summed over attempts.
    const marks: Record<string, number> = {};
    let city = null;
    let exception: string | null = null;
    const started = performance.now();
    try {
      city = generateCityOnDocument(
        base,
        settings,
        seed,
        sample => {
          if (!sample.failure) {
            marks[sample.phase] = (marks[sample.phase] ?? 0) + sample.elapsedMs;
            return;
          }
          if (sample.failure.reason === "all-attempts-rejected") return;
          rejections.push({ attempt: sample.attempt, phase: sample.phase, reason: sample.failure.reason });
          reasons[sample.failure.reason] = (reasons[sample.failure.reason] ?? 0) + 1;
        },
        undefined,
        profiler
      );
    } catch (error) {
      exception = String(error);
    }
    const elapsedMs = performance.now() - started;
    totalMs += elapsedMs;
    if (!city) failed++;
    const timings = profiler.snapshot();
    const attempts = timings.filter(t => ATTEMPT.test(t.path));
    const finalAttempt = city ? Math.max(...attempts.map(t => Number(ATTEMPT.exec(t.path)![1]))) : 0;
    const wastedMs = attempts
      .filter(t => Number(ATTEMPT.exec(t.path)![1]) !== finalAttempt)
      .reduce((sum, t) => sum + t.elapsedMs, 0);
    // Steps inside an attempt, summed over attempts ("attempt-3/plan" → "plan").
    const steps: Record<string, number> = {};
    for (const t of timings) {
      const match = /^attempt-\d+\/([^/]+)$/.exec(t.path);
      if (match) steps[match[1]] = (steps[match[1]] ?? 0) + t.elapsedMs;
    }
    appendFileSync(
      out,
      `${JSON.stringify({
        case: testCase.name,
        size: testCase.size,
        grid: testCase.grid,
        faces: Object.keys(base.mesh.faces).length,
        seed,
        success: !!city,
        selectedSeed: city?.generationSeed ?? null,
        attempts: attempts.length,
        elapsedMs,
        wastedMs,
        steps,
        marks,
        rejections,
        exception,
        config: settings.config
      })}\n`
    );
  }
  console.log(
    JSON.stringify({
      case: testCase.name,
      faces: Object.keys(base.mesh.faces).length,
      towns: seeds,
      failed,
      rejected: Object.values(reasons).reduce((a, b) => a + b, 0),
      meanMs: Math.round(totalMs / seeds),
      reasons
    })
  );
}
