import { expect, it } from "vitest";
import { resolveModelQuality } from "./modelQuality";

it("falls back to the next lower tier, then to the lowest available", () => {
  const lowHigh = ["low", "high"] as const;
  expect(resolveModelQuality("high", lowHigh)).toBe("high");
  expect(resolveModelQuality("standard", lowHigh)).toBe("low");
  expect(resolveModelQuality("low", lowHigh)).toBe("low");
  expect(resolveModelQuality("high", ["low"] as const)).toBe("low");
  expect(resolveModelQuality("low", ["standard", "high"] as const)).toBe("standard");
});
