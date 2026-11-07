export type GenerationTimingObserver = (phase: string, elapsedMs: number) => void;

/** Optional consecutive, non-overlapping spans; never saved in the city document. */
export function generationTiming(observer?: GenerationTimingObserver) {
  let started = observer ? performance.now() : 0;
  return (phase: string) => {
    if (!observer) return;
    const now = performance.now();
    observer(phase, now - started);
    started = performance.now();
  };
}
