import type { VectorEditResult } from "../generators/vector/editing/dependencies";
import type { VectorCityDocument } from "../types/vector/document";
export interface VectorEditRequest {
  id: number;
  inputRevision: number;
  source: VectorCityDocument;
  candidate: VectorCityDocument;
}
export type VectorEditReply = { id: number; inputRevision: number } & (
  | { result: VectorEditResult; error?: never }
  | { error: string; result?: never }
);
let nextId = 0;
/** A terminated worker cannot finish old geometry loops or publish a stale result. */
export function startVectorEdit(
  source: VectorCityDocument,
  candidate: VectorCityDocument,
  createWorker = () => new Worker(new URL("./vectorEditWorker.ts", import.meta.url), { type: "module" })
) {
  const worker = createWorker(),
    id = ++nextId,
    inputRevision = source.revision;
  let cancel = () => {};
  const result = new Promise<VectorEditResult | null>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(null, new Error("dependency-timeout")), 60000);
    const finish = (value: VectorEditResult | null, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      if (error) reject(error);
      else resolve(value);
    };
    cancel = () => finish(null);
    worker.onmessage = ({ data }: MessageEvent<VectorEditReply>) => {
      if (data.id !== id || data.inputRevision !== inputRevision) return;
      if (data.error !== undefined) finish(null, new Error(data.error));
      else finish(data.result);
    };
    worker.onerror = event => finish(null, new Error(event.message || "dependency-worker"));
    worker.onmessageerror = () => finish(null, new Error("dependency-worker"));
    try {
      worker.postMessage({ id, inputRevision, source, candidate } satisfies VectorEditRequest);
    } catch (error) {
      finish(null, error instanceof Error ? error : new Error(String(error)));
    }
  });
  return { result, cancel: () => cancel() };
}
