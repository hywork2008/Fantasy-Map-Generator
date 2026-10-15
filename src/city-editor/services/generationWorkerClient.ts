import { editorText } from "../../i18n/editorMessages";
import i18n, { isSupportedLanguage } from "../../i18n/index";
import type { GenerationDebugPreview } from "../types/contracts/generationDebug";
import type { GenerationSample } from "../types/contracts/generationDiagnostics";
import type { CityDocument } from "../types/document";
import type { GenerationReply, GenerationRequest, GenerationTimings } from "../types/worker";

/** A dedicated worker per run allows immediate cancellation even inside geometry loops. */
export function startCityGeneration(
  request: GenerationRequest,
  progress: (sample: GenerationSample) => void,
  createWorker = () => new Worker(new URL("./generationWorker.ts", import.meta.url), { type: "module" }),
  onFailurePreview?: (preview: GenerationDebugPreview) => void,
  onTimings?: (timings: GenerationTimings) => void
): { result: Promise<CityDocument | null>; cancel: () => void } {
  const worker = createWorker();
  let cancel = () => {};
  const result = new Promise<CityDocument | null>((resolve, reject) => {
    let settled = false;
    const finish = (document: CityDocument | null, error?: Error) => {
      if (settled) return;
      settled = true;
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      if (error) reject(error);
      else resolve(document);
    };
    cancel = () => finish(null, new DOMException(editorText("cityEditor.messages.generationCancelled"), "AbortError"));
    worker.onmessage = ({ data }: MessageEvent<GenerationReply>) => {
      if (settled) return;
      if (data.type === "progress") progress(data.sample);
      else if (data.type === "complete") {
        if (data.timing)
          onTimings?.({
            structureMs: data.timing.structureMs,
            ...(data.timing.breakdown ? { breakdown: data.timing.breakdown } : {}),
            resultTransferMs: Math.max(0, performance.timeOrigin + performance.now() - data.timing.postedAt)
          });
        if (!data.document && request.debugFailure && data.failurePreview) onFailurePreview?.(data.failurePreview);
        finish(data.document);
      } else finish(null, new Error(data.message));
    };
    worker.onerror = event =>
      finish(null, new Error(event.message || editorText("cityEditor.messages.generationWorkerFailed")));
    worker.onmessageerror = () =>
      finish(null, new Error(editorText("cityEditor.messages.cannotReadGenerationWorkerResult")));
    try {
      worker.postMessage({
        ...request,
        language: request.language ?? (isSupportedLanguage(i18n.language) ? i18n.language : "en")
      });
    } catch (error) {
      finish(null, error instanceof Error ? error : new Error(String(error)));
    }
  });
  return { result, cancel: () => cancel() };
}
