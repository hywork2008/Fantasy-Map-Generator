#!/usr/bin/env node
/**
 * Skeleton-first Phase S1 lab: run K1–K5 (vector skeleton, no mesh) on the S0
 * comparison set and record draws, rejection reasons and timings.
 * See docs/city-editor/plan/skeleton-first-generation.md §7.
 *
 *   node --import tsx scripts/city-editor/skeleton/skeletonLab.ts --out temp/s1/standalone.jsonl
 *   node --import tsx scripts/city-editor/skeleton/skeletonLab.ts --out temp/s1/fmg.jsonl \
 *     --csv temp/s0/triviers-inputs.csv --burg 1,2,17
 *
 *   --mesh                 also run K6 and compare face areas with evolution
 *   --out <file.jsonl>     required; refuses to overwrite. SVGs go to <out>.svg/
 *   --seeds 12             standalone seeds per case (same seeds as the S0 baseline)
 *   --cases a,b            standalone case subset
 *   --csv <inputs.csv>     FMG mode: `npm run ce:perf -- … --list` rows instead of standalone cases
 *   --burg 1,2             FMG mode: burg subset
 *   --settings '{"k":v}'   extra GenerationSettings (e.g. {"wallShape":"square"})
 *   --svg first|fail|all|none   which runs to draw (default: fail, plus the first of each case)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createGridDocument } from "../../../src/city-editor/generators/document";
import { defaultGenerationSettings } from "../../../src/city-editor/generators/generation/settings";
import { runSkeletonLab, skeletonSvg } from "../../../src/city-editor/services/analysis/skeletonLab";
import { parseIncomingPayload } from "../../../src/city-editor/services/io/incomingCity";
import { cityEditorDocument, cityEditorSettings } from "../../../src/city-editor/services/io/shareRequest";
import type { CityDocument } from "../../../src/city-editor/types/document";
import type { GenerationSettings } from "../../../src/city-editor/types/generation";
import { CASES, MESH_SEED, SEED_PREFIX } from "./cases";

interface Job {
  group: string;
  label: string;
  document: CityDocument;
  settings: GenerationSettings;
  seed: string;
  first: boolean;
}

function parseArgs(argv: string[]) {
  const options = {
    out: "",
    mesh: false,
    seeds: 12,
    cases: undefined as Set<string> | undefined,
    csv: undefined as string | undefined,
    burgs: undefined as Set<string> | undefined,
    extra: {} as Partial<GenerationSettings>,
    svg: "fail"
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`Missing value for ${flag}`);
      return next;
    };
    if (flag === "--mesh") options.mesh = true;
    else if (flag === "--out") options.out = value();
    else if (flag === "--seeds") options.seeds = Number(value());
    else if (flag === "--cases") options.cases = new Set(value().split(","));
    else if (flag === "--csv") options.csv = value();
    else if (flag === "--burg") options.burgs = new Set(value().split(","));
    else if (flag === "--settings") options.extra = JSON.parse(value());
    else if (flag === "--svg") options.svg = value();
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!options.out) throw new Error("--out <file.jsonl> is required");
  if (!["first", "fail", "all", "none"].includes(options.svg)) throw new Error("--svg first|fail|all|none");
  return options;
}

/** Minimal RFC 4180 reader (quoted fields may contain commas, quotes and newlines). */
function readCsv(path: string): Record<string, string>[] {
  const text = readFileSync(path, "utf8").replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter(r => r.length > 1);
  return body.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

function jobs(options: ReturnType<typeof parseArgs>): Job[] {
  if (options.csv) {
    const rows = readCsv(options.csv).filter(r => !options.burgs || options.burgs.has(r.burg_id));
    return rows.map(row => {
      const share = parseIncomingPayload(row.share_json);
      if (!share?.descriptor) throw new Error(`Burg ${row.burg_id}: invalid share_json`);
      return {
        group: "fmg",
        label: `${row.burg_id} ${row.name}`,
        document: cityEditorDocument(share),
        settings: { ...cityEditorSettings(share), ...options.extra } as GenerationSettings,
        seed: share.seed,
        first: false
      };
    });
  }
  return CASES.filter(c => !options.cases || options.cases.has(c.name)).flatMap(testCase => {
    const document = createGridDocument({ size: testCase.size, grid: testCase.grid, seed: MESH_SEED });
    return Array.from({ length: options.seeds }, (_, i) => {
      const seed = `${SEED_PREFIX}:${i}`;
      const settings = { ...defaultGenerationSettings(), ...options.extra } as GenerationSettings;
      testCase.apply(settings, seed);
      return { group: testCase.name, label: `${testCase.name} ${seed}`, document, settings, seed, first: i === 0 };
    });
  });
}

const options = parseArgs(process.argv.slice(2));
if (existsSync(options.out)) throw new Error(`${options.out} exists; choose a new output name`);
mkdirSync(dirname(options.out), { recursive: true });
const svgDir = `${options.out}.svg`;
if (options.svg !== "none") mkdirSync(svgDir, { recursive: true });
writeFileSync(options.out, "");
console.warn = () => {};

const summary = new Map<string, { runs: number; failed: number; draws: number; ms: number; reasons: Record<string, number> }>();
for (const job of jobs(options)) {
  const run = runSkeletonLab(job.document, job.settings, job.seed, options.mesh);
  const { skeleton, failures } = run.result;
  const row = {
    group: job.group,
    label: job.label,
    seed: job.seed,
    success: !!skeleton,
    draws: skeleton ? skeleton.attempt + 1 : failures.length,
    shape: skeleton?.wall?.shape ?? null,
    walls: run.inputs.walls,
    rivers: run.inputs.rivers.length,
    water: run.inputs.water.map(w => w.kind),
    roads: run.inputs.roads.length,
    gates: skeleton?.gates.length ?? null,
    droppedRoads: skeleton?.routes.filter(r => r.dropped).length ?? null,
    waterGates: skeleton?.wall?.waterGates.length ?? null,
    bridges: skeleton?.bridges.map(b => ({ skew: Number(b.skewDegrees.toFixed(1)), straightened: b.straightened })) ?? null,
    bridgeSkewLimit: run.inputs.bridgeSkewLimit,
    inputsMs: run.inputsMs,
    planMs: run.planMs,
    ...(options.mesh ? { meshMs: run.meshMs, meshFailure: run.meshFailure, meshDiagnostics: run.mesh?.diagnostics,
      coarseComparison: run.coarseComparison ? Object.fromEntries(Object.entries(run.coarseComparison).map(([key, areas]) => [key, { faces: areas.length, p10: areas[Math.floor(areas.length * .1)], median: areas[Math.floor(areas.length / 2)], p90: areas[Math.floor(areas.length * .9)] }])) : undefined } : {}),
    failures: failures.map(f => ({ attempt: f.attempt, reason: f.reason, shape: f.shape, details: f.details?.slice(0, 3) }))
  };
  appendFileSync(options.out, `${JSON.stringify(row)}\n`);
  const s = summary.get(job.group) ?? { runs: 0, failed: 0, draws: 0, ms: 0, reasons: {} };
  s.runs++;
  if (!skeleton) s.failed++;
  s.draws += row.draws;
  s.ms += run.planMs;
  for (const f of failures) s.reasons[f.reason] = (s.reasons[f.reason] ?? 0) + 1;
  summary.set(job.group, s);
  const draw =
    options.svg === "all" ||
    (options.svg === "fail" && (job.first || !skeleton || !!run.meshFailure)) ||
    (options.svg === "first" && job.first);
  if (draw)
    writeFileSync(join(svgDir, `${job.label.replace(/[^\w.-]+/g, "_")}.svg`), skeletonSvg(run, job.label));
}
for (const [group, s] of summary)
  console.log(
    JSON.stringify({
      group,
      runs: s.runs,
      failed: s.failed,
      meanDraws: Number((s.draws / s.runs).toFixed(2)),
      meanPlanMs: Number((s.ms / s.runs).toFixed(1)),
      reasons: s.reasons
    })
  );
