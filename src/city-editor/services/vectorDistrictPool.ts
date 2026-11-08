import {
  type PerimeterCellResult,
  type PerimeterRequest,
  type PerimeterStreetPlan,
  perimeterJobArea,
  planPerimeterRequest
} from "../generators/vector/generation/perimeter";

export type VectorDistrictRequest = PerimeterRequest & { id: number };
type Results = PerimeterStreetPlan[] | PerimeterCellResult[];
export type VectorDistrictReply = { id: number } & (
  | { results: Results; error?: never }
  | { error: string; results?: never }
);
/** The part of `Worker` the pool uses, so tests can stand in for it. */
export interface VectorDistrictWorker {
  postMessage(message: VectorDistrictRequest): void;
  onmessage: ((event: { data: VectorDistrictReply }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
  terminate(): void;
}

/** Up to four workers, one fewer than the cores, and at least one. */
export function vectorDistrictWorkerCount(cores = globalThis.navigator?.hardwareConcurrency ?? 1): number {
  return Math.max(1, Math.min(4, cores - 1));
}

/** Job indices per worker: largest area first, each to the least loaded worker. District and street-block
 * sizes are uneven (six districts in the fixed 50,000-person input), so contiguous runs would leave workers idle. */
export function balancedGroups(request: PerimeterRequest, n: number): number[][] {
  const order = request.jobs
      .map((_, i) => ({ i, area: perimeterJobArea(request, i) }))
      .sort((a, b) => b.area - a.area || a.i - b.i),
    groups = Array.from({ length: n }, () => ({ load: 0, jobs: [] as number[] }));
  for (const { i, area } of order) {
    const target = groups.reduce((best, g) => (g.load < best.load ? g : best));
    target.load += area;
    target.jobs.push(i);
  }
  return groups.map(g => g.jobs.sort((a, b) => a - b)).filter(g => g.length);
}

/** Plans district streets and street blocks in `count` workers. Results go back to job order, so the document
 * is the same for any count. One worker, or no worker support, plans here. */
export function createVectorDistrictPool(
  count: number,
  createWorker: () => VectorDistrictWorker = () =>
    new Worker(new URL("./vectorDistrictWorker.ts", import.meta.url), { type: "module" }) as VectorDistrictWorker
) {
  // Started at once: loading the worker code then overlaps the skeleton and the steps before the plan.
  const workers: VectorDistrictWorker[] = count > 1 ? Array.from({ length: count }, createWorker) : [];
  let nextId = 0;
  const run = (worker: VectorDistrictWorker, request: VectorDistrictRequest) =>
    new Promise<Results>((resolve, reject) => {
      worker.onmessage = ({ data }) => {
        if (data.id !== request.id) return;
        if (data.error !== undefined) reject(new Error(data.error));
        else resolve(data.results!);
      };
      worker.onerror = event => reject(new Error(event.message || "district-worker"));
      worker.postMessage(request);
    });
  return {
    async plan(request: PerimeterRequest): Promise<Results> {
      const n = Math.min(count, request.jobs.length);
      if (n <= 1) return planPerimeterRequest(request);
      while (workers.length < n) workers.push(createWorker());
      const groups = balancedGroups(request, n),
        parts = await Promise.all(
          groups.map((group, i) =>
            run(workers[i], {
              ...request,
              id: ++nextId,
              jobs: group.map(k => request.jobs[k])
            } as VectorDistrictRequest)
          )
        ),
        results: unknown[] = new Array(request.jobs.length);
      for (const [i, group] of groups.entries()) for (const [j, k] of group.entries()) results[k] = parts[i][j];
      return results as Results;
    },
    dispose() {
      for (const worker of workers) worker.terminate();
      workers.length = 0;
    }
  };
}
