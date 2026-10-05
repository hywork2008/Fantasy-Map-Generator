import { describe, expect, it } from "vitest";
import { DEFAULT_REGION_SETTINGS } from "../types";
import { generateStandaloneRegion } from "./pipeline";

describe("generateStandaloneRegion", () => {
  it("指定シードから完全な RegionDocument を生成できること", () => {
    const doc = generateStandaloneRegion(DEFAULT_REGION_SETTINGS);

    expect(doc.format).toBe("fmg-region-editor");
    expect(doc.version).toBe(1);
    expect(doc.title).toBe(DEFAULT_REGION_SETTINGS.title);
    expect(doc.symbols.length).toBeGreaterThan(0);
    expect(doc.rivers.length).toBeGreaterThan(0);
    expect(doc.settlements.length).toBeGreaterThan(0);

    // 直角橋が正しく生成されていること
    expect(doc.bridges.length).toBeGreaterThan(0);
    for (const bridge of doc.bridges) {
      expect(Math.abs(bridge.angleDeg)).toBeGreaterThanOrEqual(0);
      expect(bridge.lengthMeters).toBeGreaterThan(0);
    }

    // シンボルが Y 座標昇順（北から南）にソートされていること
    for (let i = 0; i < doc.symbols.length - 1; i++) {
      expect(doc.symbols[i].y).toBeLessThanOrEqual(doc.symbols[i + 1].y);
    }
  });

  it("同一シードから常に同一のシンボル数・集落が決定論的に再現されること", () => {
    const docA = generateStandaloneRegion({ ...DEFAULT_REGION_SETTINGS, seed: "test-re-123" });
    const docB = generateStandaloneRegion({ ...DEFAULT_REGION_SETTINGS, seed: "test-re-123" });

    expect(docA.symbols.length).toBe(docB.symbols.length);
    expect(docA.rivers.length).toBe(docB.rivers.length);
    expect(docA.settlements).toEqual(docB.settlements);
    expect(docA.bridges.length).toBe(docB.bridges.length);
  });
});
