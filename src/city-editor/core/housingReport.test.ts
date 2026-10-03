import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { burgIdsForTokens, compareArchiveHousing, housingGap } from "./housingReport";

const alyatland = resolve(process.cwd(), "temp/Alyatland 2026-09-28-02-26.fmg");

describe("housingGap", () => {
  it("reports how many more houses the plan drew than Dwellings requires", () => {
    expect(housingGap(10, 25)).toEqual({ housesMinusDwellings: 15, housesPerDwelling: 2.5 });
    expect(housingGap(0, 4).housesPerDwelling).toBeNull();
  });
});

describe.skipIf(!existsSync(alyatland))("archive housing comparison", () => {
  it("returns FMG dwellings and the houses City Editor draws for the named hamlets", async () => {
    const report = await compareArchiveHousing(alyatland, ["157", "207", "385", "123"]);
    expect(report.schemaVersion).toBe(1);
    expect(report.rows.map(row => row.error)).toEqual([null, null, null, null]);

    const byId = Object.fromEntries(report.rows.map(row => [row.burgId, row]));
    expect(byId[157]?.input).toMatchObject({
      dwellings: 69,
      population: 310,
      size: "micro",
      fitted: true,
      nPatches: 6
    });
    expect(byId[207]?.input).toMatchObject({ dwellings: 171, population: 767, size: "tiny", fitted: true });
    expect(byId[385]?.input).toMatchObject({ dwellings: 27, population: 118, size: "micro", fitted: true });
    expect(byId[123]?.input).toMatchObject({ dwellings: 1129, population: 5079, size: "medium", fitted: false });

    for (const row of report.rows) {
      expect(row.output?.generated, row.name ?? "").toBe(true);
      expect(row.output?.houses).toBe((row.output?.housesCore ?? 0) + (row.output?.housesOutskirts ?? 0));
      expect(row.output?.buildings).toBe((row.output?.buildingsCore ?? 0) + (row.output?.buildingsOutskirts ?? 0));
      expect(row.gap?.housesMinusDwellings).toBe((row.output?.houses ?? 0) - (row.input?.dwellings ?? 0));
      expect(row.output?.houses ?? 0).toBeGreaterThanOrEqual((row.input?.dwellings ?? 0) * 0.9);
    }
    expect(byId[385]?.output?.houses).toBeGreaterThanOrEqual(byId[385]?.input?.dwellings ?? 0);
    // Pack scan order: the earlier Crild (id 123) precedes the later one (id 385).
    expect(burgIdsForTokens(["Crild"]).map(entry => entry.burgId)).toEqual([123, 385]);
  }, 120_000);
});
