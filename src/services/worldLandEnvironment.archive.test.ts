import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeAndValidateWorldArchive } from "../runtime/worldArchive";
import { buildWorldLandFootprintPolicy } from "./worldLandFootprintPolicy";
import { WorldNonRiverWaterRegistry } from "./worldNonRiverWater";

// User-supplied stage-5 snapshot. Optional locally; no archive is rewritten.
const archive = resolve(process.env.LAND_ENVIRONMENT_ARCHIVE ?? "temp/000.savdata/Serciland 2026-10-04-13-34.fmg");
describe.skipIf(!existsSync(archive))("Serciland current world lake/sea environment", () => {
  it("constructs the complete wet-cell union and invalidates a repaired wet-cell input", async () => {
    const bytes = readFileSync(archive);
    const { document } = await decodeAndValidateWorldArchive({
      blob: new Blob([bytes]),
      header: new Uint8Array(bytes.buffer, bytes.byteOffset, 4)
    });
    const world = document.world,
      registry = new WorldNonRiverWaterRegistry();
    const budgets = {
      maxCells: world.pack.cells.i.length,
      maxVertices: world.pack.cells.v.reduce((n, v) => n + v.length, 0) * 3
    };
    const result = registry.get(world, world.options.distanceUnit ?? "km", budgets);
    if (!("water" in result)) throw Error(`Serciland water: ${result.reason}`);
    expect(result.cellIds.length).toBeGreaterThan(0);
    expect(result.cellIds).toEqual(Array.from(world.pack.cells.i).filter(id => world.pack.cells.h[id] < 20));
    expect(registry.get(world, world.options.distanceUnit ?? "km", budgets)).toBe(result);
    const support = buildWorldLandFootprintPolicy(
      world,
      world.options.distanceUnit ?? "km",
      {
        ...budgets,
        maxClipOperations: 100000,
        maxRemainingPieces: 10000
      },
      { allowsCell: () => true, supportsCell: () => true }
    );
    if (!("policy" in support)) throw Error(`Serciland cell support: ${support.reason}`);
    const cell = result.cellIds[0],
      ref = world.pack.cells.v[cell][0];
    const coordinate = world.pack.vertices.p[ref][0];
    world.pack.vertices.p[ref][0] = NaN;
    expect(registry.get(world, world.options.distanceUnit ?? "km", budgets)).toEqual({ reason: "invalid-cell" });
    world.pack.vertices.p[ref][0] = coordinate;
    expect(registry.get(world, world.options.distanceUnit ?? "km", budgets)).toHaveProperty("water");
  }, 60000);
});
