import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { catalogueMassing } from "../city3d/core/catalogueMassing";
import { concatPositions, meshIsClosed } from "../city3d/core/massingGeometry";
import { structureSurfaces } from "../city3d/core/structureGeometry";
import { contentDigest } from "./canonicalJson";
import { coarseSolids } from "./coarseSolids";
import { pointInRing, ringArea } from "./geometry";
import { committedSvgHash, levelPlanSvg, planSvg } from "./planSvg";
import { type Point, TRIANGLE_BUDGET } from "./record";
import { validateBuildingRecord } from "./validate";

const directory = path.dirname(fileURLToPath(import.meta.url));

describe("basilica temple", () => {
  it("loads a matching plan and closed masses for the nave, towers and rounded east end", () => {
    const recordPath = path.join(directory, "catalogue/basilica-temple.json");
    const planPath = path.join(directory, "plans/basilica-temple.svg");
    const result = validateBuildingRecord(JSON.parse(fs.readFileSync(recordPath, "utf8")));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const record = result.record;
    expect(record.kind).toBe("temple");
    expect(fs.readFileSync(planPath, "utf8")).toBe(`${planSvg(record)}\n`);
    expect(committedSvgHash(planSvg(record))).toBe(record.contentHash);

    const structures = catalogueMassing(record);
    expect(structures.filter(part => part.id.endsWith("west-tower"))).toHaveLength(2);
    expect(structures.filter(part => part.id.startsWith("radiating-chapel-"))).toHaveLength(3);
    expect(structures.find(part => part.id === "crossing-tower")?.heightMeters).toBeGreaterThan(
      structures.find(part => part.id === "nave")!.heightMeters
    );
    let triangles = 0;
    for (const structure of structures) {
      const surfaces = structureSurfaces(structure);
      expect(surfaces, structure.id).not.toBeNull();
      const positions = concatPositions(surfaces!.walls, surfaces!.roofs);
      expect(meshIsClosed(positions), structure.id).toBe(true);
      triangles += positions.length / 9;
      if (structure.id === "nave" || structure.id === "apse") {
        let top = -Infinity;
        for (let i = 1; i < positions.length; i += 3) top = Math.max(top, positions[i]);
        expect(top).toBeCloseTo(12 + 5.6 * Math.tan((40 * Math.PI) / 180), 4);
        expect(structure.roofMaterial).toBe("tile");
      }
    }
    expect(triangles).toBeLessThanOrEqual(TRIANGLE_BUDGET);
  });
});

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

function sideLength(ring: readonly Point[]): number {
  return Math.hypot(ring[1][0] - ring[0][0], ring[1][1] - ring[0][1]);
}

