import { describe, expect, it } from "vitest";
import { renderEditorSvg } from "../../render/svg";
import { createGridDocument, parseDocument } from "../document";
import { defaultGenerationSettings, generateCityOnDocument } from "../generate";
import {
  approachBeyondLabel,
  assignApproachBeyonds,
  evaluateApproachBeyond,
  externalGateRoads,
  externalRoadLabels,
  normalizeApproachBeyond,
  tagExternalGateRoads
} from "./approachBeyond";
import type { BurgSiteDescriptor } from "./site/burgSiteDescriptor";

describe("approach beyond", () => {
  it("assigns structured realm and settlement dimensions to each outer-gate road", () => {
    const grid = createGridDocument({ size: "tiny", grid: "evolution", seed: "beyond-grid" });
    const settings = defaultGenerationSettings();
    const city = generateCityOnDocument(grid, settings, "beyond-seed");
    expect(city).not.toBeNull();
    if (!city) return;

    const external = externalGateRoads(city);
    expect(external.length).toBeGreaterThan(0);
    expect(
      external.every(road => {
        const norm = normalizeApproachBeyond(road.group.beyond);
        return norm !== undefined && norm.realm.relation && norm.settlement.scale;
      })
    ).toBe(true);

    const intramural = city.featureGroups.filter(
      group =>
        group.kind === "road" && group.id.startsWith("gc:road-") && !external.some(road => road.group.id === group.id)
    );
    expect(intramural.every(group => group.kind === "road" && group.beyond === undefined)).toBe(true);

    const again = generateCityOnDocument(grid, settings, "beyond-seed");
    expect(externalGateRoads(again!).map(road => [road.group.id, road.group.beyond])).toEqual(
      external.map(road => [road.group.id, road.group.beyond])
    );
    expect(assignApproachBeyonds("beyond-seed", external.length)).toEqual(external.map(road => road.group.beyond));

    const loaded = parseDocument(JSON.stringify(city));
    expect(externalGateRoads(loaded!).map(road => road.group.beyond)).toEqual(external.map(road => road.group.beyond));

    const svg = renderEditorSvg(
      city,
      "select",
      { faceId: null, edgeId: null, vertexId: null, groupId: null },
      "0 0 10 10",
      1
    );
    const labels = [...svg.querySelectorAll(".ce-approach-beyond")].map(node => node.textContent);
    expect(labels.length).toBe(external.length);
    expect(labels.every(l => l && l.length > 0)).toBe(true);
    expect(labels).toEqual(external.map(road => approachBeyondLabel(road.group.beyond)));
  });

  it("evaluates utility and military defense requirements based on realm, settlement, and context", () => {
    // 1. 食料供給農村（自国）: 高い有用性、軍事的脅威は皆無
    const granaryAssess = evaluateApproachBeyond(
      {
        realm: { relation: "domestic" },
        settlement: { scale: "village", role: "granary", population: 1000, wealth: 40 }
      },
      { population: 5000, hasWalls: true }
    );
    expect(granaryAssess).not.toBeNull();
    expect(granaryAssess?.utilityLevel).toBe("critical");
    expect(granaryAssess?.defenseLevel).toBe("safe");
    expect(granaryAssess?.utilityReason).toContain("食料供給");

    // 2. 敵国の要塞都市: 有用性は低く（交流途絶）、軍事的備えが急務
    const enemyAssess = evaluateApproachBeyond(
      {
        realm: { relation: "Enemy" },
        settlement: { scale: "city", role: "fortress", population: 12000, wealth: 60 }
      },
      { population: 3000, hasWalls: false }
    );
    expect(enemyAssess).not.toBeNull();
    expect(enemyAssess?.utilityLevel).toBe("low");
    expect(enemyAssess?.defenseLevel).toBe("critical");
    expect(enemyAssess?.defenseReason).toContain("敵国");
    expect(enemyAssess?.defenseReason).toContain("城壁が未整備");

    // 3. 同盟国の交易都市: 有用性が高く、防備は安全
    const allyAssess = evaluateApproachBeyond(
      {
        realm: { relation: "Ally" },
        settlement: { scale: "city", role: "market", population: 15000, wealth: 80 }
      },
      { population: 4000, hasWalls: true }
    );
    expect(allyAssess?.utilityLevel).toBe("critical");
    expect(allyAssess?.defenseLevel).toBe("safe");
  });

  it("integrates with FMG BurgSiteDescriptor nextBurg entries", () => {
    const grid = createGridDocument({ size: "tiny", grid: "evolution", seed: "fmg-beyond-grid" });
    const settings = defaultGenerationSettings();
    const city = generateCityOnDocument(grid, settings, "fmg-seed");
    expect(city).not.toBeNull();
    if (!city) return;

    const external = externalGateRoads(city);
    expect(external.length).toBeGreaterThan(0);

    const roadBearingDeg = ((external[0].bearing * 180) / Math.PI + 360) % 360;

    const mockDescriptor = {
      version: 2,
      burg: { id: 1, name: "Capital", population: 5000 },
      frame: { extentMeters: 1000 },
      roads: [
        {
          routeId: 10,
          group: "roads",
          entryAzimuthDeg: roadBearingDeg,
          reachesEdge: true,
          path: [],
          nextBurg: {
            id: 42,
            name: "Ironhold",
            distanceMeters: 12000,
            stateId: 3,
            stateName: "Northern Realm",
            isDomestic: false,
            diplomacyRelation: "Enemy" as const,
            scale: "city" as const,
            role: "fortress" as const,
            population: 20000,
            wealth: 65,
            treasury: 500
          }
        }
      ]
    } as unknown as BurgSiteDescriptor;

    tagExternalGateRoads(city, "fmg-seed", mockDescriptor);

    const targetRoad = external[0];
    const norm = normalizeApproachBeyond(targetRoad.group.beyond);
    expect(norm).toBeDefined();
    expect(norm?.realm.relation).toBe("Enemy");
    expect(norm?.realm.stateName).toBe("Northern Realm");
    expect(norm?.settlement.name).toBe("Ironhold");
    expect(norm?.settlement.scale).toBe("city");
    expect(norm?.settlement.role).toBe("fortress");
    expect(norm?.settlement.population).toBe(20000);

    const label = approachBeyondLabel(targetRoad.group.beyond);
    expect(label).toContain("Ironhold");
    expect(label).toContain("敵国");
    expect(label).toContain("要塞");
  });

  it("clears a generated role when the road no longer leaves a gate", () => {
    const grid = createGridDocument({ size: "tiny", grid: "evolution", seed: "beyond-grid" });
    const city = generateCityOnDocument(grid, defaultGenerationSettings(), "beyond-seed");
    expect(city).not.toBeNull();
    if (!city) return;
    city.gates = [];
    tagExternalGateRoads(city, "beyond-seed");
    expect(city.featureGroups.some(group => group.kind === "road" && group.beyond)).toBe(false);
  });
});

