import type { PerimeterCellResult, PerimeterStreetPlan } from "../generators/vector/generation/perimeter";
import { generateVectorSkeleton } from "../generators/vector/generation/pipeline";
import type { VectorUrbanDistrictRequest } from "../generators/vector/generation/urban";
import { generateVectorUrbanAsync } from "../generators/vector/generation/urban";
import { validatedContentKey } from "../generators/vector/validation/document";
import { createVectorDistrictPool, vectorDistrictWorkerCount } from "./vectorDistrictPool";
import type {
  VectorGenerationPlans,
  VectorGenerationReply,
  VectorGenerationRequest,
  VectorGenerationStageTiming
} from "./vectorGenerationWorkerClient";

const districtWorkers = (requested?: number) =>
  typeof Worker === "undefined" ? 1 : (requested ?? vectorDistrictWorkerCount());
// Districts are planned in nested workers where the browser allows them; the result does not depend on it. They are
// started with this worker, which the page starts ahead of the generation, so their code is loaded before it.
let districts = { count: districtWorkers(), pool: createVectorDistrictPool(districtWorkers()) };

self.onmessage = async ({ data }: MessageEvent<VectorGenerationRequest>) => {
  const { id, inputRevision, source, task } = data;
  if (districtWorkers(data.districtWorkers) !== districts.count) {
    districts.pool.dispose();
    const count = districtWorkers(data.districtWorkers);
    districts = { count, pool: createVectorDistrictPool(count) };
  }
  const { pool } = districts;
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
              generateVectorSkeleton(source, task.settings, observe("skeleton"), undefined, { urbanFollows: true })
                .document,
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
    const validatedKey = validatedContentKey(result.document);
    self.postMessage({ id, inputRevision, result, planned, timings, validatedKey } satisfies VectorGenerationReply);
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
