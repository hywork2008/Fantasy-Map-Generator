import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contentDigest } from "./canonicalJson";
import { committedSvgHash, levelPlanSvg, planSvg } from "./planSvg";
import type { BuildingRecord } from "./record";
import { validateBuildingRecord } from "./validate";

const directory = path.dirname(fileURLToPath(import.meta.url));
const recordPath = path.join(directory, "catalogue/fixture-courtyard-keep.json");
const planPath = path.join(directory, "plans/fixture-courtyard-keep.svg");

function fixture(): BuildingRecord {
  const result = validateBuildingRecord(JSON.parse(fs.readFileSync(recordPath, "utf8")));
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.record;
}

describe("plan svg", () => {
  it("matches occupancy, keeps the courtyard, and flips y", () => {
    const record = fixture();
    const svg = planSvg(record);
    const box = /viewBox="([^"]+)"/.exec(svg)?.[1].split(" ").map(Number) ?? [];
    expect(box.slice(2)).toEqual([record.occupancyMeters.width, record.occupancyMeters.depth]);
    expect(svg).toContain('d="M-5 5 ');
    expect(svg).toContain("M-2 2 ");
    expect(committedSvgHash(svg)).toBe(contentDigest(record));
    expect(fs.readFileSync(planPath, "utf8")).toBe(`${svg}\n`);
    expect(levelPlanSvg(record, "ground")).toContain("M-1 5");
    expect(levelPlanSvg(record, "upper")).not.toContain("M-1 5");
  });
});
