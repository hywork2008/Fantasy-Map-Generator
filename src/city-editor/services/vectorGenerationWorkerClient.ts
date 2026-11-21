import {
  type PerimeterCellResult,
  type PerimeterStreetPlan,
  rememberPerimeterResults
} from "../generators/vector/generation/perimeter";
import type { VectorGenerationResult } from "../generators/vector/generation/pipeline";
import type { VectorUrbanDistrictRequest } from "../generators/vector/generation/urban";
import { acceptValidatedContent } from "../generators/vector/validation/document";
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
  /** District planning workers; omitted means one fewer than the cores, at most four. */
  districtWorkers?: number;
}
export interface VectorGenerationProgress {
  phase: "skeleton" | "lanes" | "facilities" | "housing" | "validation";
  completed?: number;
  total?: number;
}
/** The district plans a generation computed, in request order. */
export type VectorGenerationPlans = {
  request: VectorUrbanDistrictRequest;
  results: PerimeterStreetPlan[] | PerimeterCellResult[];
}[];
/** One consecutive span of a generation, in execution order. Never stored in the city document. */
export interface VectorGenerationStageTiming {
  /** "skeleton" (streets, walls, bridges) or "urban" (lanes, facilities, housing). */
  group: "skeleton" | "urban";
  phase: string;
  ms: number;
}
/** Wall-clock timings of one generation, measured in the worker and completed by the page. */
export interface VectorGenerationTimings {
  stages: VectorGenerationStageTiming[];
  /** Worker time from receiving the request to posting the result. */
  workerMs: number;
  /** Posting the result until the page received it (structured clone). */
  transferMs?: number;
  /** Request posted until the result arrived on the page. */
  roundTripMs?: number;
}
export type VectorGenerationReply = { id: number; inputRevision: number } & (
  | {
      result: VectorGenerationResult;
      planned?: VectorGenerationPlans;
      /** The result document's content key, when the worker validated that very content. */
      validatedKey?: string;
      timings?: VectorGenerationTimings & { postedAt: number };
      error?: never;
    }
  | { error: string; result?: never; progress?: never }
  | { progress: VectorGenerationProgress; error?: never; result?: never }
);
let nextId = 0;
/** Upper bound of one generation, however often it reports progress. */
export const GENERATION_TOTAL_LIMIT_MS = 300000;
const newGenerationWorker = () =>
  new Worker(new URL("./vectorGenerationWorker.ts", import.meta.url), { type: "module" });
let spare: Worker | undefined;
/**
 * Starts the next generation's worker ahead, so loading its code (and its district workers) is not part of the next
 * generation's time. Each generation still has a worker of its own.
 */
export function prepareVectorGenerationWorker(): void {
  if (typeof Worker !== "undefined") spare ??= newGenerationWorker();
}
/** The worker started ahead, or a new one; the next is started once this generation ends. */
export function takeVectorGenerationWorker(): Worker {
  const worker = spare ?? newGenerationWorker();
  spare = undefined;
  return worker;
}
/** One worker per generation; termination cancels the geometry computation itself. */
export function startVectorGeneration(
  source: VectorCityDocument,
  task: VectorGenerationTask,
  createWorker: () => Worker = takeVectorGenerationWorker,
  onProgress?: (progress: VectorGenerationProgress) => void,
  onTimings?: (timings: VectorGenerationTimings) => void
) {
  const worker = createWorker(),
    id = ++nextId,
    inputRevision = source.revision;
  let cancel = () => {};
  const result = new Promise<VectorGenerationResult | null>((resolve, reject) => {
    let settled = false;
    let timer = setTimeout(() => finish(null, new Error("generation-timeout")), 60000);
    // Progress resets the silence limit above; this one bounds the whole run.
    const deadline = setTimeout(() => finish(null, new Error("generation-timeout")), GENERATION_TOTAL_LIMIT_MS);
    const finish = (value: VectorGenerationResult | null, error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(deadline);
      worker.onmessage = worker.onerror = worker.onmessageerror = null;
      worker.terminate();
      // After the page has taken the result: starting a worker competes with drawing it.
      if (createWorker === takeVectorGenerationWorker) setTimeout(prepareVectorGenerationWorker, 0);
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
      else if (data.result) {
        // Kept here, so the page need not plan the shown city again on the main thread before its first edit.
        for (const { request, results } of data.planned ?? []) rememberPerimeterResults(request, results);
        if (data.validatedKey) acceptValidatedContent(data.validatedKey);
        if (data.timings) {
          const { postedAt, ...timings } = data.timings,
            now = performance.now();
          onTimings?.({
            ...timings,
            transferMs: Math.max(0, performance.timeOrigin + now - postedAt),
            roundTripMs: now - requested
          });
        }
        finish(data.result);
      }
    };
    worker.onerror = event => finish(null, new Error(event.message || "generation-worker"));
    worker.onmessageerror = () => finish(null, new Error("generation-worker"));
    const requested = performance.now();
    try {
      worker.postMessage({ id, inputRevision, source, task } satisfies VectorGenerationRequest);
    } catch (error) {
      finish(null, error instanceof Error ? error : new Error(String(error)));
    }
  });
  return { result, cancel: () => cancel() };
}
