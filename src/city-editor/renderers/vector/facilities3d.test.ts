import type * as THREE from "three";
import { describe, expect, it } from "vitest";
import { sceneVariants } from "../../../city3d/adoption";
import goth from "../../data/fixtures/gothengsfeld-20261012.json";
import { defaultGenerationSettings } from "../../generators/generation/settings";
import { defaultPopulationSettings } from "../../generators/populationPlan";
import { vectorInputFromEditor } from "../../generators/vector/generation/editorInput";
import { vectorInputFromDescriptor } from "../../generators/vector/generation/input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../../generators/vector/generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "../../generators/vector/generation/urban";
import { vectorWallChoice } from "../../generators/vector/generation/wallShape";
import type { BurgSiteDescriptor } from "../../types/contracts/burgSiteDescriptor";
import { vectorRenderData } from "./renderData";
import { createVectorScene } from "./scene3d";

describe("meshless facilities and religious houses as the mesh editor's BV models (feature parity P2d-4)", () => {
  it("draws inns, guild halls and yards, windmills, gallows and monasteries as BV, not raised outlines", () => {
    const d = structuredClone(goth.descriptor) as unknown as BurgSiteDescriptor,
      doc = generateVectorSkeleton(vectorInputFromDescriptor(d), { ...DEFAULT_VECTOR_GENERATION, seed: "p" }).document,
      env = doc.environment!,
      data = vectorRenderData(doc, "regions"),
      wanted = [
        ...(env.inns ?? []),
        ...(env.guilds?.halls ?? []),
        ...(env.guilds?.yards ?? []),
        ...(env.landmarks?.windmills ?? []),
        ...(env.landmarks?.gallows ?? [])
      ].map(x => x.id);
    expect(wanted.length).toBeGreaterThan(0);
    const scene = createVectorScene(data);
    try {
      const all: THREE.Object3D[] = [];
      scene.group.traverse(o => all.push(o));
      const layer = all.find(o => o.name === "ce-facilities");
      expect(layer).toBeDefined();
      const raised = all.filter(
        o =>
          o.userData.representation === "footprint" &&
          ["inn", "guild", "windmill", "gallows", "monastery"].includes(o.userData.featureKind) &&
          wanted.some(id => o.userData.id === id || o.userData.id.startsWith(`${id}:`)) &&
          !/mound|yard|court|ground/i.test(o.userData.pieceRole)
      );
      expect(raised.map(o => o.userData.id)).toEqual([]);
      if (Object.keys(env.monasteries ?? {}).length) expect(all.some(o => o.name === "ce-monasteries")).toBe(true);
    } finally {
      scene.dispose();
    }
  });

  it("draws a Latin town's abbey and friary, church, market stalls and churchyard as the mesh editor's models", () => {
    const seed = "k1",
      settings = {
        ...defaultGenerationSettings(),
        population: defaultPopulationSettings(8000),
        historicalPeriod: "lateMedieval" as const
      };
    settings.config = {
      ...settings.config,
      coast: "none",
      rivers: [],
      features: { ...settings.config.features, walls: false }
    };
    const doc = generateVectorSkeleton(
        vectorInputFromEditor({
          settings,
          seed,
          frame: { extentMeters: 1200, cityRadiusMeters: 300, blockSizeMeters: 50 },
          lotOccupancy: 1
        }),
        { ...DEFAULT_VECTOR_GENERATION, seed, ...vectorWallChoice(settings, seed, "lateMedieval") }
      ).document,
      scene = createVectorScene(vectorRenderData(doc, "regions"));
    try {
      const all: THREE.Object3D[] = [];
      scene.group.traverse(o => all.push(o));
      expect(all.some(o => o.name === "monastery-assembly")).toBe(true);
      // The civic church and the market stalls stand as their catalogue models, with no massing fallback.
      const bv = all.filter(o => o.userData.representation === "bv").map(o => o.userData.modelId);
      expect(bv).toContain("town-church-collegiate");
      expect(bv.filter(id => /stall|table|booth/.test(id)).length).toBeGreaterThan(0);
      expect(scene.warnings.filter(w => w.startsWith("massing:"))).toEqual([]);
      // The churchyard's graves, markers and walls are the mesh editor's open-space models (P2d-5).
      expect(doc.environment?.landscape?.cemeteries.length).toBeGreaterThan(0);
      expect(all.some(o => o.name === "ce-open-spaces" && o.children.length > 0)).toBe(true);
      expect(
        all.some(
          o =>
            o.userData.representation === "footprint" &&
            /^cemetery-/.test(o.userData.pieceRole ?? "") &&
            !["cemetery-ground", "cemetery-access"].includes(o.userData.pieceRole)
        )
      ).toBe(false);
      expect(
        all.some(
          o =>
            o.userData.representation === "footprint" &&
            o.userData.featureKind === "monastery" &&
            /church|range|tower|gatehouse/.test(o.userData.pieceRole)
        )
      ).toBe(false);
    } finally {
      scene.dispose();
    }
  });

  it("draws a facility-mode town's BV trade workshops at the viewer's quality", () => {
    const seed = "fq",
      settings = { ...defaultGenerationSettings(), facilityLayout: "population" as const };
    settings.population = defaultPopulationSettings(2000);
    settings.config = { ...settings.config, rivers: [], features: { ...settings.config.features, walls: false } };
    const input = vectorInputFromEditor({
        settings,
        seed,
        frame: { extentMeters: 800, cityRadiusMeters: 200, blockSizeMeters: 50 },
        lotOccupancy: 1
      }),
      skeleton = generateVectorSkeleton(input, {
        ...DEFAULT_VECTOR_GENERATION,
        seed,
        ...vectorWallChoice(settings, seed, input.context.historicalPeriod)
      }).document,
      doc = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, mode: "medieval-facilities", population: 2000 }),
      trades = Object.values(doc.placements)
        .filter(p => p.building?.kind === "facility" && p.modelId.startsWith("trade-workshop.dedicated-"))
        .map(p => p.modelId);
    expect(trades.length).toBeGreaterThan(0);
    const scene = createVectorScene(vectorRenderData(doc), { quality: "high" });
    try {
      const drawn = sceneVariants(scene.group).filter(v => v.includes(".trade-workshop.dedicated-"));
      for (const id of new Set(trades)) expect(drawn.some(v => v.startsWith(`medieval.${id}@high#`))).toBe(true);
      expect(drawn.filter(v => v.includes("@low#"))).toEqual([]);
    } finally {
      scene.dispose();
    }
  }, 60000);
});
