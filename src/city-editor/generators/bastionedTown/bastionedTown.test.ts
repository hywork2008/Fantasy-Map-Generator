import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { renderBastionedTown } from "../../renderers/bastionedTownSvg";
import { collectCityStructures } from "../../renderers/structureMassing";
import { renderTownFortifications } from "../../renderers/townFortificationSvg";
import { parseDocument } from "../../services/io/documentCodec";
import { buildShare, parseIncomingPayload } from "../../services/io/incomingCity";
import type { GenerationSample } from "../../types/contracts/generationDiagnostics";
import type { CityDocument, Point } from "../../types/document";
import type { GenerationSettings } from "../../types/generation";
import { buildBlockFabric } from "../blockInfill";
import { overSkewedBridgeDecks } from "../bridgeDeck";
import { createGridDocument } from "../document";
import { generateCityOnDocument } from "../generation/generateCity";
import { defaultGenerationSettings } from "../generation/settings";
import { pointInPolygon, polygonArea } from "../geom";
import { DocumentHistory } from "../history";
import { facePoints, validate } from "../mesh";
import { defaultPopulationSettings } from "../populationPlan";
import { MIN_SETTLEMENT_AREA_SHARE } from "../settlementExtent";
import { TOWN_WATER_COLOR } from "../townWater";
import { bastionedEditRejection, removeBastionedTown } from "./edit";
import { edgeOutward, pathEntersRing } from "./geometry";
import { fixedApproachHitsBastion } from "./plan";
import { polygonReserved } from "./reserve";
import { bastionedTownSettingConflicts, ditchSpanDeviationDegrees, fortressFailureMessage } from "./validate";

function fortressSettings(overrides: Partial<GenerationSettings> = {}): GenerationSettings {
  const settings = defaultGenerationSettings();
  settings.config = structuredClone(settings.config);
  settings.config.rivers = [];
  settings.config.coast = "none";
  settings.config.relief = false;
  settings.config.features.walls = true;
  settings.config.features.citadel = false;
  return {
    ...settings,
    generationMethod: "skeleton-first",
    wallShape: "bastioned",
    walledAreaShare: 1,
    historicalPeriod: "ageOfExploration",
    townFortification: { kind: "bastioned", outworks: "ravelins", ditch: "dry", streetPlan: "radial" },
    ...overrides
  };
}

function grid(seed: string, extentMeters: number, cityRadiusMeters: number): CityDocument {
  return createGridDocument({ size: "tiny", grid: "evolution", seed, extentMeters, cityRadiusMeters });
}

function roll(seed: string, extentMeters: number, cityRadiusMeters: number, settings: GenerationSettings) {
  const input = grid(seed, extentMeters, cityRadiusMeters);
  const before = JSON.stringify(input);
  const samples: GenerationSample[] = [];
  const city = generateCityOnDocument(input, settings, seed, sample => samples.push(sample));
  const failure = samples.find(sample => sample.failure)?.failure;
  return { input, before, samples, city, failure };
}

function mainHole(document: CityDocument): Point[] {
  const ditch = document.bastionedTown?.ditches.find(item => item.id === "gc:ditch-main");
  return ditch?.region[0]?.holes[0] ?? [];
}

