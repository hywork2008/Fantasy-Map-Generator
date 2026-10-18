import { afterEach, describe, expect, it } from "vitest";
import { simulationContext } from "../context/simulationContext";
import { CaravanMovement } from "../extensions/economy/generators/caravanMovement";
import { TradeLogisticsSettings } from "../extensions/economy/generators/tradeLogisticsSettings";
import { getMilitaryGradeEffectStrength } from "../generators/regimentMovement";
import { materializeWorldSettings, resetWorldSettingsFromHost, worldSettings } from "./worldSettings";

afterEach(() => {
  delete simulationContext.worldSettings;
  localStorage.clear();
});

describe("world-scoped simulation settings", () => {
  it("falls back to the browser only for a world saved before the field existed", () => {
    localStorage.setItem("fmg-grade-effect-strength", "0.4");
    expect(worldSettings.getItem("fmg-grade-effect-strength")).toBe("0.4");

    simulationContext.worldSettings = {};
    // A world with its own settings never consults the browser: missing means the code default.
    expect(worldSettings.getItem("fmg-grade-effect-strength")).toBeNull();
    expect(getMilitaryGradeEffectStrength()).toBe(1);
  });

  it("adopts the browser values once, then keeps them when the browser changes", () => {
    localStorage.setItem("fmg-merchant-route-preference", "avoidHardPass");
    materializeWorldSettings();
    localStorage.setItem("fmg-merchant-route-preference", "preferSpeed");
    expect(worldSettings.getItem("fmg-merchant-route-preference")).toBe("avoidHardPass");
    expect(CaravanMovement.getOptions().merchantRoutePreference).toBe("avoidHardPass");
  });

  it("writes to the world and remembers the value as the browser default for new maps", () => {
    simulationContext.worldSettings = {};
    CaravanMovement.configure({ gradeEffectStrength: 0.25 });
    expect(simulationContext.worldSettings["fmg-grade-effect-strength"]).toBe("0.25");
    expect(localStorage.getItem("fmg-grade-effect-strength")).toBe("0.25");
    expect(getMilitaryGradeEffectStrength()).toBe(0.25);

    resetWorldSettingsFromHost();
    expect(simulationContext.worldSettings["fmg-grade-effect-strength"]).toBe("0.25");
  });

  it("re-reads cached module settings when another world is loaded", () => {
    simulationContext.worldSettings = {
      "fmg-trade-logistics-settings": JSON.stringify({ maxWaitDaysLand: 5 }),
      "caravan-movement": JSON.stringify({ landKmPerDay: 20, settingsVersion: 2 })
    };
    expect(TradeLogisticsSettings.getOptions().maxWaitDaysLand).toBe(5);
    expect(CaravanMovement.getOptions().landKmPerDay).toBe(20);

    simulationContext.worldSettings = {
      "fmg-trade-logistics-settings": JSON.stringify({ maxWaitDaysLand: 9 }),
      "caravan-movement": JSON.stringify({ landKmPerDay: 44, settingsVersion: 2 })
    };
    expect(TradeLogisticsSettings.getOptions().maxWaitDaysLand).toBe(9);
    expect(CaravanMovement.getOptions().landKmPerDay).toBe(44);
  });

  it("turns new behaviour on for new worlds only, unless the host says otherwise", () => {
    resetWorldSettingsFromHost();
    expect(worldSettings.getItem("fmg-luxury-value-demand")).toBe("on");

    localStorage.setItem("fmg-luxury-value-demand", "off");
    resetWorldSettingsFromHost();
    expect(worldSettings.getItem("fmg-luxury-value-demand")).toBe("off");

    // A world saved before the key existed keeps running without it.
    localStorage.clear();
    simulationContext.worldSettings = {};
    expect(worldSettings.getItem("fmg-luxury-value-demand")).toBeNull();
    delete simulationContext.worldSettings;
    materializeWorldSettings();
    expect(worldSettings.getItem("fmg-luxury-value-demand")).toBeNull();
  });
});