describe("castel del monte", () => {
  it("builds the published octagon, eight towers, and an open court", () => {
    const recordPath = path.join(directory, "catalogue/castel-del-monte.json");
    const planPath = path.join(directory, "plans/castel-del-monte.svg");
    const result = validateBuildingRecord(JSON.parse(fs.readFileSync(recordPath, "utf8")));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const record = result.record;
    expect(record.period).toBe("highMedieval");
    expect(record.planFamily).toBe("octagonal");
    expect(record.placementStyles).toEqual(["classic", "concentric"]);
    expect(record.approachAzimuthRadians).toBe(0);
    expect(record.occupancyMeters.width).toBe(record.occupancyMeters.depth);
    expect(record.provenance.planClass).toBe("well-published-survey");
    expect(record.provenance.omitted.length).toBeGreaterThan(0);
    expect(record.contentHash).toBe(contentDigest(record));

    const body = record.levels[0].walls[0];
    const tower = record.levels[0].walls[1];
    const court = body.holes[0];
    expect(sideLength(body.outer)).toBeCloseTo(16.5, 4);
    expect(sideLength(tower.outer)).toBeCloseTo(3.1, 4);
    const flats = Math.max(...court.map(point => point[0])) - Math.min(...court.map(point => point[0]));
    expect(flats).toBeCloseTo(17.75, 4);
    const buried = tower.outer.filter((_, index) => {
      const next = tower.outer[(index + 1) % tower.outer.length];
      const mid: Point = [(tower.outer[index][0] + next[0]) / 2, (tower.outer[index][1] + next[1]) / 2];
      return pointInRing(mid, body.outer);
    });
    expect(buried).toHaveLength(2);
    const reach = Math.max(...tower.outer.map(point => Math.hypot(point[0], point[1])));
    expect(reach).toBeLessThan(28);
    expect(reach).toBeCloseTo((16.5 + 3.1) / (2 * Math.sin(Math.PI / 8)), 3);

    const solids = coarseSolids(record);
    expect(solids.filter(solid => solid.heightMeters === 25 && solid.holes.length === 1)).toHaveLength(1);
    expect(solids.filter(solid => solid.heightMeters === 26 && solid.holes.length === 0)).toHaveLength(8);

    const svg = planSvg(record);
    const box = /viewBox="([^"]+)"/.exec(svg)?.[1].split(" ").map(Number) ?? [];
    expect(box.slice(2)).toEqual([record.occupancyMeters.width, record.occupancyMeters.depth]);
    expect(committedSvgHash(svg)).toBe(record.contentHash);
    expect(fs.readFileSync(planPath, "utf8")).toBe(`${svg}\n`);
    expect(levelPlanSvg(record, "ground")).toContain("M19.917262 1");
    expect(levelPlanSvg(record, "upper")).not.toContain("M19.917262 1");

    let triangles = 0;
    const bodySolid = catalogueMassing(record).find(solid => solid.holes?.length);
    expect(bodySolid).toBeDefined();
    for (const solid of catalogueMassing(record)) {
      const surfaces = structureSurfaces(solid);
      expect(surfaces).not.toBeNull();
      const positions = concatPositions(surfaces!.walls, surfaces!.roofs);
      expect(meshIsClosed(positions)).toBe(true);
      triangles += positions.length / 9;
      if (solid.id === bodySolid?.id) {
        const courtArea = ringArea(body.outer) + ringArea(court);
        expect(planArea(positions, 24.9)).toBeCloseTo(courtArea, 0);
        expect(covers(positions, 24.9, 0, 0)).toBe(false);
      }
    }
    expect(triangles).toBeLessThanOrEqual(TRIANGLE_BUDGET);
  });
});

const batchOneAdditions = [
  { id: "loches-donjon", family: "keep-with-forebuilding", levels: 3, height: 36 },
  { id: "white-tower", family: "apsidal-keep", levels: 3, height: 27 },
  { id: "orford-keep", family: "polygonal-keep", levels: 3, height: 27 },
  { id: "beaumaris", family: "concentric", levels: 3, height: 13 },
  { id: "nunney", family: "tower-house", levels: 4, height: 16 },
  { id: "vincennes-donjon", family: "donjon-chemise", levels: 5, height: 50 }
];

function readCastle(id: string) {
  const result = validateBuildingRecord(
    JSON.parse(fs.readFileSync(path.join(directory, `catalogue/${id}.json`), "utf8"))
  );
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.record;
}

