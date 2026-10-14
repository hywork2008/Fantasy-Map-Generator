// node --expose-gc scripts/city-editor/phase7/lifetime.mjs --out=artifacts/city-editor/phase7-20261014/lifetime.json
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { setImmediate as tick } from "node:timers/promises";
import { JSDOM } from "jsdom";
import { createRunnableDevEnvironment, resolveConfig } from "vite";
if (!global.gc) throw Error("Run with --expose-gc");
const out = process.argv.find(a => a.startsWith("--out="))?.slice(6) ?? "/tmp/ce-lifetime.json";
const baselineCommit = process.argv.find(arg => arg.startsWith("--baseline="))?.slice(11);
const previousOwnership = new Map();
if (baselineCommit)
  for (const file of ["src/city-editor/components/CityEditorPage.ts", "src/city-editor/generators/ferryLanding.ts"]) {
    previousOwnership.set(
      resolve(file),
      execFileSync("git", ["show", `${baselineCommit}:${file}`], { encoding: "utf8" })
    );
  }
const dom = new JSDOM("<!doctype html><body></body>", { url: "http://localhost/", pretendToBeVisual: true });
for (const key of [
  "window",
  "document",
  "Node",
  "Element",
  "HTMLElement",
  "SVGElement",
  "DOMParser",
  "XMLSerializer",
  "MutationObserver",
  "Event",
  "CustomEvent",
  "MouseEvent",
  "KeyboardEvent",
  "localStorage",
  "navigator",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame"
])
  Object.defineProperty(globalThis, key, {
    value:
      typeof dom.window[key] === "function" && key.includes("AnimationFrame")
        ? dom.window[key].bind(dom.window)
        : dom.window[key],
    configurable: true,
    writable: true
  });
Element.prototype.scrollIntoView = () => {};
const originalRandom = Math.random;
Math.random = () => Number.parseInt("phase7", 36) / 0xffffffff;
const documents = [],
  lifetimes = [],
  states = [],
  seen = new WeakSet();
