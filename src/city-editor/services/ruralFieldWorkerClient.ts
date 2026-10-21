import type { DistrictFabric } from "../generators/blockInfill.types";
import type { RuralFieldOverlay } from "../generators/ruralFieldOverlay";
import type { CityDocument } from "../types/document";

/** No synchronous fallback: optional scenery must never block the editor. */
export function startRuralFields(document: CityDocument, fabric: DistrictFabric, timeoutMs = 2000) {
  const started = performance.now();
  let finish: (value: RuralFieldOverlay | null) => void = () => {};
  let worker: Worker | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const result = new Promise<RuralFieldOverlay | null>(resolve => {
    let done = false;
    finish = value => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      worker?.terminate();
      resolve(value);
    };
    try {
      worker = new Worker(new URL("./ruralFieldWorker.ts", import.meta.url), { type: "module" });
      worker.onmessage = ({ data }: MessageEvent<{ overlay?: RuralFieldOverlay }>) =>
        finish(performance.now() - started <= timeoutMs ? (data.overlay ?? null) : null);
      worker.onerror = () => finish(null);
      worker.onmessageerror = () => finish(null);
      timer = setTimeout(() => finish(null), Math.max(0, timeoutMs - (performance.now() - started)));
      worker.postMessage({ document, fabric });
    } catch {
      finish(null);
    }
  });
  return { result, cancel: () => finish(null) };
}
