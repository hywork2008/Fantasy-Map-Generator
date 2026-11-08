import type {
  PerimeterDistrictJob,
  PerimeterDistrictResult,
  PerimeterPlanContext
} from "../generators/vector/generation/perimeter";
import { planPerimeterDistrict } from "../generators/vector/generation/perimeter";
import type { VectorUrbanDistrictRequest } from "../generators/vector/generation/urban";

export interface VectorDistrictRequest {
  id: number;
  context: PerimeterPlanContext;
  jobs: PerimeterDistrictJob[];
}
export type VectorDistrictReply = { id: number } & (
  | { results: PerimeterDistrictResult[]; error?: never }
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

/** Job indices per worker: largest outline first, each to the least loaded worker. Districts are few (six in
 * the fixed 50,000-person input) and uneven, so contiguous runs would leave workers idle. */
export function balancedGroups(jobs: PerimeterDistrictJob[], n: number): number[][] {
  const area = (job: PerimeterDistrictJob) =>
      Math.abs(
        job.outline.reduce((sum, p, i) => {
          const q = job.outline[(i + 1) % job.outline.length];
          return sum + p[0] * q[1] - q[0] * p[1];
        }, 0)
      ) / 2,
    order = jobs.map((job, i) => ({ i, area: area(job) })).sort((a, b) => b.area - a.area || a.i - b.i),
    groups = Array.from({ length: n }, () => ({ load: 0, jobs: [] as number[] }));
  for (const { i, area: a } of order) {
    const target = groups.reduce((best, g) => (g.load < best.load ? g : best));
    target.load += a;
    target.jobs.push(i);
  }
  return groups.map(g => g.jobs.sort((a, b) => a - b)).filter(g => g.length);
}

/** Plans districts in `count` workers. Results go back to job order, so the document is the same for any count.
 * One worker, or no worker support, plans here. */
export function createVectorDistrictPool(
  count: number,
  createWorker: () => VectorDistrictWorker = () =>
    new Worker(new URL("./vectorDistrictWorker.ts", import.meta.url), { type: "module" }) as VectorDistrictWorker
) {
  const workers: VectorDistrictWorker[] = [];
  let nextId = 0;
  const run = (worker: VectorDistrictWorker, request: VectorDistrictRequest) =>
    new Promise<PerimeterDistrictResult[]>((resolve, reject) => {
      worker.onmessage = ({ data }) => {
        if (data.id !== request.id) return;
        if (data.error !== undefined) reject(new Error(data.error));
        else resolve(data.results!);
      };
      worker.onerror = event => reject(new Error(event.message || "district-worker"));
      worker.postMessage(request);
    });
  return {
    async plan({ context, jobs }: VectorUrbanDistrictRequest): Promise<PerimeterDistrictResult[]> {
      const n = Math.min(count, jobs.length);
      if (n <= 1) return jobs.map(job => planPerimeterDistrict(context, job));
      while (workers.length < n) workers.push(createWorker());
      const groups = balancedGroups(jobs, n),
        parts = await Promise.all(
          groups.map((group, i) => run(workers[i], { id: ++nextId, context, jobs: group.map(k => jobs[k]) }))
        ),
        results: PerimeterDistrictResult[] = new Array(jobs.length);
      for (const [i, group] of groups.entries()) for (const [j, k] of group.entries()) results[k] = parts[i][j];
      return results;
    },
    dispose() {
      for (const worker of workers) worker.terminate();
      workers.length = 0;
    }
  };
}
