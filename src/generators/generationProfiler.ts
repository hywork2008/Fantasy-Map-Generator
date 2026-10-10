import { DEBUG, TIME } from "../utils/debug";
import { ProcessingProfiler, type ProcessingTiming } from "../utils/processingProfiler";

/**
 * Nested map-generation timings for `npm run fmg:perf` (docs/tools/fmg-performance.md).
 * Recording only runs when localStorage `debug` contains `{"generationProfile": true}`;
 * otherwise the step helpers keep their former console-timer-only behavior.
 */
export interface GenerationProfile {
  /** Increments with every recording in this page, so callers can wait for a new one. */
  id: number;
  /** Entry point that started the session: "load", "regenerate" or "generate". */
  entry: string;
  /** Milliseconds since the session start at which each named moment was first reached. */
  marks: Record<string, number>;
  /** Paths ordered by first entry. Later roots (e.g. a deferred redraw) follow the entry root. */
  timings: ProcessingTiming[];
}

interface Session {
  id: number;
  entry: string;
  started: number;
  profiler: ProcessingProfiler;
  marks: Record<string, number>;
}

let session: Session | null = null;
let sessions = 0;

/** Starts a new recording, discarding the previous one. No-op unless profiling is enabled. */
export function beginGenerationProfile(entry: string): void {
  if (!DEBUG.generationProfile) return;
  session = { id: ++sessions, entry, started: performance.now(), profiler: new ProcessingProfiler(), marks: {} };
}

/** Records the first time a named moment is reached in the current session. */
export function markGenerationProfile(name: string): void {
  if (session && !(name in session.marks)) session.marks[name] = performance.now() - session.started;
}

/** The active profiler, for services that accept an optional `ProcessingProfiler`. */
export function activeGenerationProfiler(): ProcessingProfiler | undefined {
  return session?.profiler;
}

export function getGenerationProfile(): GenerationProfile | null {
  if (!session) return null;
  const byPath = new Map(session.profiler.snapshot().map(timing => [timing.path, timing]));
  return {
    id: session.id,
    entry: session.entry,
    marks: { ...session.marks },
    timings: session.profiler.startOrder().flatMap(path => byPath.get(path) ?? [])
  };
}

/**
 * Measures one synchronous map-generation step using the same console timer
 * output as the core generators. The `finally` keeps the timer balanced when
 * a generator throws, so the next map generation starts with clean timings.
 */
export function measureGenerationStep<T>(label: string, fn: () => T): T {
  const timed = TIME ? () => withConsoleTimer(label, fn) : fn;
  return session ? session.profiler.measure(label, timed) : timed();
}

/** Async counterpart for awaited generation stages. Stages must not overlap. */
export function measureGenerationStepAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return session ? session.profiler.measureAsync(label, fn) : fn();
}

function withConsoleTimer<T>(label: string, fn: () => T): T {
  console.time(label);
  try {
    return fn();
  } finally {
    console.timeEnd(label);
  }
}
