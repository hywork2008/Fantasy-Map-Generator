import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTickProfile, logTickProfile, measureTickStep, resetTickProfile } from "./tickProfiler";

// TIME is off by default (see utils/debug.ts) so timing overhead doesn't dominate a long SVG
// advance in normal play — force it on here so measureTickStep actually records instead of
// short-circuiting to a no-op.
vi.mock("../utils/debug", async importOriginal => {
  const actual = await importOriginal<typeof import("../utils/debug")>();
  return { ...actual, TIME: true };
});

/**
 * Feeds a fixed sequence of elapsed-ms values to successive measureTickStep() calls,
 * independent of how fast the test actually runs. Each measureTickStep() call reads
 * performance.now() twice (start, end), so each entry queues a (0, elapsed) pair —
 * the actual start value doesn't matter, only the per-call difference does.
 */
function mockElapsedMs(...elapsedMsSequence: number[]): void {
  const nowSpy = vi.spyOn(performance, "now");
  for (const elapsed of elapsedMsSequence) {
    nowSpy.mockImplementationOnce(() => 0).mockImplementationOnce(() => elapsed);
  }
}

describe("tickProfiler", () => {
  beforeEach(() => {
    resetTickProfile();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the wrapped function's result unchanged", () => {
    expect(measureTickStep("step", () => 42)).toBe(42);
  });

  it("accumulates calls/totalMs/lastMs/maxMs across repeated calls to the same label", () => {
    mockElapsedMs(10, 30);

    measureTickStep("core:demographics", () => {});
    measureTickStep("core:demographics", () => {});

    const [entry] = getTickProfile();
    expect(entry).toMatchObject({ label: "core:demographics", calls: 2, totalMs: 40, lastMs: 30, maxMs: 30 });
  });

  it("keeps separate entries per label", () => {
    mockElapsedMs(5, 15);

    measureTickStep("hook:economy", () => {});
    measureTickStep("hook:shipbuilding", () => {});

    const labels = getTickProfile().map(e => e.label);
    expect(labels).toEqual(expect.arrayContaining(["hook:economy", "hook:shipbuilding"]));
    expect(getTickProfile()).toHaveLength(2);
  });

  it("sorts getTickProfile() by totalMs descending", () => {
    mockElapsedMs(5, 50, 15);

    measureTickStep("cheap", () => {});
    measureTickStep("expensive", () => {});
    measureTickStep("medium", () => {});

    expect(getTickProfile().map(e => e.label)).toEqual(["expensive", "medium", "cheap"]);
  });

  it("resetTickProfile() clears all accumulated entries", () => {
    mockElapsedMs(10);
    measureTickStep("core:manpower", () => {});
    expect(getTickProfile()).toHaveLength(1);

    resetTickProfile();

    expect(getTickProfile()).toEqual([]);
  });

  it("logTickProfile() does not print when DEBUG.tickProfiler is off (the default)", () => {
    mockElapsedMs(10);
    measureTickStep("core:manpower", () => {});
    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => {});

    logTickProfile();

    expect(tableSpy).not.toHaveBeenCalled();
  });
});
