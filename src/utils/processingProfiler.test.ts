import { describe, expect, it } from "vitest";
import { measureProcessing, ProcessingProfiler } from "./processingProfiler";

describe("processing profiler", () => {
  it("accounts for nested work once and aggregates repeated calls", () => {
    let time = 0;
    const profiler = new ProcessingProfiler(() => time);
    const result = profiler.measure("root", () => {
      time += 2;
      for (let i = 0; i < 2; i++)
        profiler.measure("child", () => {
          time += 3;
        });
      time += 1;
      return 42;
    });
    expect(result).toBe(42);
    expect(profiler.snapshot()).toEqual([
      { path: "root", parent: null, depth: 0, calls: 1, elapsedMs: 9, selfMs: 3 },
      { path: "root/child", parent: "root", depth: 1, calls: 2, elapsedMs: 6, selfMs: 6 }
    ]);
    const copy = profiler.snapshot();
    copy[0].selfMs = 999;
    expect(profiler.snapshot()[0].selfMs).toBe(3);
  });
  it("keeps failing work and restores nesting after exceptions", () => {
    let time = 0;
    const profiler = new ProcessingProfiler(() => time);
    expect(() =>
      profiler.measure("root", () =>
        profiler.measure("failed", () => {
          time += 4;
          throw new Error("failure");
        })
      )
    ).toThrow("failure");
    profiler.measure("next", () => {
      time += 2;
    });
    expect(profiler.snapshot().find(t => t.path === "root/failed")).toMatchObject({ elapsedMs: 4, selfMs: 4 });
    expect(profiler.snapshot().find(t => t.path === "root")).toMatchObject({ elapsedMs: 4, selfMs: 0 });
    expect(profiler.snapshot().find(t => t.path === "next")).toMatchObject({ parent: null, elapsedMs: 2 });
    expect(measureProcessing(undefined, "disabled", () => 17)).toBe(17);
  });
});
