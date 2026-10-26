import type { LandmarkModel } from "../buildings/landmarks/architectureKit";
import { collectModelMetrics, type MetricsRequest, type MetricsResponse } from "./modelMetrics";

const modules = import.meta.glob<LandmarkModel>(
  [
    "../buildings/landmarks/*.ts",
    "!../buildings/landmarks/*.test.ts",
    "!../buildings/landmarks/architectureKit.ts",
    "!../buildings/landmarks/landmarkTestSupport.ts"
  ],
  { import: "model" }
);
const scope = globalThis as unknown as {
  onmessage(event: MessageEvent<MetricsRequest>): void;
  postMessage(response: MetricsResponse): void;
};
scope.onmessage = async ({ data }) => {
  try {
    const load = modules[data.modulePath];
    if (!load) throw new Error("Unknown landmark module");
    const low = await load();
    const definition = data.quality === "high" ? low.highDetail : low;
    if (!definition) throw new Error("Quality is unavailable");
    const assembly = definition.create();
    let metrics: ReturnType<typeof collectModelMetrics>;
    try {
      metrics = collectModelMetrics(assembly.group);
    } finally {
      assembly.dispose();
    }
    scope.postMessage({ metrics });
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};