describe("bastioned fortress town", () => {
  it("rejects contradictory settings before a fort or an ordinary wall is drawn", () => {
    const fort = fortressSettings({ mode: "fort" });
    expect(bastionedTownSettingConflicts(fort)).toContain("mode");
    const samples: GenerationSample[] = [];
    const input = grid("fort-mode", 900, 100);
    const before = JSON.stringify(input);
    expect(generateCityOnDocument(input, fort, "fort-mode", sample => samples.push(sample))).toBeNull();
    expect(samples[0]?.failure?.reason).toBe("fortress-settings");
    expect(samples[0]?.failure?.message).toContain("mode");
    expect(JSON.stringify(input)).toBe(before);
    expect(bastionedTownSettingConflicts(fortressSettings({ townWallRings: "double" }))).toContain("double walls");
    expect(bastionedTownSettingConflicts(fortressSettings({ walledAreaShare: undefined }))).toContain("walled share");
    const sloped = fortressSettings({ elevationPreset: "slope", elevationRelief: 2 });
    sloped.config.relief = true;
    expect(bastionedTownSettingConflicts(sloped)).toBeNull();
    expect(fortressFailureMessage("fortress-insufficient-space")).toBe(
      "The frame cannot hold the town and its defense band. Lower the population, enlarge the frame, or use fewer bastions."
    );
    expect(fortressFailureMessage("fortress-water-conflict")).toBe(
      "Water crosses the defense. Choose a dry ditch, or a site where a closed star fits on dry land. Rivers and the coast were not moved."
    );
  });

  it("treats a ditch deck as perpendicular and a fixed road through a bastion as blocked", () => {
    expect(
      ditchSpanDeviationDegrees(
        [
          [0, 0],
          [0, 12]
        ],
        [0, 1]
      )
    ).toBeLessThan(1);
    expect(
      ditchSpanDeviationDegrees(
        [
          [0, 0],
          [10, 10]
        ],
        [0, 1]
      )
    ).toBeGreaterThan(30);
    const bastion: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10]
    ];
    expect(
      fixedApproachHitsBastion(
        [
          [-5, 5],
          [5, 5],
          [15, 5]
        ],
        [bastion]
      )
    ).toBe(true);
    expect(
      fixedApproachHitsBastion(
        [
          [-5, -5],
          [15, -5]
        ],
        [bastion]
      )
    ).toBe(false);
  });

  it("keeps the town inside the main line and buildings off the defense", () => {
    const { city, failure } = roll("fortress-inland", 900, 100, fortressSettings());
    expect(city, JSON.stringify(failure)).not.toBeNull();
    const town = city!;
    const plan = town.bastionedTown!;
    expect(plan.version).toBe(1);
    expect(plan.boundaryKind).toBe("inland-closed");
    expect(plan.bastions.length).toBeGreaterThanOrEqual(5);
    expect(plan.curtains).toHaveLength(plan.bastions.length);
    expect(plan.outworks).toHaveLength(plan.curtains.length);
    expect(plan.ditches.some(ditch => ditch.kind === "dry" && ditch.id === "gc:ditch-main")).toBe(true);
    expect(town.fabric?.generation?.algorithm).toBe("bastioned-city-v1");
    expect(town.version).toBe(5);
    expect(validate(town)).toEqual([]);
    const hole = mainHole(town);
    expect(hole.length).toBeGreaterThan(3);
    let urban = 0;
    for (const face of Object.values(town.mesh.faces)) {
      if (face.properties.settlement !== "core") continue;
      const polygon = facePoints(town.mesh, face);
      urban += Math.abs(polygonArea(polygon));
      expect(pointInPolygon(polygon[0], hole)).toBe(true);
    }
    expect(urban).toBeGreaterThan(MIN_SETTLEMENT_AREA_SHARE * Math.PI * town.frame.cityRadiusMeters ** 2);
    const buildings = buildBlockFabric(town).buildings;
    expect(buildings.length).toBeGreaterThan(0);
    for (const building of buildings) expect(polygonReserved(plan, building.polygon)).toBe(false);
    expect(plan.works?.map(work => work.kind).sort()).toEqual(["barracks", "magazine"]);
    for (const work of plan.works ?? []) {
      expect(work.ownerId).toBe(plan.id);
      expect(polygonReserved(plan, work.polygon)).toBe(true);
      for (const bastion of plan.bastions)
        expect(work.polygon.some(point => pointInPolygon(point, bastion.rampart))).toBe(false);
    }
    const townCircuit = town.defenseCircuits?.find(circuit => circuit.id === "gc:defense-town");
    expect(townCircuit?.scope).toBe("town");
    expect(townCircuit?.moat).toBeUndefined();
    expect(townCircuit?.wallGroupIds).toEqual(["gc:wall-0"]);
  }, 180000);

  it("carries an external road around the ravelin on a straight perpendicular bridge", () => {
    const { city, failure } = roll("fortress-inland", 900, 100, fortressSettings());
    expect(city, JSON.stringify(failure)).not.toBeNull();
    const plan = city!.bastionedTown!;
    const civic = plan.accesses.filter(access => access.role === "civic");
    expect(civic.length).toBeGreaterThan(0);
    for (const access of civic) {
      expect(access.bridge).toHaveLength(2);
      const gate = access.bridge[0];
      let curtain = plan.curtains[0];
      let gap = Number.POSITIVE_INFINITY;
      for (const candidate of plan.curtains) {
        const a = candidate.rampart[0];
        const b = candidate.rampart[1];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const length = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((gate[0] - a[0]) * dx + (gate[1] - a[1]) * dy) / length));
        const distance = Math.hypot(gate[0] - (a[0] + dx * t), gate[1] - (a[1] + dy * t));
        if (distance < gap) {
          gap = distance;
          curtain = candidate;
        }
      }
      expect(gap).toBeLessThan(1);
      const outward = edgeOutward(curtain.rampart[0], curtain.rampart[1]);
      expect(ditchSpanDeviationDegrees(access.bridge as [Point, Point], outward)).toBeLessThan(1);
      const work = plan.outworks.find(item => item.curtainId === curtain.id);
      expect(work).toBeTruthy();
      expect(pathEntersRing([access.bridge[0], ...access.landAfter], work!.outline)).toBe(false);
      const road = city!.featureGroups.find(group => group.id === access.roadId);
      expect(road?.kind).toBe("road");
    }
    const external = city!.featureGroups.filter(group => group.kind === "road" && group.roadRole !== "street");
    expect(external.length).toBeGreaterThan(0);
  }, 180000);

  it("fails a tight frame and opens a sluice where a river already crosses", () => {
    const tight = roll("fortress-tight", 600, 198, fortressSettings());
    expect(tight.city).toBeNull();
    expect(tight.failure?.reason).toBe("fortress-insufficient-space");
    expect(JSON.stringify(tight.input)).toBe(tight.before);
    const dry = fortressSettings();
    dry.config.rivers = ["through"];
    const river = roll("fortress-river", 900, 100, dry);
    expect(river.city, JSON.stringify(river.failure)).not.toBeNull();
    expect(parseDocument(JSON.stringify(river.city))).not.toBeNull();
    expect(JSON.stringify(river.input)).toBe(river.before);
    const plan = river.city!.bastionedTown!;
    expect(plan.sluices?.length).toBeGreaterThan(0);
    const courses = river.city!.featureGroups.flatMap(group =>
      group.kind === "river" ? [group.vertices.map(id => river.city!.mesh.vertices[id].point)] : []
    );
    expect(courses.length).toBeGreaterThan(0);
    for (const course of courses)
      for (const point of course) {
        for (const bastion of plan.bastions) expect(pointInPolygon(point, bastion.rampart)).toBe(false);
        for (const curtain of plan.curtains) {
          if (curtain.closure === "sluice" || curtain.closure === "shore") continue;
          expect(pointInPolygon(point, curtain.rampart)).toBe(false);
        }
      }
    const floodedSettings = fortressSettings({
      townFortification: { kind: "bastioned", outworks: "ravelins", ditch: "wet", streetPlan: "radial" }
    });
    floodedSettings.config.rivers = ["through"];
    const flooded = roll("fortress-river-wet", 900, 100, floodedSettings);
    expect(flooded.city).toBeNull();
    expect(flooded.failure?.reason).toBe("fortress-water-conflict");
    expect(flooded.failure?.message).toContain("set Rivers to 0 and Coast to none");
    expect(JSON.stringify(flooded.input)).toBe(flooded.before);
  }, 180000);

  it("squares every meander crossing on a populated town", () => {
    const settings = fortressSettings({ elevationPreset: "dome", population: defaultPopulationSettings() });
    settings.config.rivers = ["meander"];
    for (const seed of ["az3ex8", "h"]) {
      const river = roll(seed, 900, 100, settings);
      expect(river.city, `${seed} ${JSON.stringify(river.failure)}`).not.toBeNull();
      expect(parseDocument(JSON.stringify(river.city))).not.toBeNull();
      const sluices = river.city!.bastionedTown!.sluices ?? [];
      expect(sluices.length).toBeGreaterThan(0);
      expect(sluices.every(item => item.kind === "sluice")).toBe(true);
      expect(overSkewedBridgeDecks(river.city!)).toEqual([]);
    }
  }, 180000);

  it("follows a gentle dome and refuses a steep walk or a wet ditch on a slope", () => {
    const gentleSettings = fortressSettings({ elevationPreset: "dome", elevationRelief: 1 });
    const gentle = roll("fortress-dome", 900, 100, gentleSettings);
    expect(gentle.city, JSON.stringify(gentle.failure)).not.toBeNull();
    const bases = gentle.city!.bastionedTown!.bastions.flatMap(bastion => bastion.elevations.base);
    expect(Math.max(...bases) - Math.min(...bases)).toBeGreaterThan(0.2);
    const steep = roll("fortress-steep", 900, 100, fortressSettings({ elevationPreset: "dome", elevationRelief: 8 }));
    expect(steep.city).toBeNull();
    expect(steep.failure?.reason).toBe("fortress-relief-too-steep");
    expect(JSON.stringify(steep.input)).toBe(steep.before);
    const wetHill = roll(
      "fortress-wet-slope",
      900,
      100,
      fortressSettings({
        elevationPreset: "slope",
        elevationRelief: 2,
        townFortification: { kind: "bastioned", outworks: "ravelins", ditch: "wet", streetPlan: "radial" }
      })
    );
    expect(wetHill.city).toBeNull();
    expect(wetHill.failure?.reason).toBe("fortress-wet-ditch-level");
    expect(JSON.stringify(wetHill.input)).toBe(wetHill.before);
  }, 180000);

  it("round-trips the plan and replays the same defense from the recipe", () => {
    const settings = fortressSettings();
    const { city, failure } = roll("fortress-inland", 900, 100, settings);
    expect(city, JSON.stringify(failure)).not.toBeNull();
    const loaded = parseDocument(JSON.stringify(city));
    expect(loaded?.version).toBe(5);
    expect(loaded?.bastionedTown).toEqual(city!.bastionedTown);
    const recipe = loaded!.fabric!.generation!;
    expect(recipe.algorithm).toBe("bastioned-city-v1");
    const replay = generateCityOnDocument(recipe.input, recipe.settings, recipe.seed, () => {});
    expect(JSON.stringify(replay?.bastionedTown)).toBe(JSON.stringify(city!.bastionedTown));
    const { fabric: _fabric, ...completed } = city!;
    const share = buildShare({
      seed: "fortress-inland",
      grid: "evolution",
      size: "tiny",
      settings,
      input: completed
    });
    expect(share.version).toBe(2);
    const parsed = parseIncomingPayload(JSON.stringify(share));
    expect(parsed?.input?.bastionedTown).toEqual(city!.bastionedTown);
    expect(parsed?.settings?.townFortification).toEqual(settings.townFortification);
  }, 180000);

  it("draws the same bastions, outworks, and bridges in 2D and 3D, dry and wet", () => {
    const dry = roll("fortress-inland", 900, 100, fortressSettings());
    expect(dry.city, JSON.stringify(dry.failure)).not.toBeNull();
    const town = dry.city!;
    const plan = town.bastionedTown!;
    const svg = renderBastionedTown(town);
    expect(svg.querySelectorAll(".ce-bastion-glacis").length).toBe(plan.glacis.length);
    expect(svg.querySelectorAll(".ce-bastion-ravelin").length).toBe(plan.outworks.length);
    expect(svg.querySelectorAll(".ce-bastion-rampart").length).toBe(plan.bastions.length + plan.curtains.length);
    expect(svg.querySelectorAll(".ce-bastion-bridge").length).toBe(plan.accesses.length);
    expect(svg.querySelector(".ce-bastion-ditch-dry")).toBeTruthy();
    expect(svg.querySelector(".ce-bastion-ditch-wet")).toBeNull();
    const fortifications = renderTownFortifications(town);
    expect(fortifications.querySelectorAll(".ce-bastion-gate").length).toBeGreaterThan(0);
    expect(fortifications.querySelector(".ce-tower")).toBeNull();
    const structures = collectCityStructures(town);
    for (const bastion of plan.bastions) expect(structures.some(item => item.id === bastion.id)).toBe(true);
    for (const work of plan.outworks) expect(structures.some(item => item.id === work.id)).toBe(true);
    for (const access of plan.accesses) {
      const bridge = structures.find(item => item.id === access.id);
      expect(bridge?.kind).toBe("bridge");
      expect(bridge?.centerline).toEqual(access.bridge);
      expect(bridge?.baseElevationMeters).toBeGreaterThan(0);
    }
    expect(structures.some(item => item.id.startsWith("wall:gc:wall-0"))).toBe(false);
    expect(structures.some(item => item.id.startsWith("tower-gc:wall-0"))).toBe(false);
    const ditch = structures.find(item => item.id === "gc:ditch-main");
    expect(ditch?.color).toEqual([0.45, 0.38, 0.28]);
    const wetSettings = fortressSettings({
      townFortification: { kind: "bastioned", outworks: "ravelins", ditch: "wet", streetPlan: "radial" }
    });
    const wet = roll("fortress-wet", 900, 100, wetSettings);
    expect(wet.city, JSON.stringify(wet.failure)).not.toBeNull();
    expect(wet.city!.bastionedTown!.ditches[0].kind).toBe("wet");
    expect(wet.city!.bastionedTown!.ditches[0].supply).toEqual({ kind: "closed-basin", inlet: "none", outlet: "none" });
    const wetSvg = renderBastionedTown(wet.city!);
    const wetDitch = wetSvg.querySelector(".ce-bastion-ditch-wet");
    expect(wetDitch).toBeTruthy();
    expect(wetDitch?.getAttribute("fill")).toBe(`#${TOWN_WATER_COLOR.river.toString(16).padStart(6, "0")}`);
    const river = new THREE.Color(TOWN_WATER_COLOR.river);
    expect(collectCityStructures(wet.city!).find(item => item.id === "gc:ditch-main")?.color).toEqual([
      river.r,
      river.g,
      river.b
    ]);
  }, 180000);

  it("keeps a detached citadel when the town defense is removed", () => {
    const settings = fortressSettings();
    settings.config.features.citadel = true;
    const { city, failure } = roll("fortress-citadel", 900, 100, settings);
    expect(city, JSON.stringify(failure)).not.toBeNull();
    const town = city!;
    const townWalls = new Set(
      town.defenseCircuits?.find(circuit => circuit.id === "gc:defense-town")?.wallGroupIds ?? []
    );
    const castle = town.defenseCircuits?.find(circuit => circuit.id === "gc:defense-castle-0");
    expect(castle?.scope).toBe("castle");
    expect(castle?.ownerCastleId).toBe("gc:castle-0");
    expect(castle?.wallGroupIds.some(id => townWalls.has(id))).toBe(false);
    expect(town.castles?.some(item => item.id === "gc:castle-0" && item.relationship === "detached")).toBe(true);
    expect(parseDocument(JSON.stringify(town))).not.toBeNull();
    expect(validate(town)).toEqual([]);
    const removed = removeBastionedTown(town);
    expect(removed.bastionedTown).toBeUndefined();
    expect(removed.castles?.some(item => item.id === "gc:castle-0")).toBe(true);
    expect(removed.defenseCircuits?.some(circuit => circuit.id === "gc:defense-castle-0")).toBe(true);
    expect(removed.featureGroups.some(group => group.id === "gc:wall-0")).toBe(false);
  }, 180000);

  it("rejects a defense edit and undoes removal as one step", () => {
    const { city, failure } = roll("fortress-inland", 900, 100, fortressSettings());
    expect(city, JSON.stringify(failure)).not.toBeNull();
    const town = city!;
    const moved = structuredClone(town);
    moved.bastionedTown!.bastions[0].rampart[0][0] += 3;
    expect(bastionedEditRejection(town, moved)).toBe(true);
    const reserved = Object.values(town.mesh.faces).find(face => {
      const polygon = facePoints(town.mesh, face);
      return polygonReserved(town.bastionedTown, polygon) && face.properties.ward !== "castle";
    });
    expect(reserved).toBeTruthy();
    const built = structuredClone(town);
    built.mesh.faces[reserved!.id].properties.buildable = true;
    expect(bastionedEditRejection(town, built)).toBe(true);
    const history = new DocumentHistory(town, "generated");
    const removed = removeBastionedTown(town);
    expect(removed.bastionedTown).toBeUndefined();
    expect(bastionedEditRejection(town, removed)).toBe(false);
    const committed = history.commit(removed, "remove bastioned defense");
    const undone = history.undo(committed);
    expect(undone?.bastionedTown).toEqual(town.bastionedTown);
    expect(undone?.featureGroups.some(group => group.id === "gc:wall-0")).toBe(true);
  }, 180000);
});
