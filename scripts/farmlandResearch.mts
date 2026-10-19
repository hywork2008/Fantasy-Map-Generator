#!/usr/bin/env tsx
/** Separate, repeatable consumers of sim:server observations; none advances a world. */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { evaluateFarmlandModel, fitFarmlandModel, summarizeFarmland, type FarmlandFrame, type FarmlandModel } from "../src/services/farmlandCalibration";
import type { FarmlandSnapshot } from "../src/services/farmlandObservation";

const [command, directory, ...args] = process.argv.slice(2);
const option = (name: string) => { const i = args.indexOf(`--${name}`); return i < 0 ? undefined : args[i + 1]; };
if (!directory || !["summarize", "fit", "evaluate"].includes(command)) {
  console.error("Usage: node --import tsx scripts/farmlandResearch.mts <summarize|fit|evaluate> <observe-run-dir> --out file [--period-years 5] [--train-worlds id,id] [--minimum-worlds 2] [--model model.json --test-worlds id,id]");
  process.exit(1);
}
const runDir = resolve(directory);
const frames: FarmlandFrame[] = [];
const inputs: { file: string; sha256: string }[] = [];
for (const file of readdirSync(join(runDir, "samples")).filter(f => f.endsWith(".ndjson")).sort()) {
  const bytes = readFileSync(join(runDir, "samples", file));
  inputs.push({ file, sha256: createHash("sha256").update(bytes).digest("hex") });
  for (const line of bytes.toString("utf8").split("\n").filter(Boolean)) {
    const record = JSON.parse(line) as { channel: string; date: string; farmland?: FarmlandSnapshot };
    if (record.farmland) frames.push({ worldId: record.channel, date: record.date, snapshot: record.farmland });
  }
}
if (!frames.length) throw new Error("No farmland observations; collect with sampleDetail=farmland first");
const out = option("out");
if (!out) throw new Error("--out is required");
const ids = (flag: string) => { const value = option(flag); if (!value) throw new Error(`--${flag} is required`); return value.split(","); };
const worldIds = [...new Set(frames.map(f => f.worldId))];
const validateIds = (values: string[]) => { if (values.some(id => !worldIds.includes(id))) throw new Error(`Unknown world; available: ${worldIds.join(",")}`); return values; };
let result: unknown;
if (command === "summarize") result = { worldIds, periods: summarizeFarmland(frames, Number(option("period-years") ?? 5)) };
else if (command === "fit") {
  const minimumWorlds = Number(option("minimum-worlds") ?? 2);
  if (!Number.isSafeInteger(minimumWorlds) || minimumWorlds < 1) throw new Error("--minimum-worlds must be positive");
  result = fitFarmlandModel(frames, { trainingWorldIds: validateIds(ids("train-worlds")), minimumWorlds });
} else {
  const modelPath = option("model");
  if (!modelPath) throw new Error("--model is required");
  const saved = JSON.parse(readFileSync(modelPath, "utf8")) as { result: FarmlandModel };
  if (saved.result?.version !== 1 || saved.result?.target !== "land-use-cultivation-ha") throw new Error("Unsupported model");
  result = evaluateFarmlandModel(frames, saved.result, validateIds(ids("test-worlds")));
}
writeFileSync(resolve(out), `${JSON.stringify({ schemaVersion: 1, command, runDir, inputs, result }, null, 2)}\n`, { flag: "wx" });
console.error(`[farmland] ${command}: ${frames.length} snapshots, ${worldIds.length} worlds -> ${resolve(out)}`);
