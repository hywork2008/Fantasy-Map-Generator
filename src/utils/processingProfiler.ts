/** Synchronous, opt-in nested timings. Self time excludes measured child calls. */
export interface ProcessingTiming {
  path: string;
  parent: string | null;
  depth: number;
  calls: number;
  elapsedMs: number;
  selfMs: number;
}
export class ProcessingProfiler {
  private stack: Array<{ path: string; childrenMs: number }> = [];
  private timings = new Map<string, ProcessingTiming>();
  constructor(private clock = () => performance.now()) {}

  measure<T>(phase: string, action: () => T): T {
    const parent = this.stack.at(-1);
    const path = parent ? `${parent.path}/${phase}` : phase;
    const depth = this.stack.length;
    const frame = { path, childrenMs: 0 };
    this.stack.push(frame);
    const started = this.clock();
    try {
      return action();
    } finally {
      const elapsedMs = this.clock() - started;
      this.stack.pop();
      if (parent) parent.childrenMs += elapsedMs;
      const timing = this.timings.get(path) ?? {
        path,
        parent: parent?.path ?? null,
        depth,
        calls: 0,
        elapsedMs: 0,
        selfMs: 0
      };
      timing.calls++;
      timing.elapsedMs += elapsedMs;
      timing.selfMs += Math.max(0, elapsedMs - frame.childrenMs);
      this.timings.set(path, timing);
    }
  }

  snapshot(): ProcessingTiming[] {
    return [...this.timings.values()].map(timing => ({ ...timing })).sort((a, b) => a.path.localeCompare(b.path));
  }
}
export function measureProcessing<T>(profiler: ProcessingProfiler | undefined, phase: string, action: () => T): T {
  return profiler ? profiler.measure(phase, action) : action();
}
