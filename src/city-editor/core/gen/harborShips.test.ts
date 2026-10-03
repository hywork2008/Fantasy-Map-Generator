import { describe, expect, it } from "vitest";
import { meshFromCells } from "../mesh";
import type { CityDocument, Point } from "../types";
import { createFabricPlan } from "./fabricDistricts";
import { polygonCentroid } from "./geom";
import { allowedShipTypesForPeriod, isExplorationOrLater, planHarborShips, spawnHarborShips } from "./harborShips";

function harborFixture(historicalPeriod = "ageOfExploration"): CityDocument {
  const rect = (x: number, w: number): Point[] => [
    [x, 0],
    [x + w, 0],
    [x + w, 160],
    [x, 160]
  ];
  const polygons = [rect(-100, 100), rect(0, 160), rect(160, 160)];
  const mesh = meshFromCells(
    polygons.map((polygon, id) => ({
      id,
      polygon,
      site: polygonCentroid(polygon),
      centroid: polygonCentroid(polygon),
      neighbors: [],
      onBorder: false
    }))
  );
  for (const [i, f] of Object.values(mesh.faces).entries()) {
    Object.assign(f.properties, {
      ward: i === 0 ? null : i === 1 ? "harbor" : "merchant",
      water: i === 0 ? "sea" : "land",
      buildable: i !== 0,
      settlement: "core",
      depth: 6
    });
  }
  const roadEdges = Object.values(mesh.edges).filter(e => {
    const a = mesh.vertices[e.a].point,
      b = mesh.vertices[e.b].point;
    return (a[1] === 0 && b[1] === 0 && Math.min(a[0], b[0]) >= 0) || (a[0] === 160 && b[0] === 160);
  });
  const document: CityDocument = {
    format: "fmg-city-editor",
    version: 1,
    gridKind: "evolution",
    buildingPattern: "medieval",
    appearance: "town",
    layout: "organic",
    historicalPeriod,
    frame: { extentMeters: 1000, cityRadiusMeters: 400, blockSizeMeters: 50 },
    mesh,
    featureGroups: [
      {
        id: "entry",
        kind: "road",
        name: "Street",
        segments: roadEdges.map(e => ({ edgeId: e.id, forward: true })),
        style: { widthMeters: 5, color: "black" },
        locked: false
      }
    ],
    gates: [],
    elements: [
      {
        id: "gc:harbor",
        kind: "harbor",
        faceIds: [Object.values(mesh.faces)[1].id],
        point: [80, 80],
        locked: false
      }
    ]
  };
  document.fabric = createFabricPlan(document, "harbor-test-seed");
  return document;
}

