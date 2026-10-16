#!/usr/bin/env tsx
/**
 * Leaf-level diff of two .fmg archives for simulation golden mismatches
 * (docs/plan/simulation-core-separation.md §8). Compares only the hashed sections
 * (world, simulation, opaqueExtensionChunks) and prints the first differing paths.
 *
 * Usage: npx tsx scripts/simGoldenDiff.mts <a.fmg> <b.fmg> [--limit 40] [--prefix simulation.burgs]
 */
import { readFileSync } from "node:fs";
import { decodeAndValidateWorldArchive } from "../src/runtime/worldArchive";

const [aPath, bPath, ...rest] = process.argv.slice(2);
if (!aPath || !bPath) throw new Error("Usage: simGoldenDiff.mts <a.fmg> <b.fmg> [--limit N] [--prefix path]");
const flag = (name: string) => {
  const index = rest.indexOf(name);
  return index >= 0 ? rest[index + 1] : undefined;
};
const limit = Number(flag("--limit") ?? 40);
const prefix = flag("--prefix");

async function load(path: string) {
  const bytes = readFileSync(path);
  const validated = await decodeAndValidateWorldArchive({
    blob: new Blob([bytes]),
    header: new Uint8Array(bytes.buffer, bytes.byteOffset, Math.min(4, bytes.byteLength))
  });
  const document = validated.document as unknown as Record<string, unknown>;
  return { world: document.world, simulation: document.simulation, opaqueExtensionChunks: document.opaqueExtensionChunks };
}

const diffs: string[] = [];
let total = 0;
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !ArrayBuffer.isView(value);

function walk(a: unknown, b: unknown, path: string): void {
  if (prefix && !(path.startsWith(prefix) || prefix.startsWith(path))) return;
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    const left = a as unknown as ArrayLike<number>;
    const right = b as unknown as ArrayLike<number>;
    const length = Math.max(left.length, right.length);
    for (let i = 0; i < length; i++) if (!Object.is(left[i], right[i])) record(`${path}[${i}]`, left[i], right[i]);
    return;
  }
  if (isObject(a) && isObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) walk(a[key], b[key], Array.isArray(a) ? `${path}[${key}]` : `${path}.${key}`);
    return;
  }
  if (!Object.is(a, b)) record(path, a, b);
}

function record(path: string, a: unknown, b: unknown): void {
  total++;
  if (diffs.length < limit) {
    const show = (value: unknown) => {
      const text = JSON.stringify(value);
      return text && text.length > 120 ? `${text.slice(0, 117)}...` : text;
    };
    diffs.push(`${path}: ${show(a)} -> ${show(b)}`);
  }
}

walk(await load(aPath), await load(bPath), "");
console.log(diffs.join("\n"));
console.log(`${total} differing leaf value(s)`);
