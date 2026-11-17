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
    const assembly = await (async () => {
      if (data.modulePath === "basilica") {
        const { createBasilicaTemple } = await import("../buildings/temples/basilicaTemple");
        return createBasilicaTemple(data.quality);
      }
      if (["earthen", "polygon"].includes(data.modulePath) || data.modulePath.startsWith("regional:")) {
        const { createRegionalHouses } = await import("../buildings/houses/regionalHouses");
        const { createEarthenHouses } = await import("../buildings/houses/earthenHouses");
        const { createPolygonHouses } = await import("../buildings/houses/polygonHouses");
        if (data.modulePath === "earthen") return createEarthenHouses(data.quality);
        if (data.modulePath === "polygon") return createPolygonHouses(data.quality);
        return createRegionalHouses(
          data.modulePath.slice(9) as Parameters<typeof createRegionalHouses>[0],
          data.quality
        );
      }
      if (!load) throw new Error("Unknown model module");
      const low = await load();
      const definition = data.quality === "high" ? low.highDetail : low;
      if (!definition) throw new Error("Quality is unavailable");
      return definition.create();
    })();
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
