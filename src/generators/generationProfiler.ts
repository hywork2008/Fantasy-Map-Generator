import { TIME } from "../utils/debug";

/**
 * Measures one synchronous map-generation step using the same console timer
 * output as the core generators. The `finally` keeps the timer balanced when
 * a generator throws, so the next map generation starts with clean timings.
 */
export function measureGenerationStep<T>(label: string, fn: () => T): T {
  if (!TIME) return fn();

  console.time(label);
  try {
    return fn();
  } finally {
    console.timeEnd(label);
  }
}
