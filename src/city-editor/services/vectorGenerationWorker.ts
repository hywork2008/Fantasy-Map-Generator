import type { PerimeterCellResult, PerimeterStreetPlan } from "../generators/vector/generation/perimeter";
import { generateVectorSkeleton } from "../generators/vector/generation/pipeline";
import type { VectorUrbanDistrictRequest } from "../generators/vector/generation/urban";
import { generateVectorUrbanAsync } from "../generators/vector/generation/urban";
import { createVectorDistrictPool, vectorDistrictWorkerCount } from "./vectorDistrictPool";
import type {
  VectorGenerationPlans,
  VectorGenerationReply,
  VectorGenerationRequest,
  VectorGenerationStageTiming
} from "./vectorGenerationWorkerClient";

self.onmessage = async ({ data }: MessageEvent<VectorGenerationRequest>) => {
  const { id, inputRevision, source, task } = data;
  // Districts are planned in nested workers where the browser allows them; the result does not depend on it.
  const pool = createVectorDistrictPool(
    typeof Worker === "undefined" ? 1 : (data.districtWorkers ?? vectorDistrictWorkerCount())
  );
  const started = performance.now(),
    stages: VectorGenerationStageTiming[] = [];
  const observe = (group: VectorGenerationStageTiming["group"]) => (phase: string, ms: number) =>
    stages.push({ group, phase, ms });
  try {
    if (source.revision !== inputRevision) throw new Error("generation-revision");
    const progress = (
      phase: "skeleton" | "lanes" | "facilities" | "housing" | "validation",
      completed?: number,
      total?: number
    ) => self.postMessage({ id, inputRevision, progress: { phase, completed, total } } satisfies VectorGenerationReply);
    const plan = pool.plan.bind(pool);
    // Sent with the result in one message, so the plans' street blocks stay the objects their requests name.
    const planned: VectorGenerationPlans = [];
    const keep = (request: VectorUrbanDistrictRequest, results: PerimeterStreetPlan[] | PerimeterCellResult[]) =>
      planned.push({ request, results });
    progress("skeleton");
    const result =
      task.kind === "city"
        ? {
            document: await generateVectorUrbanAsync(
              generateVectorSkeleton(source, task.settings, observe("skeleton")).document,
              task.urban,
              plan,
              undefined,
              { progress, planned: keep, timings: observe("urban") }
            ),
            stages: []
          }
        : task.kind === "skeleton"
          ? generateVectorSkeleton(source, task.settings, observe("skeleton"))
          : {
              document: await generateVectorUrbanAsync(source, task.settings, plan, undefined, {
                progress,
                planned: keep,
                timings: observe("urban")
              }),
              stages: []
            };
    const timings = {
      stages,
      workerMs: performance.now() - started,
      postedAt: performance.timeOrigin + performance.now()
    };
    self.postMessage({ id, inputRevision, result, planned, timings } satisfies VectorGenerationReply);
  } catch (error) {
    self.postMessage({
      id,
      inputRevision,
      error: error instanceof Error ? error.message : String(error)
    } satisfies VectorGenerationReply);
  } finally {
    pool.dispose();
  }
};
