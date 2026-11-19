import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { BuildingAppearanceProfile } from "../../../buildings/appearance/types";
import { opusWorkhomeSpecKey, opusWorkhomeSpecOf } from "../../../buildings/medieval/opusWorkhomeProfiles";
import { placementDefinition } from "../../../buildings/placementModels";
import { defaultGenerationSettings } from "../../generators/generation/settings";
import { nearestOnPolyline, pointInPolygon, polygonCentroid } from "../../generators/geom";
import { defaultPopulationSettings } from "../../generators/populationPlan";
import { unpackPoints } from "../../generators/vector/fabric/pack";
import { vectorInputFromEditor } from "../../generators/vector/generation/editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../../generators/vector/generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "../../generators/vector/generation/urban";
import { vectorWallChoice } from "../../generators/vector/generation/wallShape";
import { assertVectorDocument } from "../../generators/vector/validation/document";
import type { PlotFabric } from "../../types/contracts/burgage";
import type { VectorCityDocument } from "../../types/vector/document";
import { vectorRenderData } from "./renderData";
import { createVectorScene } from "./scene3d";

/** A walled town with its facilities (2,000 people unless given), on compact lots or burgage plots. */
function town(
  plotFabric: PlotFabric = "compact",
  { population = 2000, culture }: { population?: number; culture?: BuildingAppearanceProfile } = {}
): VectorCityDocument {
  const seed = "workhome-w3",
    settings = {
      ...defaultGenerationSettings(),
      wallShape: "polygon" as const,
      plotFabric,
      facilityLayout: "population" as const,
      ...(culture ? { buildingAppearanceProfile: culture } : {})
    };
  settings.config = {
    ...settings.config,
    rivers: [],
    features: { ...settings.config.features, walls: true, port: false, shanty: false }
  };
  settings.population = defaultPopulationSettings(population);
  const input = vectorInputFromEditor({
      settings,
      seed,
      frame: { extentMeters: 800, cityRadiusMeters: 200, blockSizeMeters: 50 },
      lotOccupancy: 1
    }),
    wall = vectorWallChoice(settings, seed, input.context.historicalPeriod ?? "ageOfExploration"),
    skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document;
  return generateVectorUrban(skeleton, {
    ...DEFAULT_VECTOR_URBAN,
    mode: "medieval-facilities",
    population,
    plotFabric
  });
}

const warningsOf = (doc: VectorCityDocument) => {
  const scene = createVectorScene(vectorRenderData(doc, "housing"));
  try {
    return scene.warnings as readonly string[];
  } finally {
    scene.dispose();
  }
};

describe("Opus workhomes in a compact CE town (docs/plan/bv-workhome-facade-variation.md W3)", () => {
  const doc = town(),
    workhomes = Object.values(doc.placements).filter(p => p.modelId.startsWith("trade-workhome."));

  it("gives every workhome a saved street front of the town's culture, never twice along a party wall", () => {
    expect(workhomes.length).toBeGreaterThan(30);
    expect(() => assertVectorDocument(doc)).not.toThrow();
    const keys = workhomes.map(p => opusWorkhomeSpecKey(opusWorkhomeSpecOf(p.modelId, p.exterior!)!));
    expect(new Set(workhomes.map(p => p.exterior!.culture)).size).toBe(1);
    expect(new Set(keys).size).toBeGreaterThan(12);
    for (const [i, a] of workhomes.entries())
      for (const [j, b] of workhomes.entries()) {
        if (j <= i || keys[i] !== keys[j]) continue;
        const touch = a.site.outer.some(p => nearestOnPolyline(p, [...b.site.outer, b.site.outer[0]]).dist < 0.3);
        expect(touch).toBe(false);
      }
  });

  it("draws every workhome as its model, its saved height that of its street front", () => {
    const ids = new Set(workhomes.map(p => p.id));
    const bad = warningsOf(doc).filter(w => ids.has(w.slice(w.indexOf(":") + 1)));
    expect(bad).toEqual([]);
  });

  it("keeps drawing a workhome saved before W3 as the Codex study it was sized on", () => {
    // A save from before W3: no street front, the Codex height, and an edit since (its fingerprint is stale).
    const legacy = structuredClone(doc);
    legacy.revision++;
    for (const p of Object.values(legacy.placements)) {
      if (!p.exterior) continue;
      delete p.exterior;
      const model = placementDefinition(p.modelId, "low", undefined, { workhome: "codex" })!.create();
      try {
        const box = new THREE.Box3().setFromObject(model.group, true);
        p.building!.heightMeters = box.max.y - box.min.y;
      } finally {
        model.dispose();
      }
    }
    const ids = new Set(workhomes.map(p => p.id));
    expect(warningsOf(legacy).filter(w => ids.has(w.slice(w.indexOf(":") + 1)))).toEqual([]);
  });
});

