import { rn } from "../utils";
import { DEBUG, TIME } from "../utils/debug";

/**
 * Aggregates per-step wall-clock cost across advanceTime() calls so the incremental cost of
 * adding a new tick hook (or core simulation step) can be measured instead of guessed. Timing
 * itself is gated by TIME (existing convention, tree-shakeable in production); the auto-printed
 * summary is additionally gated by DEBUG.tickProfiler (off by default — enable via
 * localStorage.setItem("debug", JSON.stringify({ tickProfiler: true })) and reload) so normal
 * play doesn't get a console.table on every Advance Day/Month/Year batch.
 */
export interface TickProfileEntry {
  label: string;
  calls: number;
  totalMs: number;
  lastMs: number;
  maxMs: number;
}

const _entries = new Map<string, TickProfileEntry>();

/** Runs `fn`, recording its wall-clock cost under `label`. Zero overhead when TIME is false. */
export function measureTickStep<T>(label: string, fn: () => T): T {
  if (!TIME) return fn();

  const start = performance.now();
  const result = fn();
  record(label, performance.now() - start);
  return result;
}

/**
 * Same as measureTickStep(), for an async step (e.g. one of the "*Incrementally" economy-
 * generation entry points that yield to the browser between batches). The recorded duration
 * spans the full awaited call, including any yields, so it reflects the effective wall-clock
 * cost a caller actually waited through — not just the synchronous dispatch time a plain
 * measureTickStep(label, () => asyncFn()) would capture.
 */
export async function measureTickStepAsync<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!TIME) return fn();

  const start = performance.now();
  const result = await fn();
  record(label, performance.now() - start);
  return result;
}

function record(label: string, elapsedMs: number): void {
  const entry = _entries.get(label) ?? { label, calls: 0, totalMs: 0, lastMs: 0, maxMs: 0 };
  entry.calls += 1;
  entry.totalMs += elapsedMs;
  entry.lastMs = elapsedMs;
  entry.maxMs = Math.max(entry.maxMs, elapsedMs);
  _entries.set(label, entry);
}

/** Snapshot of every measured step so far, most expensive (total time) first. */
export function getTickProfile(): TickProfileEntry[] {
  return Array.from(_entries.values()).sort((a, b) => b.totalMs - a.totalMs);
}

export function resetTickProfile(): void {
  _entries.clear();
}

/** Prints the current profile as a table, when DEBUG.tickProfiler is enabled. No-op otherwise. */
export function logTickProfile(): void {
  if (!DEBUG.tickProfiler) return;
  const entries = getTickProfile();
  if (!entries.length) return;

  console.table(
    entries.map(entry => ({
      step: entry.label,
      calls: entry.calls,
      "total ms": rn(entry.totalMs, 2),
      "avg ms": rn(entry.totalMs / entry.calls, 2),
      "last ms": rn(entry.lastMs, 2),
      "max ms": rn(entry.maxMs, 2)
    }))
  );
}
