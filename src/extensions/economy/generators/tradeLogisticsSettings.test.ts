import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_TRADE_LOGISTICS_SETTINGS, TradeLogisticsSettings } from "./tradeLogisticsSettings";

describe("TradeLogisticsSettings", () => {
  afterEach(() => {
    TradeLogisticsSettings.reset();
    localStorage.removeItem("fmg-trade-logistics-settings");
  });

  it("starts from defaults and clamps utilization", () => {
    TradeLogisticsSettings.reset();
    expect(TradeLogisticsSettings.getOptions().targetUtilization).toBe(
      DEFAULT_TRADE_LOGISTICS_SETTINGS.targetUtilization
    );
    TradeLogisticsSettings.configure({ targetUtilization: 2, minSailUtilization: 0.9 });
    const options = TradeLogisticsSettings.getOptions();
    expect(options.targetUtilization).toBe(1);
    // min is forced ≤ target
    expect(options.minSailUtilization).toBeLessThanOrEqual(options.targetUtilization);
  });

  it("normalizes sail days and persists configure", () => {
    TradeLogisticsSettings.configure({ sailDays: [20, 1, 1, 40, 10] });
    expect(TradeLogisticsSettings.getOptions().sailDays).toEqual([1, 10, 20]);
    // re-load via reset+configure path: values should still be in localStorage after configure
    const stored = localStorage.getItem("fmg-trade-logistics-settings");
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!).sailDays).toEqual([1, 10, 20]);
  });
});
