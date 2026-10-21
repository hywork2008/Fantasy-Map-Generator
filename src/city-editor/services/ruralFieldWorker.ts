import type { DistrictFabric } from "../generators/blockInfill.types";
import { applyRuralFields } from "../generators/ruralFields";
import type { CityDocument } from "../types/document";
import { RuralFieldProfiler } from "../utils/ruralFieldProfiler";

const scope = globalThis as unknown as {
  onmessage(event: MessageEvent<{ document: CityDocument; fabric: DistrictFabric; profile?: boolean }>): void;
  postMessage(value: unknown): void;
};
scope.onmessage = ({ data }) => {
  try {
    const receivedAt = performance.timeOrigin + performance.now();
    const profiler = data.profile ? new RuralFieldProfiler() : undefined;
    const started = performance.now();
    const result = applyRuralFields(data.document, data.fabric, profiler);
    const generationMs = performance.now() - started;
    scope.postMessage({
      overlay: { farms: result.farms, lanes: result.lanes, ruralFields: result.ruralFields },
      ...(profiler
        ? {
            profile: {
              generationMs,
              receivedAt,
              completedAt: performance.timeOrigin + performance.now(),
              counts: profiler.counts,
              timings: profiler.snapshot()
            }
          }
        : {})
    });
  } catch {
    scope.postMessage({ error: true });
  }
};
