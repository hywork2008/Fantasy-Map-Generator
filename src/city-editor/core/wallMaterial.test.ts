import { describe, expect, it } from "vitest";
import { type RenderSelection, renderEditorSvg } from "../render/svg";
import { createDocument, createSizedDocument } from "./document";
import { createGroup, resolveWallMaterial } from "./features";
import type { BurgSiteDescriptor } from "./gen/site/burgSiteDescriptor";
import { defaultGenerationSettings, generateCityOnDocument } from "./generate";
import type { CityDocument, EdgeFeatureGroup } from "./types";

describe("wall material resolution", () => {
  it("defaults to wood for small villages and hamlets by population or group", () => {
    const doc = createDocument("test-seed", 1200);
    const hamletDescriptor: Partial<BurgSiteDescriptor> = {
      burg: {
        id: 1,
        name: "Small Hamlet",
        group: "hamlet",
        population: 180,
        dwellings: 40,
        capital: false,
        port: false,
        citadel: false,
        plaza: false,
        walls: true,
        temple: false,
        shanty: false,
        type: "Generic",
        seed: "hamlet-seed",
        waterAccess: {
          harbor: false,
          deepWater: false,
          sea: false,
          lake: false,
          river: false,
          riverCrossing: false,
          port: { sea: false, lake: false, river: false }
        }
      },
      frame: {
        extentMeters: 500,
        cityRadiusMeters: 80,
        regionalMode: false,
        originMapUnits: [0, 0],
        metersPerMapUnit: 1
      },
      rivers: [],
      roads: [],
      suggestedGates: 1
    };

    expect(resolveWallMaterial(doc, { descriptor: hamletDescriptor as BurgSiteDescriptor })).toBe("wood");

    const villageDescriptor: Partial<BurgSiteDescriptor> = {
      ...hamletDescriptor,
      burg: { ...hamletDescriptor.burg!, group: "village", population: 600 }
    };
    expect(resolveWallMaterial(doc, { descriptor: villageDescriptor as BurgSiteDescriptor })).toBe("wood");
  });

  it("defaults to stone for large towns and cities", () => {
    const doc = createDocument("test-seed", 1200);
    const cityDescriptor: Partial<BurgSiteDescriptor> = {
      burg: {
        id: 2,
        name: "Big City",
        group: "city",
        population: 8000,
        dwellings: 1800,
        capital: true,
        port: false,
        citadel: true,
        plaza: true,
        walls: true,
        temple: true,
        shanty: true,
        type: "Generic",
        seed: "city-seed",
        waterAccess: {
          harbor: false,
          deepWater: false,
          sea: false,
          lake: false,
          river: false,
          riverCrossing: false,
          port: { sea: false, lake: false, river: false }
        }
      },
      frame: {
        extentMeters: 1500,
        cityRadiusMeters: 400,
        regionalMode: false,
        originMapUnits: [0, 0],
        metersPerMapUnit: 1
      },
      rivers: [],
      roads: [],
      suggestedGates: 3
    };

    expect(resolveWallMaterial(doc, { descriptor: cityDescriptor as BurgSiteDescriptor })).toBe("stone");
  });

  it.each([
    { population: 1499, group: "", capital: false, material: "wood" },
    { population: 1500, group: "", capital: false, material: "stone" },
    { population: 8000, group: "village", capital: false, material: "stone" },
    { population: 180, group: "", capital: true, material: "stone" },
    { population: 180, group: "city", capital: false, material: "stone" },
    { population: 180, group: "town", capital: false, material: "stone" }
  ])(
    "resolves $material for population=$population, group=$group, capital=$capital",
    ({ population, group, capital, material }) => {
      const doc = createDocument("test-seed", 600);
      const descriptor = {
        burg: {
          id: 1,
          name: "Settlement",
          group,
          type: "Generic",
          seed: "test-seed",
          population,
          dwellings: 40,
          capital,
          port: false,
          citadel: false,
          plaza: false,
          walls: true,
          temple: false,
          shanty: false
        }
      } satisfies Partial<BurgSiteDescriptor>;
      expect(resolveWallMaterial(doc, { descriptor: descriptor as BurgSiteDescriptor })).toBe(material);
      expect(resolveWallMaterial(doc, { descriptor: descriptor as BurgSiteDescriptor, choice: "wood" })).toBe("wood");
      expect(resolveWallMaterial(doc, { descriptor: descriptor as BurgSiteDescriptor, choice: "stone" })).toBe("stone");
    }
  );

  it("resolves from standalone document frame extent and radius", () => {
    const smallDoc: CityDocument = {
      ...createDocument("test-seed", 600),
      frame: { extentMeters: 600, cityRadiusMeters: 120, blockSizeMeters: 40 }
    };
    expect(resolveWallMaterial(smallDoc)).toBe("wood");

    const largeDoc: CityDocument = {
      ...createDocument("test-seed", 1500),
      frame: { extentMeters: 1500, cityRadiusMeters: 350, blockSizeMeters: 50 }
    };
    expect(resolveWallMaterial(largeDoc)).toBe("stone");
  });

  it("respects explicit choice over defaults", () => {
    const smallDoc: CityDocument = {
      ...createDocument("test-seed", 500),
      frame: { extentMeters: 500, cityRadiusMeters: 80, blockSizeMeters: 30 }
    };
    expect(resolveWallMaterial(smallDoc, { choice: "stone" })).toBe("stone");

    const largeDoc: CityDocument = {
      ...createDocument("test-seed", 2000),
      frame: { extentMeters: 2000, cityRadiusMeters: 500, blockSizeMeters: 50 }
    };
    expect(resolveWallMaterial(largeDoc, { choice: "wood" })).toBe("wood");
  });
});