describe("Opus workhomes fitted to dense burgage plots (docs/plan/bv-workhome-facade-variation.md W4)", () => {
  const doc = town("burgage-dense"),
    workhomes = Object.values(doc.placements).filter(p => p.modelId.startsWith("trade-workhome."));

  it("builds nearly every workhome on one plot, as wide as the plot on its grid, its door on its own side", () => {
    expect(doc.urban!.algorithm).toBe("vector-urban-v54");
    expect(() => assertVectorDocument(doc)).not.toThrow();
    // Plots whose front, a metre in, lies under a workhome's parcel.
    const fronts = Object.values(doc.fabric!.cells).flatMap(c =>
      c.plots
        ? c.plots.offsets.map((start, i) => {
            const ring = unpackPoints(
                c.plots!.coords,
                c.origin,
                start,
                c.plots!.offsets[i + 1] ?? c.plots!.coords.length / 2
              ),
              [a, b] = unpackPoints(c.plots!.fronts, c.origin, i * 2, i * 2 + 2),
              m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
              q = polygonCentroid(ring),
              d = Math.hypot(q[0] - m[0], q[1] - m[1]);
            return {
              point: [m[0] + (q[0] - m[0]) / d, m[1] + (q[1] - m[1]) / d] as [number, number],
              frontage: Math.hypot(b[0] - a[0], b[1] - a[1])
            };
          })
        : []
    );
    let single = 0;
    for (const p of workhomes) {
      const under = fronts.filter(f => pointInPolygon(f.point, p.site.outer));
      if (under.length === 1) {
        single++;
        // The saved fronts are packed on a 1 cm grid; the workhome was fitted to the unpacked plot before.
        expect(p.exterior!.widthMeters).toBeLessThanOrEqual(under[0].frontage - 0.2 + 0.02);
        // A plot wider than 7.7 m takes the widest shop-house on the grid, 7.5 m.
        expect(p.exterior!.widthMeters).toBeGreaterThan(Math.min(7.5, under[0].frontage - 0.2 - 0.25) - 0.02);
      }
    }
    expect(single / workhomes.length).toBeGreaterThanOrEqual(0.9);
    expect(new Set(workhomes.map(p => p.exterior!.mirror)).size).toBe(2);
  });

  it("draws every fitted workhome as its model", () => {
    const ids = new Set(workhomes.map(p => p.id));
    expect(warningsOf(doc).filter(w => ids.has(w.slice(w.indexOf(":") + 1)))).toEqual([]);
  });

  it("lays each town trade as a shop-house and its rear works in the same plots (ce-town-trade-rear-works.md R2, R3)", () => {
    const rears = Object.values(doc.placements).filter(p => p.modelId.startsWith("trade-workshop.rear-works."));
    // 2,000 people: bakers 5, metalworkers 3, a cutler, a chandler, a fishmonger (R3) and four butchers, each with his
    // own shop in a burgage town (§10.8). A trade keeps its
    // dedicated workshop only where no plot has a backland clear of the streets for its works (§10.5): a few at most.
    const boxes = Object.values(doc.placements).filter(p =>
      /dedicated-(bakehouse|cutlery|metalwares|chandlery|fishmongery|butchery)/.test(p.modelId)
    );
    expect(rears.length + boxes.length).toBe(15);
    expect(rears.length).toBeGreaterThanOrEqual(13);
    // The market trades' shops are the ones nearest the market place (Fish Row, Butcher Row).
    const plaza = doc.environment!.features["feature:civic-plaza"].boundary.outer,
      toMarket = (trade: string) =>
        Object.values(doc.placements)
          .filter(p => p.modelId === `trade-workhome.shop-house.${trade}`)
          .map(p => nearestOnPolyline(p.building!.entrances[0].point, [...plaza, plaza[0]]).dist);
    const market = [...toMarket("fishmongery"), ...toMarket("butchery")],
      others = ["baking", "cutlery", "metalwares", "chandlery"].flatMap(toMarket);
    expect(market).toHaveLength(5);
    expect(Math.max(...market)).toBeLessThan(Math.min(...others));
    for (const rear of rears) {
      const house = doc.placements[rear.building!.annexOf!];
      expect(house.modelId).toBe(`trade-workhome.shop-house.${rear.modelId.split(".").at(-1)}`);
      expect(rear.facingDegrees).toBe(house.facingDegrees);
      // Behind the house, a yard of 4 m between them, the two parcels meeting along one line.
      const angle = (house.facingDegrees * Math.PI) / 180,
        back = [-Math.sin(angle), Math.cos(angle)],
        gap = (rear.position[0] - house.position[0]) * back[0] + (rear.position[1] - house.position[1]) * back[1];
      expect(gap - house.exterior!.depthMeters! / 2 - rear.exterior!.depthMeters! / 2).toBeCloseTo(4.05, 5);
      expect(rear.exterior!.culture).toBe(house.exterior!.culture);
    }
    // The pair is one facility.
    const facilities = doc.urban!.ownedPlacements.filter(id => doc.placements[id].building?.kind === "facility");
    expect(doc.urban!.report.placedFacilities).toBe(facilities.length - rears.length);
    const ids = new Set(rears.map(p => p.id));
    expect(warningsOf(doc).filter(w => ids.has(w.slice(w.indexOf(":") + 1)))).toEqual([]);
  });
});

