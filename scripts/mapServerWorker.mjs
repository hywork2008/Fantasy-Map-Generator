// Holds one loaded map in a private process. mapServer.mjs replaces the whole process when the file
// changes, so FMG's module-level caches (river roads, settlement sessions) can never go stale.
import { JSDOM } from "jsdom";
import { createRunnableDevEnvironment, resolveConfig } from "vite";
import { resolve } from "node:path";
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
for (const name of ["window", "document", "Node", "Element", "HTMLElement", "SVGElement", "DOMParser", "XMLSerializer", "MutationObserver", "localStorage", "navigator", "getComputedStyle"])
  Object.defineProperty(globalThis, name, { value: dom.window[name], writable: true, configurable: true });
const environment = createRunnableDevEnvironment("inline", await resolveConfig({
  root: process.cwd(), configFile: false, envDir: false, cacheDir: process.cwd(),
  environments: { inline: { consumer: "server", dev: { moduleRunnerTransform: true },
    resolve: { external: true, mainFields: [], conditions: ["node", "module-sync"] } } }
}, "serve"), { runnerOptions: { hmr: { logger: false } }, hot: false });
await environment.init();
const entry = await environment.runner.import(resolve("scripts/lib/mapServerEntry.ts"));
const [mapPath] = process.argv.slice(2);
try {
  process.send({ type: "ready", info: await entry.loadMap(mapPath) });
} catch (error) {
  process.send({ type: "fatal", error: error?.stack ?? String(error) });
  process.exit(1);
}
process.on("message", ({ id, method, args }) => {
  try {
    process.send({ id, result: entry[method](...args) ?? null });
  } catch (error) {
    process.send({ id, error: error?.message ?? String(error) });
  }
});