describe("wall creation and generation with material", () => {
  it("assigns appropriate material and styles when manually creating wall groups", () => {
    const smallDoc: CityDocument = {
      ...createDocument("test-seed", 500),
      frame: { extentMeters: 500, cityRadiusMeters: 80, blockSizeMeters: 30 }
    };
    const nextSmall = createGroup(smallDoc, "wall");
    const wallSmall = nextSmall.featureGroups.find(g => g.kind === "wall") as EdgeFeatureGroup;
    expect(wallSmall.wallMaterial).toBe("wood");
    expect(wallSmall.style.color).toBe("#7a522c");
    expect(wallSmall.style.widthMeters).toBe(2.4);

    const largeDoc: CityDocument = {
      ...createDocument("test-seed", 1500),
      frame: { extentMeters: 1500, cityRadiusMeters: 400, blockSizeMeters: 50 }
    };
    const nextLarge = createGroup(largeDoc, "wall");
    const wallLarge = nextLarge.featureGroups.find(g => g.kind === "wall") as EdgeFeatureGroup;
    expect(wallLarge.wallMaterial).toBe("stone");
    expect(wallLarge.style.color).toBe("#342a22");
    expect(wallLarge.style.widthMeters).toBe(4.5);
  });

  it("generates wood walls for small villages and stone walls for large cities", () => {
    const microDoc = createSizedDocument("micro", "village-seed");
    const microSettings = defaultGenerationSettings();
    microSettings.config.features.walls = true;
    const generatedMicro = generateCityOnDocument(microDoc, microSettings, "village-seed");
    if (generatedMicro) {
      const walls = generatedMicro.featureGroups.filter(g => g.kind === "wall") as EdgeFeatureGroup[];
      if (walls.length > 0) {
        expect(walls[0].wallMaterial).toBe("wood");
        expect(walls[0].style.color).toBe("#634327");
      }
    }

    const largeDoc = createSizedDocument("large", "city-seed");
    const largeSettings = defaultGenerationSettings();
    largeSettings.config.features.walls = true;
    const generatedLarge = generateCityOnDocument(largeDoc, largeSettings, "city-seed");
    if (generatedLarge) {
      const walls = generatedLarge.featureGroups.filter(g => g.kind === "wall") as EdgeFeatureGroup[];
      if (walls.length > 0) {
        expect(walls[0].wallMaterial).toBe("stone");
        expect(walls[0].style.color).toBe("#41382e");
      }
    }
  });
});

describe("SVG rendering of wood vs stone walls", () => {
  it("renders wood walls with wood stroke color, and stone walls with charcoal color", () => {
    const selection: RenderSelection = {
      faceId: null,
      edgeId: null,
      vertexId: null,
      groupId: null
    };

    const doc: CityDocument = {
      format: "fmg-city-editor",
      version: 1,
      appearance: "town",
      frame: { extentMeters: 500, cityRadiusMeters: 100, blockSizeMeters: 30 },
      mesh: {
        vertices: {
          v1: { id: "v1", point: [0, 0], locked: false },
          v2: { id: "v2", point: [50, 0], locked: false }
        },
        edges: {
          e1: { id: "e1", a: "v1", b: "v2", leftFace: null, rightFace: null, locked: false }
        },
        faces: {}
      },
      featureGroups: [
        {
          id: "wall-wood",
          kind: "wall",
          name: "Palisade",
          segments: [{ edgeId: "e1", forward: true }],
          style: { widthMeters: 2.4, color: "#7a522c" },
          wallMaterial: "wood",
          locked: false
        },
        {
          id: "wall-stone",
          kind: "wall",
          name: "Stone Wall",
          segments: [{ edgeId: "e1", forward: true }],
          style: { widthMeters: 4, color: "#342a22" },
          wallMaterial: "stone",
          locked: false
        }
      ],
      gates: [],
      elements: []
    };

    const svg = renderEditorSvg(doc, "select", selection, "0 0 500 500", 1);
    const woodPath = svg.querySelector(`.ce-feature--wall-wood`);
    const stonePath = svg.querySelector(`.ce-feature--wall-stone`);

    expect(woodPath).not.toBeNull();
    expect(stonePath).not.toBeNull();
    expect(woodPath?.getAttribute("stroke")).toBe("#634327");
    expect(stonePath?.getAttribute("stroke")).toBe("#292a26");
  });
});
