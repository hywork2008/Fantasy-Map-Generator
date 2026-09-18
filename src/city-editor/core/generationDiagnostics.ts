/** Transient diagnostics; never stored in a city document or undo history. */
export interface GenerationFailure {
  /** Machine-readable cause, e.g. `urban-area-too-small`. */
  reason: string;
  /** One-line description of what went wrong. */
  message: string;
  /** Extra "how" lines: ids, thresholds, validate() messages. */
  details?: string[];
}

export interface GenerationSample {
  phase: string;
  elapsedMs: number;
  attempt: number;
  counts?: Record<string, number>;
  failure?: GenerationFailure;
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

/** Japanese stage label for progress text and console reports. */
export function generationPhaseLabel(phase: string): string {
  if (phase === "prepare") return "準備";
  if (phase === "complete") return "全体";
  if (phase === "apply-validation") return "メッシュ検証";
  if (phase.includes("coast") || phase.includes("river") || phase.includes("terrain")) return "地形";
  if (phase === "urban") return "市街地";
  if (phase.includes("wall")) return "城壁・門";
  if (phase.includes("street") || phase.includes("route") || phase.includes("road")) return "街道・橋";
  if (phase.includes("rectify") || phase.includes("geometry")) return "形状の仕上げ";
  if (phase.includes("crossing")) return "交差の検証";
  if (phase.includes("validation")) return "接続の検証";
  return "都市の構成";
}

export function reportGenerationFailure(
  observer: GenerationObserver | undefined,
  attempt: number,
  phase: string,
  reason: string,
  message: string,
  counts?: Record<string, number>,
  details?: string[]
): GenerationSample {
  const sample: GenerationSample = {
    phase,
    elapsedMs: 0,
    attempt,
    counts,
    failure: { reason, message, details }
  };
  observer?.(sample);
  if (!observer) logGenerationFailures([sample]);
  return sample;
}

export function generationFailuresOf(samples: readonly GenerationSample[]): GenerationSample[] {
  return samples.filter(sample => sample.failure);
}

export function formatGenerationFailureLog(
  samples: readonly GenerationSample[],
  context?: Record<string, string | number>
): string {
  const failures = generationFailuresOf(samples).filter(sample => sample.failure?.reason !== "all-attempts-rejected");
  const lines = ["[City Editor] 都市の生成に失敗しました"];
  if (context) {
    const parts = Object.entries(context).map(([key, value]) => `${key}=${value}`);
    if (parts.length) lines.push(`条件: ${parts.join(" · ")}`);
  }
  if (!failures.length) {
    lines.push("不採用理由は記録されていない");
    return lines.join("\n");
  }
  lines.push(`${failures.length}案が不採用:`);
  for (const sample of failures) {
    const failure = sample.failure!;
    lines.push(
      `  案${sample.attempt} · ${generationPhaseLabel(sample.phase)}（${sample.phase}）· ${failure.reason}: ${failure.message}`
    );
    if (sample.counts) {
      const counts = Object.entries(sample.counts)
        .map(([key, value]) => `${key}=${value}`)
        .join(", ");
      if (counts) lines.push(`    数値: ${counts}`);
    }
    for (const detail of failure.details ?? []) lines.push(`    ${detail}`);
  }
  return lines.join("\n");
}

/** Console report: which stage, why, and how each attempt was rejected. */
export function logGenerationFailures(
  samples: readonly GenerationSample[],
  context?: Record<string, string | number>
): void {
  const failures = generationFailuresOf(samples);
  if (!failures.length) return;
  const attempts = failures.filter(sample => sample.failure?.reason !== "all-attempts-rejected");
  console.group(`[City Editor] 都市の生成に失敗しました（${attempts.length || failures.length}案が不採用）`);
  if (context) console.error("条件", context);
  console.error(formatGenerationFailureLog(samples, context));
  for (const sample of attempts) {
    const failure = sample.failure!;
    console.error(
      `案${sample.attempt} · ${generationPhaseLabel(sample.phase)}（${sample.phase}）· ${failure.reason}: ${failure.message}`,
      {
        attempt: sample.attempt,
        stage: generationPhaseLabel(sample.phase),
        phase: sample.phase,
        reason: failure.reason,
        how: failure.message,
        counts: sample.counts,
        details: failure.details
      }
    );
  }
  console.groupEnd();
}
