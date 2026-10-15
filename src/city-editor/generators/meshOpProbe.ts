/**
 * Opt-in counters for whole-document operations (copy, validation), keyed by
 * operation and by the enclosing ProcessingProfiler stage. Benchmarks only
 * (scripts/benchmarkCeGiant.mjs); off, a call costs one boolean test.
 */
export interface MeshOpStat {
  op: string;
  stage: string;
  calls: number;
  ms: number;
}

const state = {
  enabled: false,
  stage: (): string | null => null,
  stats: new Map<string, MeshOpStat>()
};

export function enableMeshOpProbe(stage: () => string | null): void {
  state.enabled = true;
  state.stage = stage;
  state.stats.clear();
}

export function disableMeshOpProbe(): MeshOpStat[] {
  state.enabled = false;
  const stats = [...state.stats.values()];
  state.stats.clear();
  return stats;
}

export function probed<T>(op: string, action: () => T): T {
  if (!state.enabled) return action();
  const started = performance.now();
  try {
    return action();
  } finally {
    const stage = state.stage() ?? "(none)";
    const key = `${op}\u0000${stage}`;
    const stat = state.stats.get(key) ?? { op, stage, calls: 0, ms: 0 };
    stat.calls++;
    stat.ms += performance.now() - started;
    state.stats.set(key, stat);
  }
}
