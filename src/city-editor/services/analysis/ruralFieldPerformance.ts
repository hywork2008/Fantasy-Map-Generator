import type { DistrictFabric } from "../../generators/blockInfill.types";
import { applyRuralFields } from "../../generators/ruralFields";
import type { CityDocument } from "../../types/document";
import { RuralFieldProfiler, withRuralRenderProfiler } from "../../utils/ruralFieldProfiler";
import { startRuralFields } from "../ruralFieldWorkerClient";

export function profileRuralFieldGeneration(document: CityDocument, fabric: DistrictFabric) {
  const profiler = new RuralFieldProfiler();
  const started = performance.now();
  const result = applyRuralFields(document, fabric, profiler);
  return {
    result,
    report: { generationMs: performance.now() - started, counts: profiler.counts, timings: profiler.snapshot() }
  };
}

/** Explicit diagnostics only. The normal editor keeps its five-second limit. */
export async function profileRuralFieldWorker(document: CityDocument, fabric: DistrictFabric, timeoutMs = 60_000) {
  let report: unknown;
  const run = startRuralFields(document, fabric, timeoutMs, {
    onProfile: value => {
      report = value;
    }
  });
  const overlay = await run.result;
  return { overlay, report, completed: overlay !== null };
}

/** Browser-only: measures SVG construction separately from live DOM attachment/layout. */
export async function profileRuralFieldRendering(
  document: CityDocument,
  render: () => SVGSVGElement,
  host: HTMLElement
) {
  const profiler = new RuralFieldProfiler();
  const started = performance.now();
  const svg = withRuralRenderProfiler(document, profiler, render);
  const svgMs = performance.now() - started;
  const attached = performance.now();
  host.replaceChildren(svg);
  const attachMs = performance.now() - attached;
  const layoutStarted = performance.now();
  svg.getBoundingClientRect();
  const layoutMs = performance.now() - layoutStarted;
  const paintStarted = performance.now();
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  return {
    svgMs,
    attachMs,
    layoutMs,
    nextPaintOpportunityMs: performance.now() - paintStarted,
    svgNodes: svg.querySelectorAll("*").length,
    timings: profiler.snapshot()
  };
}
