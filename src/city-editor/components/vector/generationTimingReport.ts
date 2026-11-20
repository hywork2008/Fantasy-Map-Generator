import type { VectorGenerationTimings } from "../../services/vectorGenerationWorkerClient";

export interface GenerationTimingRow {
  stage: string;
  ms: number;
}
export interface GenerationTimingReport {
  label: string;
  totalMs: number;
  rows: GenerationTimingRow[];
}

const round = (ms: number) => Math.round(ms * 10) / 10;

/**
 * Rows in execution order: every worker stage, the worker time no stage covered, the transfer and the page's
 * adoption. Their sum is the total from the click to the drawn city.
 */
export function generationTimingReport(
  label: string,
  timings: VectorGenerationTimings,
  extra: GenerationTimingRow[] = []
): GenerationTimingReport {
  const rows = timings.stages.map(s => ({ stage: `${s.group}/${s.phase}`, ms: s.ms }));
  const measured = rows.reduce((sum, row) => sum + row.ms, 0);
  rows.push({ stage: "worker/other", ms: Math.max(0, timings.workerMs - measured) });
  if (timings.roundTripMs !== undefined)
    rows.push({ stage: "page/request-and-transfer", ms: Math.max(0, timings.roundTripMs - timings.workerMs) });
  rows.push(...extra);
  const totalMs = rows.reduce((sum, row) => sum + row.ms, 0);
  return { label, totalMs: round(totalMs), rows: rows.map(row => ({ stage: row.stage, ms: round(row.ms) })) };
}

export function formatGenerationTimingReport(report: GenerationTimingReport): string {
  const width = Math.max(5, ...report.rows.map(row => row.stage.length));
  const line = (stage: string, ms: number) =>
    `${stage.padEnd(width)} ${ms.toFixed(1).padStart(9)} ms ${((ms / (report.totalMs || 1)) * 100).toFixed(1).padStart(5)}%`;
  return [report.label, ...report.rows.map(row => line(row.stage, row.ms)), line("total", report.totalMs)].join("\n");
}

/** Always on: one collapsed group per generation in the developer console. */
export function logGenerationTimingReport(report: GenerationTimingReport): void {
  console.groupCollapsed(`[CE meshless] generation ${report.totalMs.toFixed(1)} ms — ${report.label}`);
  console.table(report.rows);
  console.groupEnd();
}
