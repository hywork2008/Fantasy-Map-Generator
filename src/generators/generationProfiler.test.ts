import { afterEach, describe, expect, it, vi } from "vitest";
import { measureGenerationStep } from "./generationProfiler";

describe("generationProfiler", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports a timer around the wrapped generation step", () => {
    const timeSpy = vi.spyOn(console, "time").mockImplementation(() => {});
    const timeEndSpy = vi.spyOn(console, "timeEnd").mockImplementation(() => {});

    expect(measureGenerationStep("generateEconomy", () => 42)).toBe(42);
    expect(timeSpy).toHaveBeenCalledWith("generateEconomy");
    expect(timeEndSpy).toHaveBeenCalledWith("generateEconomy");
  });

  it("ends the timer when the generation step throws", () => {
    const timeEndSpy = vi.spyOn(console, "timeEnd").mockImplementation(() => {});

    expect(() =>
      measureGenerationStep("generateEconomy", () => {
        throw new Error("generation failed");
      })
    ).toThrow("generation failed");
    expect(timeEndSpy).toHaveBeenCalledWith("generateEconomy");
  });
});
