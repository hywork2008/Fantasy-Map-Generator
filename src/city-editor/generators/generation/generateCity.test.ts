import { afterEach, describe, expect, it, vi } from "vitest";
import { createGridDocument } from "../../core/document";
import { clone } from "../../core/mesh";
import { COMPLETE_CITY_ATTEMPTS, generateCityAttempt, generateCityOnDocument } from "./generateCity";
import * as preparation from "./prepareRun";
import { defaultGenerationSettings } from "./settings";

const injected = vi.hoisted(() => ({ rejectFinished: false, finishedAttempts: 0 }));
vi.mock("../../core/passages", async importOriginal => {
  const actual = await importOriginal<typeof import("../../core/passages")>();
  return {
    ...actual,
    explainGeneratedCrossingFailures: (...args: Parameters<typeof actual.explainGeneratedCrossingFailures>) => {
      if (!injected.rejectFinished) return actual.explainGeneratedCrossingFailures(...args);
      injected.finishedAttempts++;
      // A late failure must discard this already assembled and finished candidate.
      args[0].generationSeed = "rejected-candidate-marker";
      return ["injected late rejection"];
    }
  };
});
afterEach(() => {
  injected.rejectFinished = false;
  injected.finishedAttempts = 0;
  vi.restoreAllMocks();
});

describe("attempt document ownership", () => {
  it("starts every retry from the input and cannot contaminate a later accepted attempt", () => {
    const source = createGridDocument({ size: "tiny", grid: "evolution", seed: "ce-audit-20261002-mesh" });
    const settings = defaultGenerationSettings();
    const seed = "ce-audit-20261002:0";
    const before = clone(source);
    const expected = generateCityAttempt(source, settings, seed);
    expect(expected).not.toBeNull();
    const originalPrepare = preparation.prepareRun;
    const inputs: string[] = [];
    vi.spyOn(preparation, "prepareRun").mockImplementation((...args) => {
      inputs.push(JSON.stringify(args[0]));
      return originalPrepare(...args);
    });
    injected.rejectFinished = true;
    expect(generateCityOnDocument(source, settings, seed, () => {})).toBeNull();
    expect(inputs).toHaveLength(COMPLETE_CITY_ATTEMPTS);
    expect(inputs.every(input => input === JSON.stringify(before))).toBe(true);
    expect(injected.finishedAttempts).toBeGreaterThanOrEqual(2);
    expect(source).toEqual(before);
    injected.rejectFinished = false;
    expect(generateCityAttempt(source, settings, seed)).toEqual(expected);
    expect(source).toEqual(before);
  });
});
