import { perimeterPlansKept } from "../generators/vector/generation/perimeter";
import { prepareVectorUrbanPlans } from "../generators/vector/generation/urban";
import type { VectorCityDocument } from "../types/vector/document";
import { createVectorDistrictPool, type VectorDistrictWorker, vectorDistrictWorkerCount } from "./vectorDistrictPool";

/** Delay after the last request, so a burst of history steps prepares once. */
const QUIET_MS = 800;

/**
 * Keeps the district plans of the shown city on the main thread, where dependency updates run. Generation plans
 * in its own worker, and opened documents bring no plans, so without this the first edit replans every district
 * (about 4 s at 50,000 people). Plans are computed in district workers; only the steps before the first plan
 * request run here. Without worker support nothing is prepared: planning here would block the page instead.
 */
export function createVectorPlanPreparation(
  options: {
    workers?: number;
    createWorker?: () => VectorDistrictWorker;
    /** Called when a preparation finishes or fails; for tests and diagnostics. */
    onSettled?: (outcome: "prepared" | "stopped" | "failed") => void;
  } = {}
) {
  const count = options.workers ?? vectorDistrictWorkerCount();
  let timer: ReturnType<typeof setTimeout> | undefined,
    generation = 0,
    pool: ReturnType<typeof createVectorDistrictPool> | undefined,
    /** The document being waited for or prepared. */
    pending: Readonly<VectorCityDocument> | undefined;
  const stop = () => {
    generation++;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pool?.dispose();
    pool = undefined;
    pending = undefined;
  };
  const start = async (doc: VectorCityDocument) => {
    const own = ++generation,
      active = () => own === generation;
    pool = createVectorDistrictPool(count, options.createWorker);
    const current = pool;
    try {
      await prepareVectorUrbanPlans(doc, doc.urban!.settings, request => current.plan(request), active);
      options.onSettled?.(active() ? "prepared" : "stopped");
    } catch {
      // Preparation only saves time; the edit plans what it lacks.
      options.onSettled?.("failed");
    } finally {
      current.dispose();
      if (pool === current) pool = undefined;
      if (active()) pending = undefined;
    }
  };
  return {
    /** Prepares the plans of `doc` after a quiet moment, unless they are kept already. */
    request(doc: Readonly<VectorCityDocument>) {
      if (count <= 1 || (!options.createWorker && typeof Worker === "undefined")) return;
      if (doc === pending || !doc.urban || !doc.fabric || perimeterPlansKept(doc.fabric)) return;
      stop();
      pending = doc;
      timer = setTimeout(() => {
        timer = undefined;
        // History documents are never mutated, so the snapshot can be read later without copying.
        void start(doc as VectorCityDocument);
      }, QUIET_MS);
    },
    dispose: stop
  };
}