describe("Guild houses in the street row of a German-style town (docs/plan/bv-workhome-facade-variation.md W5b)", () => {
  const doc = town("burgage-dense", { population: 3000, culture: "northern-urban" }),
    houses = Object.values(doc.placements).filter(p => p.modelId.startsWith("trade-hall.guild-house."));

  it("raises the town's guild houses as town houses of one or two plots, fronted in its culture", () => {
    expect(() => assertVectorDocument(doc)).not.toThrow();
    // 3,000 people: a guild house for each 1,250 (plan §6.1), and no detached hall.
    expect(houses).toHaveLength(2);
    expect(Object.values(doc.placements).some(p => p.modelId.startsWith("trade-hall.guild-enclosed."))).toBe(false);
    for (const p of houses) {
      expect(p.exterior).toMatchObject({ culture: "northern-urban", entranceFace: "gable", storeys: 3 });
      expect(p.exterior!.widthMeters).toBeGreaterThanOrEqual(6);
      expect(p.exterior!.widthMeters).toBeLessThanOrEqual(10);
    }
  });

  it("draws every guild house as its model", () => {
    const ids = new Set(houses.map(p => p.id));
    expect(warningsOf(doc).filter(w => ids.has(w.slice(w.indexOf(":") + 1)))).toEqual([]);
  });
});

describe("An English-style town's guildhall in its market place (docs/plan/bv-workhome-facade-variation.md W5c)", () => {
  for (const plotFabric of ["compact", "burgage-dense"] as const)
    it(`stands the market-side hall in the square of a ${plotFabric} town, clear of its stalls, and draws it`, () => {
      // 3,500 people: a 48 m square (a 30 m one leaves the hall no side clear of the market's aisles).
      const doc = town(plotFabric, { population: 3500 }),
        plaza = doc.environment!.features["feature:civic-plaza"],
        halls = Object.values(doc.placements).filter(p => p.modelId.startsWith("trade-hall.guild-"));
      expect(halls.map(p => p.modelId.split(".")[1])).toEqual(["guild-market-arcade"]);
      const [hall] = halls;
      expect(
        hall.site.outer.every(
          q =>
            pointInPolygon(q, plaza.boundary.outer) ||
            nearestOnPolyline(q, [...plaza.boundary.outer, plaza.boundary.outer[0]]).dist < 1e-6
        )
      ).toBe(true);
      for (const id of plaza.placementIds.filter(id => id !== hall.id))
        expect(doc.placements[id].site.outer.some(q => pointInPolygon(q, hall.site.outer))).toBe(false);
      // The market is still held round it.
      expect(plaza.placementIds.filter(id => id.startsWith("civic:market-stall")).length).toBeGreaterThan(0);
      expect(() => assertVectorDocument(doc)).not.toThrow();
      expect(warningsOf(doc).filter(w => w.endsWith(hall.id))).toEqual([]);
    });
});
