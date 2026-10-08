/** Opt-in nested timings. Self time excludes measured child calls. */
export interface ProcessingTiming {
  path: string;
  parent: string | null;
  depth: number;
  calls: number;
  elapsedMs: number;
  selfMs: number;
}
interface Frame {
  path: string;
  parent: Frame | undefined;
  depth: number;
  childrenMs: number;
  started: number;
}
export class ProcessingProfiler {
  private stack: Frame[] = [];
  private timings = new Map<string, ProcessingTiming>();
  private firstStarts = new Set<string>();
  constructor(private clock = () => performance.now()) {}

  measure<T>(phase: string, action: () => T): T {
    const frame = this.begin(phase);
    try {
      return action();
    } finally {
      this.end(frame);
    }
  }

  /**
   * Async work nests like synchronous work. Only one measured async chain may be in flight:
   * unrelated measurements started while it awaits would be attributed to its current frame.
   */
  async measureAsync<T>(phase: string, action: () => Promise<T>): Promise<T> {
    const frame = this.begin(phase);
    try {
      return await action();
    } finally {
      this.end(frame);
    }
  }

  snapshot(): ProcessingTiming[] {
    return [...this.timings.values()].map(timing => ({ ...timing })).sort((a, b) => a.path.localeCompare(b.path));
  }

  /** Paths in the order each was first entered, for execution-ordered reports. */
  startOrder(): string[] {
    return [...this.firstStarts];
  }

  private begin(phase: string): Frame {
    const parent = this.stack.at(-1);
    const path = parent ? `${parent.path}/${phase}` : phase;
    this.firstStarts.add(path);
    const frame = { path, parent, depth: this.stack.length, childrenMs: 0, started: this.clock() };
    this.stack.push(frame);
    return frame;
  }

  private end(frame: Frame): void {
    const elapsedMs = this.clock() - frame.started;
    // A thrown async child may unwind out of order; drop it and anything above it.
    const index = this.stack.lastIndexOf(frame);
    if (index >= 0) this.stack.length = index;
    if (frame.parent) frame.parent.childrenMs += elapsedMs;
    const timing = this.timings.get(frame.path) ?? {
      path: frame.path,
      parent: frame.parent?.path ?? null,
      depth: frame.depth,
      calls: 0,
      elapsedMs: 0,
      selfMs: 0
    };
    timing.calls++;
    timing.elapsedMs += elapsedMs;
    timing.selfMs += Math.max(0, elapsedMs - frame.childrenMs);
    this.timings.set(frame.path, timing);
  }
}
export function measureProcessing<T>(profiler: ProcessingProfiler | undefined, phase: string, action: () => T): T {
  return profiler ? profiler.measure(phase, action) : action();
}
