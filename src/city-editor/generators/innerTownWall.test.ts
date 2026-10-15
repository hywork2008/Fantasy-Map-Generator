import { describe, expect, it } from "vitest";
import type { HousingFitStats } from "../types/contracts/fitImportedHousing";
import { createGridDocument } from "./document";
import {
  boundaryEdges,
  innerTownCircuit,
  outerTownCircuit,
  reservedCastleFaces,
  townCircuits,
  townGates
} from "./fortifications";
import { generateCityOnDocument } from "./generation/generateCity";
import { generateStageOnDocument } from "./generation/previews";
import { defaultGenerationSettings } from "./generation/settings";
import { INNER_WALL_FAILURES, innerTownCapacity } from "./innerTownWall";
import { validate } from "./mesh";
import { kindEdgeIds, vertexHasCrossing } from "./passages";
import { preparePopulationGeneration } from "./populationGeneration";
import { defaultPopulationSettings } from "./populationPlan";
import { innerWalledAreaShare, outerWalledAreaShare } from "./settlementExtent";
import { DEFAULT_SITE_CONFIG } from "./site/siteConfig";
import { synthSite } from "./site/synthSite";
import { auditTownDefenseClosure } from "./townDefenseClosure";

describe("double town walls (P1)", () => {
  it.each([
    ["1q68ihz", "startup-3"],
    ["1q68ihz", "startup-11"],
    ["1q68ihz", "startup-12"],
    ["1q68ihz", "startup-15"],
    ["1brju8l", "startup-1"],
    ["1brju8l", "startup-12"],
    ["8y1sep", "startup-8"]
  ])("keeps double walls when rolling a population town on a reused grid (%s, %s)", (seed, gridSeed) => {
    // Startup enables population generation. Subsequent rolls reuse the
    // population-sized grid saved by the first complete city's recipe.
    const settings = {
      ...defaultGenerationSettings(),
      buildingPattern: "medieval" as const,
      townWallRings: "double" as const,
      historicalPeriod: "ageOfExploration" as const,
      population: defaultPopulationSettings()
    };
    const input = preparePopulationGeneration(
      createGridDocument({ size: "small", grid: "voronoi", seed: gridSeed }),
      settings,
      gridSeed
    ).document;
    const before = JSON.stringify(input);
    for (const stageOnly of [true, false]) {
      const samples: unknown[] = [];
      const observe = (sample: import("../types/contracts/generationDiagnostics").GenerationSample) => {
        if (sample.phase === "inner-wall" || sample.failure) samples.push(sample);
      };
      const city = stageOnly
        ? generateStageOnDocument(input, settings, seed, 7, undefined, "innerWall", observe)
        : generateCityOnDocument(input, settings, seed, observe);
      expect(city, JSON.stringify(samples)).not.toBeNull();
      expect(
        townCircuits(city!).map(c => c.ring),
        JSON.stringify(samples)
      ).toEqual([0, 1]);
      expect(validate(city!)).toEqual([]);
      expect(auditTownDefenseClosure(city!, "gc:defense-town-0")).toMatchObject({
        ok: true,
        disconnectedEnds: 0,
        undefendedLengthMeters: 0
      });
    }
    expect(JSON.stringify(input)).toBe(before);
  });

  it("retains the repaired 13txn3k curtain through complete generation", () => {
    const settings = {
      ...defaultGenerationSettings(),
      buildingPattern: "medieval" as const,
      townWallRings: "double" as const
    };
    const city = generateCityOnDocument(
      createGridDocument({ size: "small", grid: "voronoi", seed: "startup-9" }),
      settings,
      "13txn3k"
    );
    expect(city).not.toBeNull();
    expect(townCircuits(city!).map(c => c.ring)).toEqual([0, 1]);
    expect(validate(city!)).toEqual([]);
    expect(auditTownDefenseClosure(city!, "gc:defense-town-0").ok).toBe(true);
  });
  it.each(
    ["akv0y3", "1s88b7b", "13txn3k"].flatMap(seed =>
      ["startup-0", "startup-9", "startup-17"].map(gridSeed => ({ seed, gridSeed }))
    )
  )("keeps the startup grid seed independent ($seed, grid=$gridSeed)", ({ seed, gridSeed }) => {
    const settings = {
      ...defaultGenerationSettings(),
      buildingPattern: "medieval" as const,
      townWallRings: "double" as const
    };
    const samples: unknown[] = [];
    const city = generateStageOnDocument(
      createGridDocument({ size: "small", grid: "voronoi", seed: gridSeed }),
      settings,
      seed,
      7,
      undefined,
      "innerWall",
      sample => {
        if (sample.phase === "inner-wall" || sample.failure) samples.push(sample);
      }
    );
    expect(city, JSON.stringify(samples)).not.toBeNull();
    expect(
      townCircuits(city!).map(c => c.ring),
      JSON.stringify(samples)
    ).toEqual([0, 1]);
    expect(validate(city!)).toEqual([]);
    expect(auditTownDefenseClosure(city!, "gc:defense-town-0")).toMatchObject({ ok: true });
  });

  it.each(
    (["voronoi", "hex"] as const).flatMap(grid =>
      ["akv0y3", "1s88b7b", "13txn3k"].flatMap(seed => [false, true].map(citadel => ({ grid, seed, citadel })))
    )
  )("generates the reported missing inner curtain ($grid, $seed, castle=$citadel)", ({ grid, seed, citadel }) => {
    const settings = {
      ...defaultGenerationSettings(),
      buildingPattern: "medieval" as const,
      townWallRings: "double" as const
    };
    settings.config.features.citadel = citadel;
    const samples: unknown[] = [];
    const city = generateStageOnDocument(
      createGridDocument({ size: "small", grid, seed }),
      settings,
      seed,
      7,
      undefined,
      "innerWall",
      sample => {
        if (sample.phase === "inner-wall" || sample.failure) samples.push(sample);
      }
    );
    expect(city, JSON.stringify(samples)).not.toBeNull();
    expect(
      townCircuits(city!).map(c => c.ring),
      JSON.stringify(samples)
    ).toEqual([0, 1]);
    expect(validate(city!)).toEqual([]);
    expect(auditTownDefenseClosure(city!, "gc:defense-town-0")).toMatchObject({
      ok: true,
      disconnectedEnds: 0,
      undefendedLengthMeters: 0
    });
  });

  it.each(["d1", "d2", "9u8ta1", "river-inner-1", "river-inner-2", "river-inner-3"])(
    "keeps the river-side old-town curtain closed (%s)",
    seed => {
      const settings = { ...defaultGenerationSettings(), townWallRings: "double" as const };
      settings.config.features.citadel = false;
      const input = createGridDocument({ size: "small", grid: "voronoi", seed });
      const city = generateStageOnDocument(input, settings, seed, 7, undefined, "innerWall")!;
      expect(city).not.toBeNull();
      expect(townCircuits(city).map(c => c.ring)).toEqual([0, 1]);
      expect(validate(city)).toEqual([]);
      expect(auditTownDefenseClosure(city, "gc:defense-town-0")).toMatchObject({ ok: true });
    }
  );

  it("encloses the whole town in the outer wall and sizes the old town by the walled share", () => {
    expect(outerWalledAreaShare({ townWallRings: "double", walledAreaShare: 0.3 }, 2400)).toBe(1);
    expect(outerWalledAreaShare({ walledAreaShare: 0.3 }, 2400)).toBe(0.3);
    expect(innerWalledAreaShare(0.3, 2400)).toBe(0.3);
    // Small windows default to a 100% curtain; the old town falls back to 45%.
    expect(innerWalledAreaShare(undefined, 1200)).toBe(0.45);
    expect(innerWalledAreaShare(undefined, 2400)).toBe(0.45);
  });

  it("generates an old-town wall with gates on every street through it", () => {
    const seed = "d1";
    const city = generateCityOnDocument(
      createGridDocument({ size: "small", grid: "voronoi", seed }),
      { ...defaultGenerationSettings(), townWallRings: "double" },
      seed
    );
    expect(city).not.toBeNull();
    expect(validate(city!)).toEqual([]);
    const rings = townCircuits(city!);
    expect(rings.map(c => c.ring)).toEqual([0, 1]);
    const inner = innerTownCircuit(city!)!;
    const outer = outerTownCircuit(city!)!;
    const outerFaces = new Set(outer.areaFaceIds);
    expect(inner.areaFaceIds.every(id => outerFaces.has(id))).toBe(true);
    expect(inner.areaFaceIds.length).toBeLessThan(outer.areaFaceIds.length);
    for (const id of inner.areaFaceIds) expect(city!.mesh.faces[id].properties.wallRing).toBe(0);

    // Gate-to-centre roads that converge share one gate; at least one opens.
    const gates = townGates(city!, inner.id);
    expect(gates.length).toBeGreaterThanOrEqual(1);
    expect(gates.every(g => g.circuitId === inner.id)).toBe(true);
    // Legacy outer gates keep no circuit id and still resolve to the outer wall.
    expect(townGates(city!, outer.id).length).toBeGreaterThanOrEqual(2);

    // No street is walled over by the old-town curtain.
    const roads = kindEdgeIds(city!, "road");
    const curtain = new Set(
      city!.featureGroups
        .filter(g => g.kind === "wall" && inner.wallGroupIds.includes(g.id))
        .flatMap(g => (g.kind === "wall" ? g.segments.map(r => r.edgeId) : []))
    );
    expect([...curtain].filter(id => roads.has(id))).toEqual([]);
    expect(boundaryEdges(city!.mesh, inner.areaFaceIds).length).toBeGreaterThan(0);
  });

  it("builds the old-town wall before the town streets (stage order)", () => {
    const seed = "d1";
    const doc = createGridDocument({ size: "small", grid: "voronoi", seed });
    const settings = { ...defaultGenerationSettings(), townWallRings: "double" as const };
    // Gate-to-centre roads → old-town wall → its gates and roads → town streets.
    const wall = generateStageOnDocument(doc, settings, seed, 7, undefined, "innerWall");
    const gates = generateStageOnDocument(doc, settings, seed, 7, undefined, "innerGates");
    const streets = generateStageOnDocument(doc, settings, seed, 7, undefined, "streets");
    expect(wall).not.toBeNull();
    expect(gates).not.toBeNull();
    expect(streets).not.toBeNull();
    const roadEdges = (d: NonNullable<typeof wall>) => kindEdgeIds(d, "road").size;
    // The wall goes up before any street is routed; the gate stage routes the
    // gate-to-centre roads only, and the town streets come last.
    expect(roadEdges(wall!)).toBeLessThan(roadEdges(gates!));
    expect(roadEdges(gates!)).toBeLessThan(roadEdges(streets!));
    const inner = innerTownCircuit(wall!)!;
    expect(townCircuits(wall!)).toHaveLength(2);
    expect(townGates(wall!, inner.id)).toHaveLength(0);
    expect(townGates(gates!, innerTownCircuit(gates!)!.id).length).toBeGreaterThanOrEqual(1);
  });

  it("leaves the single-wall default unchanged", () => {
    const seed = "d1";
    const city = generateCityOnDocument(
      createGridDocument({ size: "small", grid: "voronoi", seed }),
      defaultGenerationSettings(),
      seed
    );
    expect(townCircuits(city!)).toHaveLength(1);
    expect(townCircuits(city!)[0].ring).toBeUndefined();
    expect(Object.values(city!.mesh.faces).some(f => f.properties.wallRing !== undefined)).toBe(false);
  });

  it("stands the castle in the old town: town, old-town and castle curtains (P2)", () => {
    const seed = "d1";
    const settings = { ...defaultGenerationSettings(), townWallRings: "double" as const };
    settings.config.features = { ...settings.config.features, walls: true, citadel: true };
    const samples: Record<string, number>[] = [];
    const city = generateCityOnDocument(
      createGridDocument({ size: "small", grid: "voronoi", seed }),
      settings,
      seed,
      s => {
        if (s.phase === "inner-wall" && s.counts) samples.push(s.counts);
      }
    );
    expect(city).not.toBeNull();
    expect(validate(city!)).toEqual([]);
    expect(samples.at(-1)).toMatchObject({ ok: 1, castleInOldTown: 1, castleTouchesOldTown: 1 });
    expect(auditTownDefenseClosure(city!, "gc:defense-town-0").ok).toBe(true);
    const inner = new Set(innerTownCircuit(city!)!.areaFaceIds);
    const castle = reservedCastleFaces(city!);
    expect(castle.size).toBeGreaterThan(0);
    const touches = [...castle].some(id =>
      city!.mesh.faces[id].boundary.some(ref => {
        const edge = city!.mesh.edges[ref.edgeId];
        return [edge.leftFace, edge.rightFace].some(f => f && inner.has(f));
      })
    );
    expect(touches).toBe(true);
    expect(innerTownCapacity(city!.mesh, inner, castle).ok).toBe(true);
    expect(city!.defenseCircuits!.filter(c => c.scope === "castle")).toHaveLength(1);
    expect(townCircuits(city!)).toHaveLength(2);
  });

  it("keeps a micro town single-walled when no old town fits (§5.3)", () => {
    const seed = "d1";
    const samples: Record<string, number>[] = [];
    const city = generateCityOnDocument(
      createGridDocument({ size: "micro", grid: "voronoi", seed }),
      { ...defaultGenerationSettings(), townWallRings: "double" },
      seed,
      s => {
        if (s.phase === "inner-wall" && s.counts) samples.push(s.counts);
      }
    );
    expect(city).not.toBeNull();
    expect(townCircuits(city!)).toHaveLength(1);
    expect(samples.at(-1)).toMatchObject({
      ok: 0,
      planned: 0,
      failureCode: INNER_WALL_FAILURES.indexOf("too-small") + 1
    });
  });

  it("lets streets into the old town only through its gates", () => {
    for (const seed of ["d1", "d2"]) {
      const city = generateCityOnDocument(
        createGridDocument({ size: "small", grid: "voronoi", seed }),
        { ...defaultGenerationSettings(), townWallRings: "double" },
        seed
      );
      expect(city).not.toBeNull();
      expect(validate(city!)).toEqual([]);
      const inner = innerTownCircuit(city!)!;
      const outer = outerTownCircuit(city!)!;
      expect(inner.id).not.toBe(outer.id);
      const gates = new Set(townGates(city!, inner.id).map(g => g.vertexId));
      expect(gates.size).toBeGreaterThanOrEqual(1);
      expect(gates.size).toBeLessThanOrEqual(Math.max(2, townGates(city!, outer.id).length));
      const wallVertices = new Set(
        city!.featureGroups
          .filter(g => g.kind === "wall" && inner.wallGroupIds.includes(g.id))
          .flatMap(g => (g.kind === "wall" ? g.segments : []))
          .flatMap(ref => [city!.mesh.edges[ref.edgeId].a, city!.mesh.edges[ref.edgeId].b])
      );
      // Every street crossing of the old-town curtain is one of its gates.
      const crossings = [...wallVertices].filter(v => vertexHasCrossing(city!, v, "wall", "road"));
      expect(crossings.filter(v => !gates.has(v))).toEqual([]);
    }
  });

  it("razes the old wall to a ring road with no gates (P3)", () => {
    const seed = "d2";
    const city = generateCityOnDocument(
      createGridDocument({ size: "small", grid: "voronoi", seed }),
      { ...defaultGenerationSettings(), townWallRings: "double", innerWallState: "razed" },
      seed
    );
    expect(city).not.toBeNull();
    expect(validate(city!)).toEqual([]);
    const inner = innerTownCircuit(city!)!;
    expect(inner.state).toBe("razed");
    expect(inner.wallGroupIds.filter(id => id.includes("inner-wall"))).toEqual([]);
    expect(townGates(city!, inner.id)).toEqual([]);
    expect(city!.featureGroups.some(g => g.kind === "road" && g.id.includes("ring-road"))).toBe(true);
  });

  it("fills the old town before the town between the walls (P3 housing)", () => {
    const seed = "d1";
    const site = synthSite(
      "smallTown",
      {
        ...DEFAULT_SITE_CONFIG,
        coast: "none",
        rivers: [],
        relief: false,
        features: { ...DEFAULT_SITE_CONFIG.features, walls: true, citadel: false, port: false, shanty: false }
      },
      seed,
      { extentMeters: 1200, cityRadiusMeters: 400 }
    );
    site.burg.walls = true;
    // Few dwellings: the old town alone should hold most of them.
    site.burg.dwellings = 400;
    const settings = { ...defaultGenerationSettings(), townWallRings: "double" as const, descriptor: site };
    let fit: HousingFitStats | undefined;
    let wall: Record<string, number> | undefined;
    const city = generateCityOnDocument(
      createGridDocument({
        size: "small",
        grid: "evolution",
        seed,
        extentMeters: 1200,
        cityRadiusMeters: 400,
        // Imports use Grid evolution (the only grid with a district fabric to fit);
        // finer centre cells leave room for an old town (wall-ring lab).
        patchParams: { nPatches: 150, relaxCount: 4, relaxPasses: 3, rimGrowthPercent: 50 }
      }),
      settings,
      seed,
      s => {
        if (s.phase === "inner-wall") wall = s.counts;
        if (s.phase === "fit-housing") fit = (s as { housingFit?: HousingFitStats }).housingFit;
      }
    );
    expect(city).not.toBeNull();
    expect(wall?.ok).toBe(1);
    expect(fit?.skipped).toBeUndefined();
    expect(fit!.finalZones!.core).toBeGreaterThan(fit!.finalZones!.between);
    expect(fit!.betweenFactor).toBeLessThan(fit!.factor);
    expect(fit!.finalZones!.outskirts).toBe(0);
  });

  it("carries the old-town curtain up to a river and crosses it (wall, river, wall, river)", () => {
    const seed = "d2";
    const city = generateCityOnDocument(
      createGridDocument({ size: "small", grid: "voronoi", seed }),
      { ...defaultGenerationSettings(), townWallRings: "double" },
      seed
    )!;
    expect(validate(city)).toEqual([]);
    const inner = innerTownCircuit(city)!;
    const wall = new Set(
      city.featureGroups
        .filter(g => g.kind === "wall" && inner.wallGroupIds.includes(g.id))
        .flatMap(g => (g.kind === "wall" ? g.segments.map(r => r.edgeId) : []))
    );
    const river = kindEdgeIds(city, "river");
    const wallVertices = new Set([...wall].flatMap(id => [city.mesh.edges[id].a, city.mesh.edges[id].b]));
    const riverVertices = new Set([...river].flatMap(id => [city.mesh.edges[id].a, city.mesh.edges[id].b]));
    const meeting = [...wallVertices].filter(v => riverVertices.has(v));
    // The old wall reaches the river at least once, and every meeting is a real crossing.
    expect(meeting.length).toBeGreaterThanOrEqual(1);
    for (const v of meeting) expect(vertexHasCrossing(city, v, "wall", "river")).toBe(true);
    // The renderer draws a water gate at each crossing listed on the wall group.
    const passages = city.featureGroups.flatMap(g =>
      g.kind === "wall" && inner.wallGroupIds.includes(g.id) ? (g.riverPassages ?? []) : []
    );
    expect(passages.length).toBeGreaterThanOrEqual(1);
    for (const v of passages) expect(vertexHasCrossing(city, v, "wall", "river")).toBe(true);
  });
});
