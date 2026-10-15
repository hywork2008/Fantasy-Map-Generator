import { JSDOM } from "jsdom";
import { resolve } from "node:path";
import { createRunnableDevEnvironment, resolveConfig } from "vite";
// Shared CE modules touch browser globals at import time (as in cityGenerationPerformanceWorker.mjs).
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
for (const name of ["window", "document", "Node", "Element", "HTMLElement", "SVGElement", "DOMParser", "XMLSerializer", "MutationObserver", "localStorage", "navigator", "getComputedStyle"])
  Object.defineProperty(globalThis, name, { value: dom.window[name], writable: true, configurable: true });
const environment = createRunnableDevEnvironment("inline", await resolveConfig({
  root: process.cwd(), configFile: false, envDir: false, cacheDir: process.cwd(), mode: "production",
  environments: { inline: { consumer: "server", dev: { moduleRunnerTransform: true },
    resolve: { external: true, mainFields: [], conditions: ["node", "module-sync"] } } }
}, "serve"), { runnerOptions: { hmr: { logger: false } }, hot: false });
await environment.init();
const { runGiant } = await environment.runner.import(resolve("scripts/lib/ceGiantEntry.ts"));
process.on("message", ({ runs }) => {
  try {
    for (const run of runs) process.send({ type: "result", result: { ...runGiant(run), warmup: !!run.warmup } });
    process.send({ type: "done" });
  } catch (error) {
    process.send({ type: "fatal", error: error?.stack ?? String(error) });
  }
});
process.send({ type: "ready" });
