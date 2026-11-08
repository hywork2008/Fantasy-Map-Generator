import { expect, it } from "vitest";
import { syntheticVectorInput } from "./vector/generation/input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./vector/generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./vector/generation/urban";

it("keeps skeleton geometry identical with consecutive timing enabled", () => {
  const input = syntheticVectorInput("stage-timing", 30, false);
  const settings = { ...DEFAULT_VECTOR_GENERATION, branches: 2 };
  const spans: { phase: string; ms: number }[] = [];
  const baseline = generateVectorSkeleton(input, settings);
  const measured = generateVectorSkeleton(input, settings, (phase, ms) => spans.push({ phase, ms }));
  expect(measured).toEqual(baseline);
  expect(spans.map(s => s.phase)).toEqual(expect.arrayContaining(["road-search", "road-materialization"]));
  expect(spans.every(s => s.ms >= 0)).toBe(true);
});
it("keeps housing, population and ownership identical with timing enabled", () => {
  const input = generateVectorSkeleton(syntheticVectorInput("stage-timing", 30, false), {
    ...DEFAULT_VECTOR_GENERATION,
    branches: 2
  }).document;
  const settings = { ...DEFAULT_VECTOR_URBAN, population: 10, maxLanes: 0 };
  const spans: { phase: string; ms: number }[] = [];
  const baseline = generateVectorUrban(input, settings);
  const measured = generateVectorUrban(input, settings, undefined, {
    timings: (phase, ms) => spans.push({ phase, ms })
  });
  expect(measured).toEqual(baseline);
  expect(spans.map(s => s.phase)).toContain("final-validation");
  expect(spans.at(-1)?.phase).toBe("save-budget-check");
  expect(spans.every(s => s.ms >= 0)).toBe(true);
});
