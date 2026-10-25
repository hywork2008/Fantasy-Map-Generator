import { describe, expect, it } from "vitest";
import { parseDocument } from "../../services/io/documentCodec";
import { buildShare, parseIncomingPayload } from "../../services/io/incomingCity";
import type { HistoricalPeriod } from "../../types/document";
import type { GenerationSettings } from "../../types/generation";
import { createGridDocument } from "../document";
import { generateCityOnDocument } from "../generation/generateCity";
import { defaultGenerationSettings } from "../generation/settings";
import { unitWallShape } from "../generation/skeleton/wallShapes";
import { preparePopulationGeneration } from "../populationGeneration";
import { defaultPopulationSettings } from "../populationPlan";
import { makeRng } from "../prng";
import { artilleryDimensions, flankingDistance, ringGap } from "./dimensions";
import { planBastionedTown } from "./plan";
import { fortressFrameExtent } from "./validate";

const seed = "military-calibration";
function settings(period: HistoricalPeriod = "ageOfExploration"): GenerationSettings {
  const s = defaultGenerationSettings();
  s.config = structuredClone(s.config);
  Object.assign(s.config, { rivers: [], coast: "none", relief: false });
  Object.assign(s.config.features, { walls: true, citadel: false });
  return {
    ...s,
    historicalPeriod: period,
    generationMethod: "skeleton-first",
    wallShape: "bastioned",
    wallSides: 9,
    walledAreaShare: 1,
    townFortification: {
      kind: "bastioned",
      outworks: "ravelins",
      ditch: "dry",
      streetPlan: "radial",
      dimensionPolicy: "artillery-v1"
    }
  };
}
function grid(extent = 1200, radius = 100) {
  return createGridDocument({ size: "small", grid: "evolution", seed, extentMeters: extent, cityRadiusMeters: radius });
}

describe("artillery dimension calibration", () => {
  it("measures crossing boundaries as zero clearance and does not use drowned bastions as batteries", () => {
    expect(
      ringGap(
        [
          [-4, -1],
          [4, -1],
          [4, 1],
          [-4, 1]
        ],
        [
          [-1, -4],
          [1, -4],
          [1, 4],
          [-1, 4]
        ]
      )
    ).toBe(0);
    const ring = unitWallShape("bastioned", makeRng("support"), 5);
    expect(flankingDistance(ring, 5, new Set([1, 2, 3, 4]), new Set([0, 1]))).toBe(Infinity);
  });
  it.each(["ageOfExploration", "maritimeEra", "steamEra"] as const)(
    "keeps physical works and a support range in %s",
    period => {
      const s = settings(period),
        p = artilleryDimensions(period);
      const result = planBastionedTown(grid(period === "ageOfExploration" ? 1200 : 1800), s, seed);
      expect("draft" in result, JSON.stringify(result)).toBe(true);
      if (!("draft" in result)) return;
      const plan = result.draft.plan,
        m = plan.military!;
      expect(m.minBastionDepthMeters).toBeGreaterThanOrEqual(p.bastionDepth - 1e-6);
      expect(m.minCurtainLengthMeters).toBeGreaterThanOrEqual(p.curtainLength - 1e-6);
      expect(m.urbanSetbackMeters).toBeGreaterThanOrEqual(p.urbanSetback);
      expect(m.maxFlankingDistanceMeters).toBeLessThanOrEqual(p.flankingRange);
      expect(m.urbanToDefenseEdgeMeters).toBeGreaterThan(p.glacisWidth);
      expect(m.centerToDefenseEdgeMeters).toBeGreaterThan(m.urbanToDefenseEdgeMeters);
      expect(m.bombardmentAssessed).toBe(false);
      expect(m.profile).toBe(p.profile);
      for (const work of plan.outworks)
        expect(
          Math.hypot(work.sally[0] - work.outline[2][0], work.sally[1] - work.outline[2][1])
        ).toBeGreaterThanOrEqual(p.ravelinDepth - 1e-6);
    }
  );

  it("does not shrink the military minimums for a smaller town or a tight frame", () => {
    const s = settings();
    const small = planBastionedTown(grid(1200, 60), s, seed);
    expect("draft" in small).toBe(true);
    if ("draft" in small) expect(small.draft.plan.military!.minBastionDepthMeters).toBeGreaterThanOrEqual(70 - 1e-6);
    const tight = planBastionedTown(grid(600, 60), s, seed);
    expect("failure" in tight && tight.failure.reason).toBe("fortress-military-space");
    const large = grid();
    large.frame.extentMeters = 8000;
    large.frame.cityRadiusMeters = 1000;
    s.wallSides = 5;
    const stretched = planBastionedTown(large, s, seed);
    expect("failure" in stretched && stretched.failure.reason).toBe("fortress-flanking-range");
  });

  it("keeps omitted-policy recipes at their original proportions", () => {
    const old = settings();
    delete old.townFortification!.dimensionPolicy;
    const explicit = structuredClone(old);
    explicit.townFortification!.dimensionPolicy = "legacy";
    const a = planBastionedTown(grid(), old, seed),
      b = planBastionedTown(grid(), explicit, seed);
    expect(a).toEqual(b);
    if ("draft" in a) expect(a.draft.plan.military).toBeUndefined();
  });

  it("sizes an automatic population frame for the full defense envelope", () => {
    const s = settings("maritimeEra");
    s.population = defaultPopulationSettings();
    const prepared = preparePopulationGeneration(grid(600), s, seed);
    const radius = prepared.document.populationPlan!.cityRadiusMeters;
    expect(prepared.document.frame.extentMeters).toBeGreaterThanOrEqual(fortressFrameExtent(radius, s));
  });

  it("saves and replays calibrated dimensions and shares them only as version 3", () => {
    const s = settings();
    const city = generateCityOnDocument(grid(), s, seed)!;
    expect(city).not.toBeNull();
    const loaded = parseDocument(JSON.stringify(city))!;
    expect(loaded).not.toBeNull();
    expect(loaded.bastionedTown!.military!.minBastionDepthMeters).toBeGreaterThanOrEqual(70 - 1e-6);
    const recipe = loaded.fabric!.generation!;
    const replay = generateCityOnDocument(recipe.input, recipe.settings, recipe.seed)!;
    expect(replay.bastionedTown).toEqual(city.bastionedTown);
    const share = buildShare({ seed, grid: "evolution", size: "small", settings: s });
    expect(share.version).toBe(3);
    expect(parseIncomingPayload(JSON.stringify(share))?.settings.townFortification?.dimensionPolicy).toBe(
      "artillery-v1"
    );
    const invalid = structuredClone(share);
    invalid.version = 2;
    expect(parseIncomingPayload(JSON.stringify(invalid))).toBeNull();
    const bad = structuredClone(city);
    bad.bastionedTown!.military!.maxFlankingDistanceMeters = 9999;
    expect(parseDocument(JSON.stringify(bad))).toBeNull();
  }, 30000);
});
