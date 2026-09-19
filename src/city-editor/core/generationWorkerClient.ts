import type { GenerationSettings } from "./generate";
import type { GenerationSample } from "./generationDiagnostics";
import type { CityDocument } from "./types";

export interface GenerationRequest {
  document: CityDocument;
  settings: GenerationSettings;
  seed: string;
}
export type GenerationReply =
  | { type: "progress"; sample: GenerationSample }
  | { type: "complete"; document: CityDocument | null }
  | { type: "error"; message: string };

/** A dedicated worker per run allows immediate cancellation even inside geometry loops. */
export function startCityGeneration(
  request: GenerationRequest,
  progress: (sample: GenerationSample) => void,
  createWorker = () => new Worker(new URL("./generationWorker.ts", import.meta.url), { type: "module" })
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
      else if (data.type === "complete") finish(data.document);
      else finish(null, new Error(data.message));
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
