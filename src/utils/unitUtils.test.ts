import { afterEach, describe, expect, it } from "vitest";
import { useOptionsState } from "../store/optionsState";
import { DEFAULT_CURRENCY_RATES } from "./currency";
import {
  formatAnnualPrecipitation,
  formatCoinage,
  formatPrice,
  precipitationProxyToMillimeters,
  toCoinage
} from "./unitUtils";

const DEFAULT_GOLD_TO_SILVER_RATE = DEFAULT_CURRENCY_RATES.goldToSilverRate;
const DEFAULT_SILVER_TO_COPPER_RATE = DEFAULT_CURRENCY_RATES.silverToCopperRate;

afterEach(() => {
  useOptionsState.setState({
    goldToSilverRate: DEFAULT_GOLD_TO_SILVER_RATE,
    silverToCopperRate: DEFAULT_SILVER_TO_COPPER_RATE
  });
});

describe("toCoinage", () => {
  it("converts silver-piece amounts into the default denominations", () => {
    expect(toCoinage(0)).toEqual({ gold: 0, silver: 0, copper: 0 });
    expect(toCoinage(0.5)).toEqual({ gold: 0, silver: 0, copper: 6 });
    expect(toCoinage(1)).toEqual({ gold: 0, silver: 1, copper: 0 });
    expect(toCoinage(12)).toEqual({ gold: 1, silver: 0, copper: 0 });
    expect(toCoinage(13.5)).toEqual({ gold: 1, silver: 1, copper: 6 });
  });

  it("rounds fractional copper and safely handles invalid amounts", () => {
    expect(toCoinage(0.04)).toEqual({ gold: 0, silver: 0, copper: 0 });
    expect(toCoinage(0.05)).toEqual({ gold: 0, silver: 0, copper: 1 });
    expect(toCoinage(-1)).toEqual({ gold: 0, silver: 0, copper: 0 });
    expect(toCoinage(Number.NaN)).toEqual({ gold: 0, silver: 0, copper: 0 });
  });

  it("uses supplied exchange rates and falls back from invalid rates", () => {
    expect(toCoinage(21, { goldToSilverRate: 20, silverToCopperRate: 10 })).toEqual({
      gold: 1,
      silver: 1,
      copper: 0
    });
    expect(toCoinage(12, { goldToSilverRate: 0, silverToCopperRate: 1 })).toEqual({
      gold: 1,
      silver: 0,
      copper: 0
    });
  });
});

describe("formatCoinage", () => {
  it("omits zero denominations while retaining a zero silver amount", () => {
    expect(formatCoinage(0)).toBe("⚪0");
    expect(formatCoinage(1)).toBe("⚪1");
    expect(formatCoinage(0.5)).toBe("⚪0 🟤6");
    expect(formatCoinage(13.5)).toBe("🟡1 ⚪1 🟤6");
  });

  it("uses the live Options rate settings through formatPrice", () => {
    useOptionsState.setState({ goldToSilverRate: 10, silverToCopperRate: 5 });
    expect(formatPrice(12.4)).toBe("🟡1 ⚪2 🟤2");
  });
});

describe("annual precipitation display", () => {
  it("uses the shared proxy-to-millimetre calibration", () => {
    expect(precipitationProxyToMillimeters(56)).toBe(5600);
    expect(formatAnnualPrecipitation(56)).toBe("5600 mm");
    expect(formatAnnualPrecipitation(12.345, 1)).toBe("1234.5 mm");
  });
});
