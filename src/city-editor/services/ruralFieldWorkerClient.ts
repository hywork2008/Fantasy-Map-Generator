import type { DistrictFabric } from "../generators/blockInfill.types";
import type { RuralFieldOverlay } from "../generators/ruralFieldOverlay";
import type { CityDocument } from "../types/document";

export const RURAL_FIELD_TIMEOUT_MS = 5000;

/** No synchronous fallback: optional scenery must never block the editor. */
export function startRuralFields(
  document: CityDocument,
  fabric: DistrictFabric,
  timeoutMs = RURAL_FIELD_TIMEOUT_MS,
  options?: { onProfile(report: Record<string, unknown>): void }
) {
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
      const sentAt = performance.timeOrigin + performance.now();
      const constructedAt = performance.now();
      worker = new Worker(new URL("./ruralFieldWorker.ts", import.meta.url), { type: "module" });
      const constructionMs = performance.now() - constructedAt;
      let postMessageMs = 0;
      worker.onmessage = ({
        data
      }: MessageEvent<{
        overlay?: RuralFieldOverlay;
        profile?: { receivedAt: number; completedAt: number; generationMs: number };
      }>) => {
        if (data.profile)
          options?.onProfile({
            ...data.profile,
            constructionMs,
            postMessageMs,
            roundTripMs: performance.now() - started,
            startupAndInputMs: data.profile.receivedAt - sentAt,
            returnTransferAndSchedulingMs: performance.timeOrigin + performance.now() - data.profile.completedAt
          });
        finish(performance.now() - started <= timeoutMs ? (data.overlay ?? null) : null);
      };
      worker.onerror = () => finish(null);
      worker.onmessageerror = () => finish(null);
      timer = setTimeout(() => finish(null), Math.max(0, timeoutMs - (performance.now() - started)));
      const postedAt = performance.now();
      worker.postMessage({ document, fabric, ...(options ? { profile: true } : {}) });
      postMessageMs = performance.now() - postedAt;
    } catch {
      finish(null);
    }
  });
  return { result, cancel: () => finish(null) };
}
