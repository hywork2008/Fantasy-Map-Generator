import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { catalogueMassing } from "../city3d/core/catalogueMassing";
import { concatPositions, meshIsClosed } from "../city3d/core/massingGeometry";
import { structureSurfaces } from "../city3d/core/structureGeometry";
import { contentDigest } from "./canonicalJson";
import { coarseSolids } from "./coarseSolids";
import { committedSvgHash, levelPlanSvg, planSvg } from "./planSvg";
import { TRIANGLE_BUDGET } from "./record";
import { validateBuildingRecord } from "./validate";

const directory = path.dirname(fileURLToPath(import.meta.url));

function planArea(positions: Float32Array, yMin: number): number {
  let area = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const y0 = positions[i + 1];
    const y1 = positions[i + 4];
    const y2 = positions[i + 7];
    if (y0 < yMin || y1 < yMin || y2 < yMin) continue;
    const ax = positions[i];
    const ay = -positions[i + 2];
    const bx = positions[i + 3];
    const by = -positions[i + 5];
    const cx = positions[i + 6];
    const cy = -positions[i + 8];
    area += Math.abs((ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)) / 2);
  }
  return area;
}

function covers(positions: Float32Array, yMin: number, x: number, z: number): boolean {
  for (let i = 0; i < positions.length; i += 9) {
    if (positions[i + 1] < yMin || positions[i + 4] < yMin || positions[i + 7] < yMin) continue;
    const ax = positions[i];
    const az = positions[i + 2];
    const bx = positions[i + 3];
    const bz = positions[i + 5];
    const cx = positions[i + 6];
    const cz = positions[i + 8];
    const c1 = (bx - ax) * (z - az) - (bz - az) * (x - ax);
    const c2 = (cx - bx) * (z - bz) - (cz - bz) * (x - bx);
    const c3 = (ax - cx) * (z - cz) - (az - cz) * (x - cx);
    if ((c1 >= -1e-6 && c2 >= -1e-6 && c3 >= -1e-6) || (c1 <= 1e-6 && c2 <= 1e-6 && c3 <= 1e-6)) return true;
  }
  return false;
}

describe("langeais keep", () => {
  it("keeps the published shell, an open cap, and a matching plan", () => {
    const recordPath = path.join(directory, "catalogue/langeais-keep.json");
    const planPath = path.join(directory, "plans/langeais-keep.svg");
    const result = validateBuildingRecord(JSON.parse(fs.readFileSync(recordPath, "utf8")));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const record = result.record;
    expect(record.period).toBe("earlyMedieval");
    expect(record.planFamily).toBe("rectangular-keep");
    expect(record.occupancyMeters).toEqual({ width: 17.5, depth: 10 });
    expect(record.provenance.planClass).toBe("well-published-survey");
    expect(record.provenance.omitted.length).toBeGreaterThan(0);
    expect(record.contentHash).toBe(contentDigest(record));

    const wall = record.levels[0].walls[0];
    const hole = wall.holes[0];
    expect(wall.thicknessMeters).toBe(1.5);
    expect(Math.min(...hole.map(point => point[0]))).toBe(-7.25);
    expect(Math.max(...hole.map(point => point[0]))).toBe(7.25);
    expect(Math.min(...hole.map(point => point[1]))).toBe(-3.5);
    expect(Math.max(...hole.map(point => point[1]))).toBe(3.5);

    const solids = coarseSolids(record);
    expect(solids).toHaveLength(1);
    expect(solids[0].heightMeters).toBe(16);
    expect(solids[0].holes).toHaveLength(1);

    const svg = planSvg(record);
    const box = /viewBox="([^"]+)"/.exec(svg)?.[1].split(" ").map(Number) ?? [];
    expect(box).toEqual([-8.75, -5, 17.5, 10]);
    expect(svg).toContain("M-8.75 5 ");
    expect(svg).toContain("M-7.25 3.5 ");
    expect(committedSvgHash(svg)).toBe(record.contentHash);
    expect(fs.readFileSync(planPath, "utf8")).toBe(`${svg}\n`);
    expect(levelPlanSvg(record, "ground")).toContain("M-0.625 5");
    expect(levelPlanSvg(record, "upper")).not.toContain("M-0.625 5");

    const surfaces = structureSurfaces(catalogueMassing(record)[0]);
    expect(surfaces).not.toBeNull();
    const positions = concatPositions(surfaces!.walls, surfaces!.roofs);
    expect(meshIsClosed(positions)).toBe(true);
    expect(positions.length / 9).toBeLessThanOrEqual(TRIANGLE_BUDGET);
    expect(planArea(positions, 15.9)).toBeCloseTo(73.5, 0);
    expect(covers(positions, 15.9, 0, 0)).toBe(false);
  });
});
