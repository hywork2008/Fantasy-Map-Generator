import { expect, it } from "vitest";
import { RuralFieldProfiler, ruralRenderProfiler, withRuralRenderProfiler } from "./ruralFieldProfiler";

it("reports nested inclusive time, self time and call counts without double counting", () => {
  let now = 0;
  const p = new RuralFieldProfiler(() => now);
  const stages = p.stages("generation");
  stages.next("layout");
  now += 2;
  const operation = p.wrap("check", () => {
    now += 3;
  });
  operation();
  operation();
  now += 1;
  stages.next("assemble");
  now += 4;
  stages.end();
  const timings = p.snapshot();
  expect(timings.find(t => t.path === "generation/layout")).toMatchObject({ elapsedMs: 9, selfMs: 3, calls: 1 });
  expect(timings.find(t => t.path === "generation/layout/check")).toMatchObject({ elapsedMs: 6, selfMs: 6, calls: 2 });
  expect(timings.find(t => t.path === "generation/assemble")).toMatchObject({ elapsedMs: 4, selfMs: 4 });
});

it("restores opt-in render instrumentation when a render throws", () => {
  const document = {};
  const p = new RuralFieldProfiler();
  expect(ruralRenderProfiler(document)).toBeUndefined();
  expect(() =>
    withRuralRenderProfiler(document, p, () => {
      expect(ruralRenderProfiler(document)).toBe(p);
      throw new Error("render");
    })
  ).toThrow("render");
  expect(ruralRenderProfiler(document)).toBeUndefined();
});
