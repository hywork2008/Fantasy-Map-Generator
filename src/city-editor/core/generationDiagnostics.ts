/** Transient diagnostics; never stored in a city document or undo history. */
export interface GenerationSample {
  phase: string;
  elapsedMs: number;
  attempt: number;
  counts?: Record<string, number>;
}
export type GenerationObserver = (sample: GenerationSample) => void;

export function generationTimer(observer?: GenerationObserver, attempt = 1) {
  let started = performance.now();
  return (phase: string, counts?: Record<string, number>) => {
    const now = performance.now();
    observer?.({ phase, elapsedMs: now - started, attempt, counts });
    started = performance.now();
  };
}
