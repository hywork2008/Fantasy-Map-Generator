export interface RuralFieldTiming {
  path: string;
  kind: "stage" | "operation";
  calls: number;
  elapsedMs: number;
  selfMs: number;
}

/** Opt-in timings. Operation totals are included in their enclosing stage. */
export class RuralFieldProfiler {
  private timings = new Map<string, Omit<RuralFieldTiming, "selfMs">>();
  private active: { path: string }[] = [];
  readonly counts: Record<string, number> = {};
  constructor(private clock = () => performance.now()) {}

  private record(path: string, kind: RuralFieldTiming["kind"], elapsedMs: number) {
    const timing = this.timings.get(path) ?? { path, kind, calls: 0, elapsedMs: 0 };
    timing.calls++;
    timing.elapsedMs += elapsedMs;
    this.timings.set(path, timing);
  }

  stages(prefix: string) {
    const frame = { path: prefix };
    this.active.push(frame);
    let started = this.clock();
    let phase = "";
    const flush = () => {
      if (phase) this.record(frame.path, "stage", this.clock() - started);
    };
    return {
      next: (name: string) => {
        flush();
        phase = name;
        frame.path = `${prefix}/${name}`;
        started = this.clock();
      },
      end: () => {
        flush();
        this.active.splice(this.active.indexOf(frame), 1);
      }
    };
  }

  wrap<A extends unknown[], R>(name: string, action: (...args: A) => R): (...args: A) => R {
    return (...args) => {
      const path = `${this.active.at(-1)?.path ?? "generation"}/${name}`;
      const started = this.clock();
      const frame = { path };
      this.active.push(frame);
      try {
        return action(...args);
      } finally {
        this.active.pop();
        this.record(path, "operation", this.clock() - started);
      }
    };
  }

  snapshot(): RuralFieldTiming[] {
    const values = [...this.timings.values()];
    return values
      .map(timing => ({
        ...timing,
        selfMs: Math.max(
          0,
          timing.elapsedMs -
            values
              .filter(
                child =>
                  child.path.startsWith(`${timing.path}/`) && !child.path.slice(timing.path.length + 1).includes("/")
              )
              .reduce((sum, child) => sum + child.elapsedMs, 0)
        )
      }))
      .sort((a, b) => b.selfMs - a.selfMs);
  }
}

const renderProfiles = new WeakMap<object, RuralFieldProfiler>();
export function ruralRenderProfiler(document: object) {
  return renderProfiles.get(document);
}
export function withRuralRenderProfiler<T>(document: object, profiler: RuralFieldProfiler, action: () => T): T {
  const previous = renderProfiles.get(document);
  renderProfiles.set(document, profiler);
  try {
    return action();
  } finally {
    if (previous) renderProfiles.set(document, previous);
    else renderProfiles.delete(document);
  }
}
