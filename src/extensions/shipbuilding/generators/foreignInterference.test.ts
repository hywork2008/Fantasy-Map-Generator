import { afterEach, describe, expect, it, vi } from "vitest";
import type { Burg } from "../../hostTypes";
import { checkForeignInterference } from "./foreignInterference";
import type { ShipyardCandidate } from "./shipyardCandidates";

function makeBurgs(overrides: Partial<Burg>[]): Burg[] {
  const burgs: Burg[] = [{} as Burg];
  for (const o of overrides) burgs.push({ x: 0, y: 0, cell: 0, ...o } as Burg);
  return burgs;
}

describe("checkForeignInterference", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing for a non-positive deltaYears", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(Math, "random").mockReturnValue(0); // would always trigger if reached

    checkForeignInterference([{ burgId: 1, forestRatio: 0.5 }], makeBurgs([{ i: 1, name: "Testport" }]), 0);

    expect(logSpy).not.toHaveBeenCalled();
  });

  it("logs a flavor message when the roll lands below the computed chance", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(Math, "random").mockReturnValue(0); // always below any positive chance

    checkForeignInterference([{ burgId: 1, forestRatio: 0.5 }], makeBurgs([{ i: 1, name: "Testport" }]), 5);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain("Testport");
  });

  it("does not log when the roll lands above the computed chance", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(Math, "random").mockReturnValue(0.999999); // above any realistic chance

    checkForeignInterference([{ burgId: 1, forestRatio: 0.5 }], makeBurgs([{ i: 1, name: "Testport" }]), 5);

    expect(logSpy).not.toHaveBeenCalled();
  });

  it("skips removed or missing burgs without throwing", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(Math, "random").mockReturnValue(0);

    const burgs = makeBurgs([{ i: 1, removed: true }]);
    const candidates: ShipyardCandidate[] = [
      { burgId: 1, forestRatio: 0.5 },
      { burgId: 99, forestRatio: 0.5 } // no such burg
    ];

    expect(() => checkForeignInterference(candidates, burgs, 5)).not.toThrow();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("falls back to a burg-id label when the burg has no name", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(Math, "random").mockReturnValue(0);

    checkForeignInterference([{ burgId: 1, forestRatio: 0.5 }], makeBurgs([{ i: 1 }]), 5);

    expect(logSpy.mock.calls[0][0]).toContain("burg #1");
  });
});
