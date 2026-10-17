#!/usr/bin/env node
// One-shot City Editor probe of a world snapshot (docs/plan/approach-traffic-observatory.md §7.2):
//   node --import tsx scripts/observeCeProbe.mjs <snapshot.fmg> <burgIds,...> <out.json>
// Runs in its own process on a copy of the world, so a running channel is never touched.
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { createRunnableDevEnvironment, resolveConfig } from "vite";

const [archive, ids, out] = process.argv.slice(2);
if (!archive || !ids || !out) throw new Error("Usage: observeCeProbe.mjs <snapshot.fmg> <burgIds> <out.json>");
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
for (const name of ["window", "document", "Node", "Element", "HTMLElement", "SVGElement", "DOMParser", "XMLSerializer", "MutationObserver", "localStorage", "navigator", "getComputedStyle"])
  Object.defineProperty(globalThis, name, { value: dom.window[name], writable: true, configurable: true });
const environment = createRunnableDevEnvironment("inline", await resolveConfig({
  root: process.cwd(), configFile: false, envDir: false, cacheDir: process.cwd(),
  environments: { inline: { consumer: "server", dev: { moduleRunnerTransform: true },
    resolve: { external: true, mainFields: [], conditions: ["node", "module-sync"] } } }
}, "serve"), { runnerOptions: { hmr: { logger: false } }, hot: false });
await environment.init();
const { probeArchive } = await environment.runner.import(resolve("scripts/lib/observeCeProbeEntry.ts"));
const burgs = await probeArchive(resolve(archive), ids.split(",").map(Number));
writeFileSync(out, JSON.stringify({ v: 1, archive, burgs }, null, 2));
await environment.close();
process.exit(0);