it("does not label the central Road 7 in the reported coastal town", () => {
  const grid = createGridDocument({
    size: "tiny",
    grid: "evolution",
    seed: "1gqyytj",
    patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
  });
  const settings = defaultGenerationSettings();
  settings.layout = "organic";
  settings.walledAreaShare = 1;
  settings.config.coast = "bay";
  settings.config.rivers = ["straight"];
  settings.config.relief = true;
  settings.config.features = { walls: true, citadel: false, plaza: true, temple: false, port: true, shanty: true };
  const city = generateCityOnDocument(grid, settings, "e7fn1h")!;
  expect(city).not.toBeNull();
  const central = city.featureGroups.find(g => g.kind === "road" && g.segments.some(r => r.edgeId === "e370"));
  expect(central?.id).toBe("gc:road-6");
  expect(central?.kind === "road" && central.beyond).toBeUndefined();
  expect(externalGateRoads(city).some(r => r.group.id === central!.id)).toBe(false);
  expect(externalGateRoads(city).length).toBeGreaterThan(0);
  const exits = externalRoadLabels(city);
  const shared = exits.find(exit => exit.roads.some(r => r.group.id === "gc:road-0"))!;
  expect(shared.roads.map(r => r.group.id)).toContain("gc:road-2");
  expect(shared.destinations).toHaveLength(1);
  expect(shared.roads[0].group.beyond).toEqual(shared.roads[1].group.beyond);
  const render = () =>
    renderEditorSvg(city, "select", { faceId: null, edgeId: null, vertexId: null, groupId: null }, "0 0 10 10", 1);
  expect(render().querySelectorAll('.ce-approach-beyond[data-groups~="gc:road-0"]')).toHaveLength(1);
  const descriptor = {
    roads: [41, 42].map((id, i) => ({
      routeId: i,
      entryAzimuthDeg: shared.roads[0].bearing,
      nextBurg: { id, name: `Town ${id}`, scale: "town", isDomestic: true, population: 1000, wealth: 40 }
    }))
  } as unknown as BurgSiteDescriptor;
  tagExternalGateRoads(city, "e7fn1h", descriptor);
  const combined = externalRoadLabels(city).find(exit => exit.roads.some(r => r.group.id === "gc:road-0"))!;
  expect(combined.destinations).toHaveLength(2);
  const label = render().querySelector('.ce-approach-beyond[data-groups~="gc:road-0"]')!;
  expect(label.querySelectorAll("tspan")).toHaveLength(3);
  expect(label.textContent).toContain("Town 41");
  expect(label.textContent).toContain("Town 42");
  tagExternalGateRoads(city, "e7fn1h");

  if (central?.kind === "road") {
    central.beyond = "city";
    tagExternalGateRoads(city, "e7fn1h");
    expect(central.beyond).toBeUndefined();
  }
});
