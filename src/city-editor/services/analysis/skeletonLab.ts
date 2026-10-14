// Skeleton-first lab support: run K1–K5 for one request and draw the result for inspection.

import { prepareRun } from "../../generators/generation/prepareRun";
import type { SkeletonInputs } from "../../generators/generation/skeleton/contracts";
import { buildSkeletonInputs } from "../../generators/generation/skeleton/inputs";
import { planSkeleton, type SkeletonPlanResult } from "../../generators/generation/skeleton/pipeline";
import type { CityDocument } from "../../types/document";
import type { GenerationSettings } from "../../types/generation";
import type { Point } from "../../types/geometry";

export interface SkeletonLabRun {
  inputs: SkeletonInputs;
  result: SkeletonPlanResult;
  inputsMs: number;
  planMs: number;
}

export function runSkeletonLab(document: CityDocument, settings: GenerationSettings, seed: string): SkeletonLabRun {
  const started = performance.now();
  const { geo, program, params } = prepareRun(document, settings, seed);
  const inputs = buildSkeletonInputs({ geo, program, params, settings });
  const planned = performance.now();
  const result = planSkeleton(inputs, settings, seed);
  return { inputs, result, inputsMs: planned - started, planMs: performance.now() - planned };
}

const fmt = (p: Point) => `${p[0].toFixed(1)},${(-p[1]).toFixed(1)}`;
const ring = (points: Point[]) => `M${points.map(fmt).join("L")}Z`;
const line = (points: Point[]) => `M${points.map(fmt).join("L")}`;
const escapeXml = (text: string) => text.replace(/[<&>]/g, c => ({ "<": "&lt;", "&": "&amp;", ">": "&gt;" })[c]!);

/** Standalone SVG of the skeleton (north up). A rejected request shows its last draw, or only its inputs. */
export function skeletonSvg(run: SkeletonLabRun, title: string): string {
  const { inputs, result } = run;
  const h = inputs.half;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-h} ${-h} ${2 * h} ${2 * h}" width="720" height="720">`,
    `<rect x="${-h}" y="${-h}" width="${2 * h}" height="${2 * h}" fill="#f4efe4"/>`
  ];
  const skeleton = result.skeleton ?? result.rejected;
  if (skeleton)
    parts.push(`<path d="${ring(skeleton.core.urban)}" fill="#e6d7bd" stroke="#c8b48f" stroke-dasharray="6 4"/>`);
  for (const area of inputs.water) parts.push(`<path d="${ring(area.polygon)}" fill="#9cc3dc" stroke="none"/>`);
  for (const river of inputs.rivers)
    parts.push(
      `<path d="${line(river.centerline)}" fill="none" stroke="#6fa3c8" stroke-width="${river.halfWidth * 2}" stroke-linejoin="round"/>`
    );
  if (skeleton) {
    for (const route of skeleton.routes.filter(r => !r.dropped))
      parts.push(
        `<path d="${line(route.path)}" fill="none" stroke="#8a6d3b" stroke-width="${inputs.cellSize * 0.12}"/>`
      );
    if (skeleton.wall) {
      parts.push(
        `<path d="${ring(skeleton.wall.polygon)}" fill="none" stroke="#3b3128" stroke-width="${inputs.wallWidth}" stroke-linejoin="miter"/>`
      );
      for (const gate of skeleton.wall.waterGates)
        parts.push(`<circle cx="${gate.point[0]}" cy="${-gate.point[1]}" r="${inputs.wallWidth}" fill="#2f6f9f"/>`);
    }
    for (const gate of skeleton.gates)
      parts.push(`<circle cx="${gate.point[0]}" cy="${-gate.point[1]}" r="${inputs.wallWidth * 1.3}" fill="#c0392b"/>`);
    for (const bridge of skeleton.bridges)
      parts.push(
        `<rect x="${bridge.point[0] - 3}" y="${-bridge.point[1] - 3}" width="6" height="6" fill="${bridge.skewDegrees > inputs.bridgeSkewLimit ? "#e00" : "#222"}"/>`
      );
  }
  if (!skeleton) {
    for (const road of inputs.roads)
      parts.push(
        `<path d="${line(road.path)}" fill="none" stroke="#8a6d3b" stroke-width="${inputs.cellSize * 0.12}"/>`
      );
  }
  const caption = result.skeleton
    ? `${title} · ${result.skeleton.wall?.shape ?? "unwalled"} · draw ${result.skeleton.attempt + 1}`
    : `${title} · rejected: ${result.failures.at(-1)?.reason ?? "?"}${result.rejected ? " (last draw shown)" : ""}`;
  parts.push(
    `<text x="${-h + 8}" y="${-h + 24}" font-family="sans-serif" font-size="${h / 22}" fill="#222">${escapeXml(caption)}</text>`,
    "</svg>"
  );
  return parts.join("\n");
}
