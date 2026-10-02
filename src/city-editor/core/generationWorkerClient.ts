import type { GenerationSettings } from "./generate";
import type { GenerationDebugPreview } from "./generationDebug";
import type { GenerationSample } from "./generationDiagnostics";
import type { CityDocument } from "./types";

export interface GenerationRequest {
  document: CityDocument;
  settings: GenerationSettings;
  seed: string;
  debugFailure?: boolean;
}
export type GenerationReply =
  | { type: "progress"; sample: GenerationSample }
  | { type: "complete"; document: CityDocument | null; failurePreview?: GenerationDebugPreview }
  | { type: "error"; message: string };

/** A dedicated worker per run allows immediate cancellation even inside geometry loops. */
export function startCityGeneration(
  request: GenerationRequest,
  progress: (sample: GenerationSample) => void,
  createWorker = () => new Worker(new URL("./generationWorker.ts", import.meta.url), { type: "module" }),
  onFailurePreview?: (preview: GenerationDebugPreview) => void
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
    cancel = () => finish(null, new DOMException("Generation cancelled", "AbortError"));
    worker.onmessage = ({ data }: MessageEvent<GenerationReply>) => {
      if (settled) return;
      if (data.type === "progress") progress(data.sample);
      else if (data.type === "complete") {
        if (!data.document && request.debugFailure && data.failurePreview) onFailurePreview?.(data.failurePreview);
        finish(data.document);
      } else finish(null, new Error(data.message));
    };
    worker.onerror = event => finish(null, new Error(event.message || "Generation worker failed"));
    worker.onmessageerror = () => finish(null, new Error("Cannot read generation worker result"));
    try {
      worker.postMessage(request);
    } catch (error) {
      finish(null, error instanceof Error ? error : new Error(String(error)));
    }
  });
  return { result, cancel: () => cancel() };
}