describe("remaining batch-one castles", () => {
  it.each(batchOneAdditions)("provides valid BV plans and closed massing for $id", ({ id, family, levels, height }) => {
    const record = readCastle(id);
    expect(record.planFamily).toBe(family);
    expect(record.levels).toHaveLength(levels);
    expect(record.verticalLinks).toHaveLength(levels - 1);
    expect(record.contentHash).toBe(contentDigest(record));
    expect(record.provenance.omitted.length).toBeGreaterThan(0);
    expect(record.provenance.dimensionSource).toContain("https://");
    expect(fs.readFileSync(path.join(directory, `plans/${id}.svg`), "utf8")).toBe(`${planSvg(record)}\n`);
    for (const level of record.levels) {
      const vertices = [...level.walls, ...level.plates].reduce(
        (sum, item) => sum + item.outer.length + item.holes.reduce((count, ring) => count + ring.length, 0),
        0
      );
      expect(vertices).toBeLessThanOrEqual(512);
      expect(levelPlanSvg(record, level.id)).toContain(`data-hash="${record.contentHash}"`);
    }
    const solids = coarseSolids(record);
    expect(Math.max(...solids.map(solid => solid.baseElevationMeters + solid.heightMeters))).toBe(height);
    let triangles = 0;
    for (const structure of catalogueMassing(record)) {
      const surfaces = structureSurfaces(structure);
      expect(surfaces, `${id}/${structure.id}`).not.toBeNull();
      const positions = concatPositions(surfaces!.walls, surfaces!.roofs);
      expect(meshIsClosed(positions), `${id}/${structure.id}`).toBe(true);
      triangles += positions.length / 9;
      // Every recorded interior void remains empty in its own exterior shell.
      for (const hole of structure.holes ?? []) {
        const centre = hole.reduce(
          (sum, point) => [sum[0] + point[0] / hole.length, sum[1] + point[1] / hole.length],
          [0, 0]
        );
        expect(
          covers(positions, structure.baseElevationMeters + structure.heightMeters - 0.01, centre[0], -centre[1])
        ).toBe(false);
      }
    }
    expect(triangles).toBeLessThanOrEqual(TRIANGLE_BUDGET);
  });

  it("uses the Loches B dimensions without importing the incompatible small tower", () => {
    const record = readCastle("loches-donjon");
    const solids = coarseSolids(record);
    expect(record.occupancyMeters).toEqual({ width: 15.5, depth: 32.3 });
    expect(solids.map(solid => [solid.id, solid.heightMeters]).sort()).toEqual([
      ["forebuilding", 25],
      ["keep", 36]
    ]);
    expect(record.levels[0].walls.map(wall => wall.thicknessMeters)).toEqual([3.6, 2.8]);
    expect(record.provenance.omitted.join(" ")).toContain("Dimension set A");
  });

  it("distinguishes the White Tower apse and the three Orford clasping turrets", () => {
    const white = readCastle("white-tower");
    const body = white.levels[0].walls.find(wall => wall.id === "keep")!;
    expect(body.outer.length).toBeGreaterThan(4);
    expect(white.levels[0].walls.some(wall => wall.id === "northeast-stair" && wall.outer.length === 12)).toBe(true);
    const orford = readCastle("orford-keep");
    expect(orford.levels[0].walls.filter(wall => wall.id.startsWith("clasping-turret-"))).toHaveLength(3);
    expect(orford.roofs.every(roof => roof.form === "flat")).toBe(true);
  });

  it("preserves both Beaumaris circuits and their unfinished heights", () => {
    const record = readCastle("beaumaris");
    const solids = coarseSolids(record);
    expect(solids.filter(solid => solid.id.startsWith("outer-tower-"))).toHaveLength(12);
    expect(solids.filter(solid => solid.id.startsWith("inner-tower-"))).toHaveLength(6);
    expect(solids.find(solid => solid.id === "outer-curtain")?.heightMeters).toBe(6);
    expect(solids.find(solid => solid.id === "inner-curtain")?.heightMeters).toBe(11);
    expect(solids.filter(solid => solid.kind === "gate")).toHaveLength(4);
    expect(solids.find(solid => solid.id === "inner-south-gate")?.heightMeters).toBe(11);
    const court = record.levels[0].plates[0];
    expect(court.roof).toBe("open");
    expect(ringArea(court.outer)).toBeCloseTo(3000, 3);
  });

  it("keeps Nunney's covered hall and Vincennes's towers inside its 50 m chemise", () => {
    const nunney = readCastle("nunney");
    expect(nunney.levels[0].plates[0].roof).toBe("covered");
    expect(ringArea(nunney.levels[0].plates[0].outer)).toBe(18 * 7);
    expect(nunney.roofs.filter(roof => roof.form === "cone")).toHaveLength(4);
    const vincennes = readCastle("vincennes-donjon");
    expect(vincennes.occupancyMeters).toEqual({ width: 50, depth: 50 });
    const corners = vincennes.levels[0].walls.filter(wall => wall.id.startsWith("donjon-corner-"));
    const xs = corners.flatMap(wall => wall.outer.map(point => point[0]));
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(22.8, 6);
    expect(vincennes.levels[0].walls.find(wall => wall.id === "donjon")?.thicknessMeters).toBe(3.2);
    expect(fs.existsSync(path.join(directory, "catalogue/bodiam.json"))).toBe(false);
  });
});
