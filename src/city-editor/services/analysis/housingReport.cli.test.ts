import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareArchiveHousing } from "./housingReport";

const archive = process.env.HOUSING_ARCHIVE;
const out = process.env.HOUSING_OUT;
const tokens = process.env.HOUSING_BURGS ? (JSON.parse(process.env.HOUSING_BURGS) as string[]) : [];

describe.skipIf(!archive || !out)("housing report cli", () => {
  it("writes the comparison JSON for the requested burgs", async () => {
    const report = await compareArchiveHousing(archive!, tokens);
    writeFileSync(out!, `${JSON.stringify(report, null, 2)}\n`);
    expect(report.rows.length).toBeGreaterThan(0);
  }, 300_000);
});
