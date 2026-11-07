import type { VectorGenerationResult } from "../generators/vector/generation/pipeline";
import type { VectorCityDocument } from "../types/vector/document";
import type { VectorGenerationSettings } from "../types/vector/generation";
import type { VectorUrbanSettings } from "../types/vector/urban";
export type VectorGenerationTask =
  | { kind: "skeleton"; settings: VectorGenerationSettings }
  | { kind: "urban"; settings: VectorUrbanSettings }
  | { kind: "city"; settings: VectorGenerationSettings; urban: VectorUrbanSettings };
export interface VectorGenerationRequest {
  id: number;
  inputRevision: number;
  source: VectorCityDocument;
  task: VectorGenerationTask;
}
export interface VectorGenerationProgress {
  phase: "skeleton" | "lanes" | "facilities" | "housing" | "validation";
  completed?: number;
  total?: number;
}
export type VectorGenerationReply = { id: number; inputRevision: number } & (
  | { result: VectorGenerationResult; error?: never }
  | { error: string; result?: never; progress?: never }
  | { progress: VectorGenerationProgress; error?: never; result?: never }
);
let nextId = 0;
/** One worker per generation; termination cancels the geometry computation itself. */
export function startVectorGeneration(
  source: VectorCityDocument,
  task: VectorGenerationTask,
  createWorker = () => new Worker(new URL("./vectorGenerationWorker.ts", import.meta.url), { type: "module" }),
  onProgress?: (progress: VectorGenerationProgress) => void
) {
  const worker = createWorker(),
    id = ++nextId,
    inputRevision = source.revision;
  let cancel = () => {};
  const result = new Promise<VectorGenerationResult | null>((resolve, reject) => {
    let settled = false;
    let timer = setTimeout(() => finish(null, new Error("generation-timeout")), 60000);
    const finish = (value: VectorGenerationResult | null, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate();
      if (error) reject(error);
      else resolve(value);
    };
    cancel = () => finish(null);
    worker.onmessage = ({ data }: MessageEvent<VectorGenerationReply>) => {
      if (data.id !== id || data.inputRevision !== inputRevision) return;
      if ("progress" in data && data.progress) {
        clearTimeout(timer);
        timer = setTimeout(() => finish(null, new Error("generation-timeout")), 60000);
        onProgress?.(data.progress);
        return;
      }
      if (data.error !== undefined) finish(null, new Error(data.error));
      else if (data.result) finish(data.result);
    };
    worker.onerror = event => finish(null, new Error(event.message || "generation-worker"));
    worker.onmessageerror = () => finish(null, new Error("generation-worker"));
    try {
      worker.postMessage({ id, inputRevision, source, task } satisfies VectorGenerationRequest);
    } catch (error) {
      finish(null, error instanceof Error ? error : new Error(String(error)));
    }
  });
  return { result, cancel: () => cancel() };
}
