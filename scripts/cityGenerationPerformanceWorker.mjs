import { JSDOM } from "jsdom";
import { createRunnableDevEnvironment, resolveConfig } from "vite";
import { resolve } from "node:path";
const started = performance.now();
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
for (const name of ["window", "document", "Node", "Element", "HTMLElement", "SVGElement", "DOMParser", "XMLSerializer", "MutationObserver", "localStorage", "navigator", "getComputedStyle"])
  Object.defineProperty(globalThis, name, { value: dom.window[name], writable: true, configurable: true });
// Keep the runner alive: archive hydration and optional rendering use dynamic imports.
const environment = createRunnableDevEnvironment("inline", await resolveConfig({
  root: process.cwd(), configFile: false, envDir: false, cacheDir: process.cwd(),
  environments: { inline: { consumer: "server", dev: { moduleRunnerTransform: true },
    resolve: { external: true, mainFields: [], conditions: ["node", "module-sync"] } } }
}, "serve"), { runnerOptions: { hmr: { logger: false } }, hot: false });
await environment.init();
const { prepareCityPerformanceInputs, measureCityPerformance } = await environment.runner.import(
  resolve("scripts/lib/cityGenerationPerformanceEntry.ts")
);
process.on("message", async request => {
  try {
    const result = request.mode === "prepare"
      ? await prepareCityPerformanceInputs(request.input, request.tokens, request.limit,
          burgId => process.send({ type: "export-progress", burgId }))
      : await measureCityPerformance(request.row, request.render, sample => process.send({ type: "progress",
          sample: { phase: sample.phase, elapsedMs: sample.elapsedMs, attempt: sample.attempt,
            ...(sample.failure ? { failure: { reason: sample.failure.reason, message: sample.failure.message } } : {}) } }));
    process.send({ type: "result", result });
  } catch (error) {
    process.send({ type: "fatal", error: error?.stack ?? String(error) });
  }
});
process.send({ type: "ready", bootstrapMs: performance.now() - started });
