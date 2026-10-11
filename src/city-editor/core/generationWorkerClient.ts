import i18n, { isSupportedLanguage, type SupportedLanguage } from "../../i18n";
import { editorText } from "../../i18n/editorMessages";
import type { GenerationSettings } from "./generate";
import type { GenerationDebugPreview } from "./generationDebug";
import type { GenerationSample } from "./generationDiagnostics";
import type { CityDocument } from "./types";

export interface GenerationRequest {
  document: CityDocument;
  settings: GenerationSettings;
  seed: string;
  /** Capture the UI locale because workers do not share localStorage. */
  language?: SupportedLanguage;
  debugFailure?: boolean;
}
export interface GenerationTimings {
  structureMs: number;
  resultTransferMs: number;
}
export type GenerationReply =
  | { type: "progress"; sample: GenerationSample }
  | {
      type: "complete";
      document: CityDocument | null;
      failurePreview?: GenerationDebugPreview;
      timing?: { structureMs: number; postedAt: number };
    }
  | { type: "error"; message: string };

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