globalThis.__ceAuditDocument = value => {
  if (!seen.has(value)) {
    seen.add(value);
    documents.push(new WeakRef(value));
  }
};
globalThis.__ceAuditState = value => states.push(new WeakRef(value));
globalThis.__ceAuditLifetime = value => lifetimes.push(new WeakRef(value));
// Instrument only the disposable Vite runner, never the production source or API.
const env = createRunnableDevEnvironment(
  "inline",
  await resolveConfig(
    {
      root: process.cwd(),
      configFile: false,
      envDir: false,
      plugins: [
        {
          name: "ce-lifetime-audit",
          load(id) {
            return previousOwnership.get(id) ?? null;
          },
          transform(code, id) {
            if (id.endsWith("/state/editorSession.ts"))
              return code
                .replace("onReplace(previous, next);", "onReplace(previous, next); globalThis.__ceAuditDocument(next);")
                .replace("return state;", "globalThis.__ceAuditState(state); return state;");
            if (id.endsWith("/services/editorLifetime.ts"))
              return code.replace("return lifetime;", "globalThis.__ceAuditLifetime(lifetime); return lifetime;");
          }
        }
      ],
      environments: {
        inline: {
          consumer: "server",
          dev: { moduleRunnerTransform: true },
          resolve: { external: true, mainFields: [], conditions: ["node", "module-sync"] }
        }
      }
    },
    "serve"
  ),
  { runnerOptions: { hmr: { logger: false } }, hot: false }
);
await env.init();
const collect = async () => {
  for (let i = 0; i < 8; i++) {
    await tick();
    global.gc();
    await tick();
  }
};
try {
  const { mountCityEditor } = await env.runner.import(resolve("src/city-editor/components/CityEditorPage.ts"));
  const { buildBlockFabric, clearBlockFabricCache } = await env.runner.import(
    resolve("src/city-editor/generators/blockInfill.ts")
  );
  const root = document.createElement("div");
  document.body.append(root);
  const disposers = [],
    resourceSnapshots = [];
  async function exerciseMounts() {
    for (let i = 0; i < 3; i++) {
      disposers.push(mountCityEditor(root));
      const scope = lifetimes.at(-1).deref();
      const collapse = root.querySelector(".ce-panel-collapse");
      const listenersBefore = scope.listeners.size;
      for (let j = 0; j < 20; j++) {
        collapse.click();
        collapse.click();
      }
      resourceSnapshots.push({ listenersBefore, listenersAfter: scope.listeners.size });
      // Exercise replacement while retaining only WeakRefs to outgoing documents.
      [...root.querySelectorAll("button")].find(b => b.textContent.includes("New city"))?.click();
      await tick();
    }
  }
  await exerciseMounts();
  // Preserve all disposer handles and the connected root: they must not retain
  // the disposed session's documents, even when the caller retains the handles.
  disposers.forEach(dispose => dispose());
  await collect();
  const retainedWithDisposers = documents.filter(ref => ref.deref()).length;
  const stateRetainedWithDisposers = states.filter(ref => ref.deref()).length;
  const retiredResources = lifetimes.map(ref => {
    const value = ref.deref();
    return value
      ? {
          listeners: value.listeners.size,
          timers: value.timers.size,
          frames: value.frames.size,
          cleanups: value.cleanups.size
        }
      : null;
  });
  disposers.length = 0;
  root.remove();
  await collect();
  const retainedAfterRelease = documents.filter(ref => ref.deref()).length;
  // WeakMap fabric values must not keep their document keys alive.
  let source = { format: "fmg-city-editor" }; // actual grid from the same runner
  const { createDocument } = await env.runner.import(resolve("src/city-editor/generators/document.ts"));
  source = createDocument("cache-release", 400);
  const ref = new WeakRef(source);
  buildBlockFabric(source);
  source = null;
  await collect();
  const weakFabricKeyCollected = ref.deref() === undefined;
  clearBlockFabricCache();
  // A connection can outlive a document through history or an imported snapshot.
  // A weak connection key alone therefore does not make a cached document weak.
  const { ferryPlan } = await env.runner.import(resolve("src/city-editor/generators/ferryLanding.ts"));
  const connection = {
    sourceIndex: 0,
    farRoad: [
      [0, 0],
      [5, 0]
    ],
    townRoad: [
      [-5, 0],
      [0, 0]
    ],
    banks: [
      [0, 0],
      [5, 0]
    ],
    crossing: {
      kind: "fixedBridge",
      widthMeters: 5,
      depthMeters: 1,
      navigationRequired: false,
      clearanceMeters: 4,
      openingMeters: 0,
      reason: "shallowWater"
    }
  };
  let ferryDocument = createDocument("ferry-cache-release", 400);
  ferryDocument.riverConnections = [connection];
  const ferryRef = new WeakRef(ferryDocument);
  ferryPlan(ferryDocument, connection);
  ferryDocument = null;
  await collect();
  const ferryDocumentCollectedWithLiveConnection = ferryRef.deref() === undefined;
  const liveConnectionKind = connection.crossing.kind;
  const result = {
    baselineCommit: baselineCommit ?? null,
    trackedDocuments: documents.length,
    retainedWithDisposers,
    stateRetainedWithDisposers,
    retainedAfterRelease,
    weakFabricKeyCollected,
    ferryDocumentCollectedWithLiveConnection,
    liveConnectionKind,
    resourceSnapshots,
    retiredResources,
    emptyRoot: root.childNodes.length === 0
  };
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  if (
    documents.length !== 6 ||
    states.length !== 3 ||
    lifetimes.length !== 3 ||
    stateRetainedWithDisposers ||
    !result.emptyRoot ||
    retainedWithDisposers ||
    retainedAfterRelease ||
    !weakFabricKeyCollected ||
    !ferryDocumentCollectedWithLiveConnection ||
    resourceSnapshots.some(s => s.listenersBefore !== s.listenersAfter) ||
    retiredResources.some(r => r && Object.values(r).some(Boolean))
  )
    process.exitCode = 1;
} finally {
  Math.random = originalRandom;
  await env.close();
  dom.window.close();
  delete globalThis.__ceAuditDocument;
  delete globalThis.__ceAuditState;
  delete globalThis.__ceAuditLifetime;
}
