import { describe, expect, it } from "vitest";
import { accessSummary } from "../connectivity";
import { validateDocument } from "../document";
import { bounds, spacePolygon } from "../geometry";
import { DEFAULT_SETTINGS, type DungeonDocument, type GenerationSettings } from "../types";
import { generateDungeon } from "./pipeline";

function generate(settings: Partial<GenerationSettings> = {}): DungeonDocument {
  const result = generateDungeon({ ...DEFAULT_SETTINGS, ...settings });
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostics));
  return result.document;
}
describe("dungeon generation", () => {
  for (const strategy of ["caravanserai", "room-corridor"] as const) {
    it(`${strategy}: seed reproducibility and all required spaces reachable across seed fixtures`, () => {
      for (let i = 0; i < 16; i++) {
        const settings = { strategy, seed: `fixture-${i}` };
        const document = generate(settings);
        const level = document.levels[0];
        expect(generate(settings)).toEqual(document);
        expect(validateDocument(document)).toEqual([]);
        expect(accessSummary(level).reachable.size).toBe(Object.keys(level.spaces).length);
        expect(document.generation.attempt).toBeLessThan(32);
      }
    });
    it(`${strategy}: north/east/south/west entrances remain on exterior walls`, () => {
      for (const entranceSide of ["north", "east", "south", "west"] as const) {
        const document = generate({ strategy, entranceSide });
        const level = document.levels[0];
        const opening = level.openings[level.entrances[0].openingId];
        const edge = level.boundaries[opening.boundaryId];
        expect(Boolean(edge.leftSpaceId) !== Boolean(edge.rightSpaceId)).toBe(true);
        expect(validateDocument(document)).toEqual([]);
      }
    });
  }
  it("caravanserai: open courtyard and symmetric repeated rooms around a continuous ring", () => {
    const document = generate();
    const level = document.levels[0];
    const courts = Object.values(level.spaces).filter(space => space.kind === "courtyard");
    expect(courts).toHaveLength(1);
    expect(courts[0].roof).toBe("open");
    const box = bounds(spacePolygon(level, courts[0].id));
    expect([box.x1 - box.x0, box.y1 - box.y0]).toEqual([24, 30]);
    const rooms = Object.values(level.spaces).filter(space => space.kind === "room");
    const rectangles = rooms.map(space => bounds(spacePolygon(level, space.id)));
    for (const room of rectangles) {
      expect(rectangles).toContainEqual({ x0: 60 - room.x1, x1: 60 - room.x0, y0: room.y0, y1: room.y1 });
    }
    expect(rooms.length).toBeGreaterThan(20);
  });
  it("turning off decoration preserves room, boundary and door placement", () => {
    const withWell = generate();
    const withoutWell = generate({ fixtures: false });
    for (const key of ["spaces", "boundaries", "openings", "vertices"] as const)
      expect(withWell.levels[0][key]).toEqual(withoutWell.levels[0][key]);
    expect(Object.keys(withWell.levels[0].fixtures)).toHaveLength(1);
    expect(Object.keys(withoutWell.levels[0].fixtures)).toHaveLength(0);
  });
  it("centered quarter-metre input is normalized and saved with the effective settings", () => {
    const document = generate({ widthMeters: 60.25, depthMeters: 70.25 });
    expect(validateDocument(document)).toEqual([]);
    const court = Object.values(document.levels[0].spaces).find(space => space.kind === "courtyard")!;
    const box = bounds(spacePolygon(document.levels[0], court.id));
    expect(box.x1 - box.x0).toBe(document.generation.settings.courtyardWidthMeters);
    const rectangles = Object.values(document.levels[0].spaces).map(space =>
      bounds(spacePolygon(document.levels[0], space.id))
    );
    for (const rectangle of rectangles)
      expect(rectangles).toContainEqual({
        x0: 60.25 - rectangle.x1,
        x1: 60.25 - rectangle.x0,
        y0: rectangle.y0,
        y1: rectangle.y1
      });
  });
  it("room-corridor: exact room and loop counts for single, narrow and large maps", () => {
    for (const settings of [
      { roomCount: 1, loopCount: 0, widthMeters: 12, depthMeters: 12 },
      { roomCount: 8, loopCount: 1, widthMeters: 30, depthMeters: 90 },
      { roomCount: 12, loopCount: 2, widthMeters: 100, depthMeters: 35 },
      { roomCount: 40, loopCount: 8, widthMeters: 160, depthMeters: 200 }
    ]) {
      const document = generate({ ...settings, strategy: "room-corridor" });
      expect(Object.values(document.levels[0].spaces).filter(space => space.kind === "room")).toHaveLength(
        settings.roomCount
      );
      expect(accessSummary(document.levels[0]).loops).toBe(settings.loopCount);
    }
  });
  it("rejects invalid sizes and counts, and bounds attempts for impossible layouts", () => {
    for (const settings of [
      { widthMeters: Number.NaN },
      { widthMeters: 251 },
      { roomCount: 51 },
      { loopCount: -1 },
      { seed: "" }
    ]) {
      const result = generateDungeon({ ...DEFAULT_SETTINGS, ...settings });
      expect(result.ok).toBe(false);
      expect(result.attempts).toBe(0);
    }
    for (const settings of [
      { strategy: "caravanserai" as const, courtyardWidthMeters: 58 },
      { strategy: "room-corridor" as const, roomCount: 50, widthMeters: 12, depthMeters: 12 }
    ]) {
      const result = generateDungeon({ ...DEFAULT_SETTINGS, ...settings });
      expect(result.ok).toBe(false);
      expect(result.attempts).toBeLessThanOrEqual(32);
    }
  });
});
