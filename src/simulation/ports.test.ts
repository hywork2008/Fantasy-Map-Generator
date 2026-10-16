import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMemorySettings,
  installSimulationScheduler,
  installSimulationSettings,
  simulationSettings,
  yieldToHost
} from "./ports";

afterEach(() => {
  installSimulationSettings(null);
  installSimulationScheduler(null);
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("simulationSettings", () => {
  it("uses the browser storage by default, read at call time", () => {
    simulationSettings.setItem("fmg-grade-effect-strength", "0.5");
    expect(localStorage.getItem("fmg-grade-effect-strength")).toBe("0.5");
    localStorage.setItem("caravan-movement", "{}");
    expect(simulationSettings.getItem("caravan-movement")).toBe("{}");
  });

  it("routes to an installed source (e.g. a headless runner's JSON settings)", () => {
    installSimulationSettings(createMemorySettings({ "fmg-merchant-route-preference": "preferSafety" }));
    expect(simulationSettings.getItem("fmg-merchant-route-preference")).toBe("preferSafety");
    simulationSettings.setItem("x", "1");
    expect(localStorage.getItem("x")).toBeNull();
    simulationSettings.removeItem("fmg-merchant-route-preference");
    expect(simulationSettings.getItem("fmg-merchant-route-preference")).toBeNull();
  });

  it("falls back to memory where no browser storage exists", () => {
    vi.stubGlobal("localStorage", undefined);
    simulationSettings.setItem("k", "v");
    expect(simulationSettings.getItem("k")).toBe("v");
  });
});

describe("yieldToHost", () => {
  it("prefers an installed scheduler", async () => {
    const scheduler = vi.fn(() => Promise.resolve());
    installSimulationScheduler(scheduler);
    await yieldToHost();
    expect(scheduler).toHaveBeenCalledTimes(1);
  });

  it("resolves without requestAnimationFrame", async () => {
    vi.stubGlobal("requestAnimationFrame", undefined);
    await expect(yieldToHost()).resolves.toBeUndefined();
  });
});
