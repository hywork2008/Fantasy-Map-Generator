#!/usr/bin/env node
import { createReadStream, existsSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { writeCsv } from "../src/city-editor/services/analysis/batchCsv.ts";

const usage = "Usage: npm run ce:perf:csv -- <report.jsonl> <report.csv>";
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(usage);
  process.exit(0);
}
if (args.length !== 2) throw new Error(usage);

const input = resolve(args[0]);
const output = resolve(args[1]);
if (input === output) throw new Error("Output must differ from input");
if (existsSync(output)) throw new Error(`Output exists: ${output}; choose a new output path`);

function flatten(value, prefix = "", row = {}) {
  for (const [key, item] of Object.entries(value)) {
    const column = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(item)) row[column] = JSON.stringify(item);
    else if (item && typeof item === "object") flatten(item, column, row);
    else row[column] = item;
  }
  return row;
}

const rows = [];
let lineNumber = 0;
for await (const line of createInterface({ input: createReadStream(input), crlfDelay: Infinity })) {
  lineNumber++;
  if (!line.trim()) continue;
  let record;
  try {
    record = JSON.parse(line);
  } catch (error) {
    throw new Error(`${input}:${lineNumber}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!record || typeof record !== "object" || Array.isArray(record))
    throw new Error(`${input}:${lineNumber}: each JSONL record must be an object`);
  rows.push(flatten(record));
}
if (!rows.length) throw new Error(`No JSONL records found in ${input}`);

writeFileSync(output, writeCsv(rows), { flag: "wx" });
console.error(`[ce:perf:csv] ${rows.length} rows -> ${output}`);