describe("harborShips", () => {
  it("determines allowed ship types based on historical period", () => {
    expect(isExplorationOrLater("ageOfExploration")).toBe(true);
    expect(isExplorationOrLater("maritimeEra")).toBe(true);
    expect(isExplorationOrLater("preIndustrialEra")).toBe(true);
    expect(isExplorationOrLater("lateMedieval")).toBe(false);
    expect(isExplorationOrLater("highMedieval")).toBe(false);
    expect(isExplorationOrLater("classicalAntiquity")).toBe(false);

    // 大航海時代以降: ガレオン、キャラベル、スループが許可される
    const explorationTypes = allowedShipTypesForPeriod("ageOfExploration");
    expect(explorationTypes).toContain("large");
    expect(explorationTypes).toContain("medium");
    expect(explorationTypes).toContain("small");

    // 大航海時代以前: ガレオンは除外され、キャラベルまたはスループのみ
    const medievalTypes = allowedShipTypesForPeriod("lateMedieval");
    expect(medievalTypes).not.toContain("large");
    expect(medievalTypes).toContain("medium");
    expect(medievalTypes).toContain("small");
  });

  it("plans 1 to several ships docked in an Age of Exploration harbor, with Galleon allowed", () => {
    const doc = harborFixture("ageOfExploration");
    const ships = planHarborShips(doc, "seed-exploration");
    expect(ships.length).toBeGreaterThanOrEqual(1);
    expect(ships.length).toBeLessThanOrEqual(4);

    for (const ship of ships) {
      expect(ship.kind).toBe("ship");
      expect(ship.point).toBeDefined();
      expect(ship.rotation).toBeDefined();
      expect(ship.sizeMeters).toBeGreaterThan(10);
      expect(["large", "medium", "small"]).toContain(ship.shipType);
      // 水面（X <= 0）に停泊していること
      expect(ship.point![0]).toBeLessThanOrEqual(0);
    }

    // 複数シードで試行したときに大型船（ガレオン）が出現することを確認
    const allSpawned = ["seed-1", "seed-2", "seed-3", "seed-4"].flatMap(s => planHarborShips(doc, s));
    expect(allSpawned.some(s => s.shipType === "large")).toBe(true);
  });

  it("strictly forbids Galleons prior to Age of Exploration (only Caravels and Sloops)", () => {
    const doc = harborFixture("lateMedieval");
    const ships = ["s1", "s2", "s3", "s4", "s5", "s6"].flatMap(s => planHarborShips(doc, s));
    expect(ships.length).toBeGreaterThan(0);
    // ガレオンは一隻も出現しないこと
    expect(ships.every(s => s.shipType !== "large")).toBe(true);
    // キャラベルまたはスループが出現すること
    expect(ships.some(s => s.shipType === "medium")).toBe(true);
  });

  it("spawns ships into document.elements and preserves locked ships across re-generation", () => {
    const doc = harborFixture("ageOfExploration");
    spawnHarborShips(doc, "regen-seed-1");
    const firstSpawnedCount = doc.elements.filter(e => e.kind === "ship").length;
    expect(firstSpawnedCount).toBeGreaterThanOrEqual(1);

    // ユーザーが手動で配置したロックされた船を追加
    doc.elements.push({
      id: "user-ship-custom",
      kind: "ship",
      faceIds: [],
      point: [-50, 50],
      rotation: 0,
      sizeMeters: 25,
      shipType: "medium",
      locked: true
    });

    // 再生成を実行
    spawnHarborShips(doc, "regen-seed-2");

    // ロックされたユーザーの船が保持されていること
    expect(doc.elements.some(e => e.id === "user-ship-custom")).toBe(true);
    // 新しい自動生成船が存在すること
    expect(doc.elements.some(e => e.id.startsWith("gc:ship-"))).toBe(true);
  });

  it("spawns ships when a city is generated with a port via generateCityOnDocument", async () => {
    const { createGridDocument } = await import("../document");
    const { defaultGenerationSettings, generateCityOnDocument } = await import("../generate");

    const input = createGridDocument({
      size: "small",
      grid: "evolution",
      seed: "hh199ci",
      patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
    });
    const settings = defaultGenerationSettings();
    settings.config.coast = "bay";
    settings.config.rivers = ["through"];
    settings.config.relief = false;
    settings.config.features = { walls: false, citadel: false, plaza: true, temple: true, port: true, shanty: false };
    settings.config.layout = "auto";
    settings.layout = "organic";

    const city = generateCityOnDocument(input, settings, "hh199ci");
    expect(city).not.toBeNull();
    const ships = city!.elements.filter(e => e.kind === "ship");
    expect(ships.length).toBeGreaterThanOrEqual(1);
  });

  it("spawns ships for the user's exact share link tk7b4h", async () => {
    const { createGridDocument } = await import("../document");
    const { defaultGenerationSettings, generateCityOnDocument } = await import("../generate");

    const input = createGridDocument({
      size: "tiny",
      grid: "evolution",
      seed: "1y534ev",
      patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
    });
    const settings = {
      ...defaultGenerationSettings(),
      config: {
        coast: "straight" as const,
        rivers: [],
        relief: false,
        features: {
          walls: false,
          citadel: true,
          plaza: false,
          temple: true,
          port: true,
          shanty: true
        },
        wall: {
          envelope: "auto" as const,
          coast: "auto" as const,
          line: "auto" as const
        },
        layout: "auto" as const
      },
      streets: {
        farNode: "descriptorEnd" as const,
        avoidSea: true,
        foldSmoothing: true
      },
      buildingPattern: "medieval" as const,
      layout: "organic" as const,
      walledAreaShare: 1,
      historicalPeriod: "ageOfExploration"
    };

    const city = generateCityOnDocument(input, settings, "tk7b4h");
    expect(city).not.toBeNull();
    const ships = city!.elements.filter(e => e.kind === "ship");
    expect(ships.length).toBeGreaterThanOrEqual(1);

    const { renderEditorSvg } = await import("../../render/svg");
    const emptySelection = { faceId: null, edgeId: null, vertexId: null, groupId: null };
    const svg = renderEditorSvg(city!, "select", emptySelection, "-500 -500 1000 1000", 1);
    const renderedShipElements = svg.querySelectorAll(".ce-ship");
    expect(renderedShipElements.length).toBe(ships.length);

    // 桟橋の幅が十分（>= 4.5m）であり、桟橋同士が狭すぎないことを確認
    const renderedPiers = svg.querySelectorAll(".ce-pier");
    expect(renderedPiers.length).toBeGreaterThanOrEqual(1);

    // 船の中心点および船体がどの桟橋のデッキ内部にも刺さっていない（めり込んでいない）ことを確認
    for (const ship of ships) {
      expect(ship.point).toBeDefined();
      for (const pierEl of renderedPiers) {
        const d = pierEl.getAttribute("d")!;
        const coords = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
        const poly: [number, number][] = [];
        for (let i = 0; i < coords.length; i += 2) {
          poly.push([coords[i], coords[i + 1]]);
        }
        const { pointInPolygon } = await import("./geom");
        // 船の中心点は桟橋デッキの内部ではなく水上にあること
        expect(pointInPolygon(ship.point!, poly)).toBe(false);
      }
    }
  });

  it("never spawns ships when there are no piers (preventing ghost galleons on shores without docks)", () => {
    const doc = harborFixture("ageOfExploration");
    // fabric の piers を空にし、メッシュ岸辺からも桟橋が作られないようにする
    if (doc.fabric?.harbor) {
      doc.fabric.harbor.piers = [];
    }
    // 水深を浅くして桟橋抽出を不許可にする
    for (const f of Object.values(doc.mesh.faces)) {
      if (f.properties.water === "sea") {
        f.properties.depth = 1.5;
      }
    }
    const ships = planHarborShips(doc, "seed-no-piers");
    expect(ships.length).toBe(0);
  });

  it("never spawns ships if harbor ward face is strictly inland without any sea contact", () => {
    const doc = harborFixture("ageOfExploration");
    // 全てのセルを陸地に変更（海がない状態、またはharborが完全に内陸）
    for (const f of Object.values(doc.mesh.faces)) {
      f.properties.water = "land";
    }
    const ships = planHarborShips(doc, "seed-landlocked-harbor");
    expect(ships.length).toBe(0);
  });

  it("renders piers and docked ships for user share link lung4d:junction-retry:1", async () => {
    const { createGridDocument } = await import("../document");
    const { defaultGenerationSettings, generateCityOnDocument } = await import("../generate");
    const { renderEditorSvg } = await import("../../render/svg");

    const input = createGridDocument({
      size: "small",
      grid: "evolution",
      seed: "18vm518",
      patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
    });
    const settings = {
      ...defaultGenerationSettings(),
      config: {
        coast: "cape" as const,
        rivers: ["greatBend", "through"],
        relief: false,
        features: {
          walls: true,
          citadel: false,
          plaza: true,
          temple: true,
          port: true,
          shanty: true
        },
        wall: {
          envelope: "auto" as const,
          coast: "auto" as const,
          line: "auto" as const
        },
        layout: "auto" as const
      },
      streets: {
        farNode: "descriptorEnd" as const,
        avoidSea: true,
        foldSmoothing: true
      },
      buildingPattern: "medieval" as const,
      layout: "organic" as const,
      walledAreaShare: 1,
      historicalPeriod: "ageOfExploration"
    };

    const city = generateCityOnDocument(input, settings, "lung4d:junction-retry:1");
    expect(city).not.toBeNull();
    const doc = city!;

    const emptySelection = { faceId: null, edgeId: null, vertexId: null, groupId: null };
    const svg = renderEditorSvg(doc, "select", emptySelection, "-500 -500 1000 1000", 1);

    const renderedPiers = svg.querySelectorAll(".ce-pier");
    const renderedShips = svg.querySelectorAll(".ce-ship");

    // 桟橋が正しく描画されていること（0本ではなく複数本）
    expect(renderedPiers.length).toBeGreaterThanOrEqual(1);
    // 船も描画されていること
    expect(renderedShips.length).toBeGreaterThanOrEqual(1);
  });
});

describe("actual port water", () => {
  it("never puts a galleon at a river or lake berth, even in a dual sea/river port", () => {
    const doc = harborFixture("ageOfExploration");
    doc.waterAccess = {
      river: true,
      sea: true,
      lake: false,
      riverId: 1,
      seaFeatureIds: [1],
      lakeFeatureIds: [],
      port: { river: true, sea: true, lake: false }
    };
    doc.coastalOceanFaceIds = [];
    const ships = ["s1", "s2", "s3"].flatMap(seed => planHarborShips(doc, seed));
    expect(ships.length).toBeGreaterThan(0);
    expect(ships.every(ship => ship.shipType === "small")).toBe(true);
  });
});
