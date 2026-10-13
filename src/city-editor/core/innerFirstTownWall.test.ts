import { describe, expect, it, vi } from "vitest";
import { createGridDocument, parseDocument } from "./document";
import { townCircuits, townGates } from "./fortifications";
import * as oldTownWalls from "./gen/innerTownWall";
import {
  defaultGenerationSettings,
  generateCityOnDocument,
  generateStageOnDocument,
  generationStages
} from "./generate";
import { validate } from "./mesh";
import { auditTownDefenseClosure } from "./townDefenseClosure";

describe("inner-first town walls", () => {
  it.each(["innerWall", "firstInnerGates"] as const)("stops %s when a planned curtain is rejected", checkpoint => {
    const input = createGridDocument({ size: "small", grid: "voronoi", seed: "1c48bkk" });
    const settings = {
      ...defaultGenerationSettings(),
      townWallRings: "double" as const,
      townWallBuildOrder: "inner-first" as const
    };
    settings.config.features.citadel = false;
    const failed = vi.spyOn(oldTownWalls, "addFirstTownWall").mockImplementation(document => ({
      document,
      outerFaces: new Set(),
      report: {
        ok: false,
        failure: "open-defense",
        faces: 0,
        areaShare: 0,
        gapCells: 0,
        gates: 0,
        riverOpenings: 1,
        streetOpenings: 0,
        cuts: 0,
        castleTouches: false,
        closedCrossings: 0
      }
    }));
    try {
      const stage = generateStageOnDocument(input, settings, "9u8ta1", 7, undefined, checkpoint)!;
      expect(failed).toHaveBeenCalledOnce();
      expect(stage).not.toBeNull();
      expect(stage.featureGroups.filter(g => g.kind === "road" || g.kind === "wall")).toEqual([]);
      expect(stage.townWallGeneration?.fallbackReason).toBe("open-defense");
      expect(stage.generationSeed).toBe("9u8ta1");
    } finally {
      failed.mockRestore();
    }
  });
  it("repairs the reported river curtain and stops before outer walls and streets", () => {
    const input = createGridDocument({ size: "small", grid: "voronoi", seed: "1c48bkk" });
    const settings = {
      ...defaultGenerationSettings(),
      townWallRings: "double" as const,
      townWallBuildOrder: "inner-first" as const,
      buildingPattern: "medieval" as const,
      historicalPeriod: "ageOfExploration" as const
    };
    settings.config.features = { walls: true, plaza: true, temple: true, citadel: false, port: false, shanty: true };
    const samples: unknown[] = [];
    const stage = generateStageOnDocument(input, settings, "9u8ta1", 7, undefined, "innerWall", sample => {
      if (sample.phase === "inner-wall" || sample.phase === "inner-wall-defense" || sample.failure)
        samples.push(sample);
    });
    expect(stage, JSON.stringify(samples)).not.toBeNull();
    expect(stage!.townWallGeneration?.fallbackReason, JSON.stringify(samples)).toBeUndefined();
    expect(townCircuits(stage!).map(c => c.ring)).toEqual([0]);
    expect(auditTownDefenseClosure(stage!, "gc:defense-town-0").ok).toBe(true);
    expect(
      stage!.featureGroups.filter(g => g.kind === "road"),
      JSON.stringify(samples)
    ).toEqual([]);
    expect(stage!.featureGroups.some(g => g.kind === "wall" && g.id.startsWith("gc:wall-"))).toBe(false);
    const city = generateCityOnDocument(input, settings, "9u8ta1", sample => {
      if (sample.failure) samples.push(sample);
    });
    expect(city, JSON.stringify(samples)).not.toBeNull();
    expect(
      townCircuits(city!).map(c => c.ring),
      JSON.stringify(samples)
    ).toEqual([0, 1]);
    expect(city!.generationSeed).toBe("9u8ta1");
    for (const c of townCircuits(city!)) expect(auditTownDefenseClosure(city!, c.id, true).ok).toBe(true);
  });
  it.each(["d1", "d2"])("builds a closed old town before the outer wall (%s)", seed => {
    const input = createGridDocument({ size: "small", grid: "voronoi", seed });
    const settings = {
      ...defaultGenerationSettings(),
      townWallRings: "double" as const,
      townWallBuildOrder: "inner-first" as const
    };
    const samples: unknown[] = [];
    const city = generateCityOnDocument(input, settings, seed, sample => {
      if (sample.failure || sample.phase === "inner-wall") samples.push(sample);
    });
    expect(city, JSON.stringify(samples)).not.toBeNull();
    expect(validate(city!)).toEqual([]);
    const circuits = townCircuits(city!);
    expect(
      circuits.map(c => c.ring),
      JSON.stringify(samples)
    ).toEqual([0, 1]);
    for (const c of circuits)
      expect(auditTownDefenseClosure(city!, c.id)).toMatchObject({
        ok: true,
        invasionPaths: 0,
        undefendedLengthMeters: 0
      });
    expect(townGates(city!, circuits[0].id).length).toBeGreaterThan(0);
    expect(parseDocument(JSON.stringify(city))).toEqual(city);
    expect(city!.townWallGeneration).toEqual({
      requestedOrder: "inner-first",
      actualOrder: "inner-first",
      fallbackReason: undefined
    });
    const first = generateStageOnDocument(input, settings, city!.generationSeed ?? seed, 7, undefined, "innerWall");
    expect(first).not.toBeNull();
    expect(townCircuits(first!).map(c => c.ring)).toEqual([0]);
    expect(townGates(first!, "gc:defense-town-0")).toHaveLength(0);
    expect(first!.featureGroups.some(g => g.kind === "wall" && g.id.startsWith("gc:wall-"))).toBe(false);
    const passages = generateStageOnDocument(
      input,
      settings,
      city!.generationSeed ?? seed,
      7,
      undefined,
      "firstInnerGates"
    );
    expect(passages).not.toBeNull();
    expect(validate(passages!)).toEqual([]);
    expect(townCircuits(passages!).map(c => c.ring)).toEqual([0]);
    expect(townGates(passages!, "gc:defense-town-0").length).toBeGreaterThan(0);
  });

  it("orders the experiment's slider with the old curtain and gates first", () => {
    expect(
      generationStages({ ...defaultGenerationSettings(), townWallRings: "double", townWallBuildOrder: "inner-first" })
        .slice(0, 6)
        .map(s => s.id)
    ).toEqual(["coast", "river", "urban", "innerWall", "innerGates", "walls"]);
  });

  it.each(["hex", "evolution"] as const)("grows the outer envelope on a %s mesh", grid => {
    const seed = "d1",
      settings = {
        ...defaultGenerationSettings(),
        townWallRings: "double" as const,
        townWallBuildOrder: "inner-first" as const
      };
    settings.config.rivers = [];
    settings.config.features.citadel = false;
    const city = generateCityOnDocument(createGridDocument({ size: "small", grid, seed }), settings, seed)!;
    expect(city).not.toBeNull();
    expect(validate(city)).toEqual([]);
    expect(townCircuits(city).map(c => c.ring)).toEqual([0, 1]);
    expect(city.townWallGeneration?.actualOrder).toBe("inner-first");
    expect(parseDocument(JSON.stringify(city))).toEqual(city);
  });

  it("records single-wall fallback when a micro town has no room", () => {
    const seed = "first-micro",
      settings = {
        ...defaultGenerationSettings(),
        townWallRings: "double" as const,
        townWallBuildOrder: "inner-first" as const
      };
    settings.config.rivers = [];
    settings.config.features.citadel = false;
    for (const checkpoint of ["innerWall", "firstInnerGates"] as const) {
      const early = generateStageOnDocument(
        createGridDocument({ size: "micro", grid: "hex", seed }),
        settings,
        seed,
        7,
        undefined,
        checkpoint
      )!;
      expect(early).not.toBeNull();
      expect(early.featureGroups.filter(g => g.kind === "road" || g.kind === "wall")).toEqual([]);
      expect(early.townWallGeneration).toMatchObject({ requestedOrder: "inner-first", actualOrder: "single" });
      expect(early.townWallGeneration?.fallbackReason).toBeTruthy();
    }
    const city = generateCityOnDocument(createGridDocument({ size: "micro", grid: "hex", seed }), settings, seed)!;
    expect(city).not.toBeNull();
    expect(validate(city)).toEqual([]);
    expect(townCircuits(city)).toHaveLength(1);
    expect(city.townWallGeneration).toMatchObject({ requestedOrder: "inner-first", actualOrder: "single" });
    expect(city.townWallGeneration?.fallbackReason).toBeTruthy();
  });

  it("keeps a deliberately razed inner wall as a ring road", () => {
    const seed = "d1",
      settings = {
        ...defaultGenerationSettings(),
        townWallRings: "double" as const,
        townWallBuildOrder: "inner-first" as const,
        innerWallState: "razed" as const
      };
    settings.config.rivers = [];
    settings.config.features.citadel = false;
    const city = generateCityOnDocument(createGridDocument({ size: "small", grid: "voronoi", seed }), settings, seed)!;
    expect(city).not.toBeNull();
    expect(validate(city)).toEqual([]);
    expect(townCircuits(city)[0].state).toBe("razed");
    expect(city.featureGroups.some(g => g.kind === "road" && g.id.includes("ring-road"))).toBe(true);
  });

  it("preserves the original algorithm when the order is omitted or outer-first", () => {
    const seed = "d1",
      input = createGridDocument({ size: "small", grid: "voronoi", seed });
    const settings = { ...defaultGenerationSettings(), townWallRings: "double" as const };
    expect(generateCityOnDocument(input, { ...settings, townWallBuildOrder: "outer-first" }, seed)).toEqual(
      generateCityOnDocument(input, settings, seed)
    );
  });
});
