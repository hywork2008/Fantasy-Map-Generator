import { describe, expect, it } from "vitest";
import type { CityDocument, EdgeFeatureGroup, Point } from "../core/types";
import { renderEditorSvg } from "./svg";
import {
  offsetPolyline,
  renderGateDecoration,
  renderTowerDecoration,
  renderWallStructure,
  resolveWallGeometry
} from "./wallSvg";

function makeWallGroup(overrides: Partial<EdgeFeatureGroup>): EdgeFeatureGroup {
  return {
    id: "test-wall",
    kind: "wall",
    name: "Wall",
    segments: [{ edgeId: "e1", forward: true }],
    style: { widthMeters: 4, color: "#342a22" },
    locked: false,
    ...overrides
  };
}

function makeDoc(wallGroup: EdgeFeatureGroup): CityDocument {
  return {
    appearance: "town",
    frame: { origin: [-100, -100], widthMeters: 200, heightMeters: 200, extentMeters: 200, blockSizeMeters: 30 },
    mesh: {
      vertices: {
        v1: { id: "v1", point: [-30, 0], locked: false },
        v2: { id: "v2", point: [30, 0], locked: false }
      },
      edges: {
        e1: { id: "e1", a: "v1", b: "v2", leftFace: null, rightFace: null, locked: false }
      },
      faces: {}
    },
    featureGroups: [wallGroup],
    gates: [],
    elements: [{ id: "plz", kind: "plaza", faceIds: [], point: [0, -50], sizeMeters: 20 }]
  };
}

function createDomElement(name: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, val] of Object.entries(attrs)) {
    el.setAttribute(key, val);
  }
  return el;
}

describe("resolveWallGeometry", () => {
  it("resolves narrow wood wall as palisade without walkway", () => {
    const geom = resolveWallGeometry(1.4, "wood", "auto");
    expect(geom.hasWalkway).toBe(false);
    expect(geom.parapetWidth).toBe(1.4);
    expect(geom.walkwayWidth).toBe(0);
  });

  it("resolves broad wood wall as timber wall with catwalk", () => {
    const geom = resolveWallGeometry(3.0, "wood", "auto");
    expect(geom.hasWalkway).toBe(true);
    expect(geom.parapetWidth).toBeGreaterThan(0.5);
    expect(geom.walkwayWidth).toBeGreaterThan(1.5);
  });

  it("resolves narrow stone wall as single masonry without walkway", () => {
    const geom = resolveWallGeometry(1.6, "stone", "auto");
    expect(geom.hasWalkway).toBe(false);
    expect(geom.parapetWidth).toBe(1.6);
  });

  it("resolves wide stone wall with broad walkway for troops", () => {
    const geom = resolveWallGeometry(5.0, "stone", "auto");
    expect(geom.hasWalkway).toBe(true);
    expect(geom.parapetWidth).toBeLessThan(1.5);
    expect(geom.walkwayWidth).toBeGreaterThan(3.0); // wide walkway absorbs the extra width!
  });

  it("respects explicit walkway=none even for wide walls", () => {
    const geom = resolveWallGeometry(4.0, "wood", "none");
    expect(geom.hasWalkway).toBe(false);
  });

  it("respects explicit walkway=walkway even for narrower walls", () => {
    const geom = resolveWallGeometry(1.5, "wood", "walkway");
    expect(geom.hasWalkway).toBe(true);
  });
});

describe("offsetPolyline", () => {
  it("offsets polyline outward and inward correctly relative to town center", () => {
    const run: Point[] = [
      [-20, 0],
      [20, 0]
    ];
    const center: Point = [0, -50]; // town is at -Y, so outward is +Y

    const outward = offsetPolyline(run, 2, center);
    const inward = offsetPolyline(run, -2, center);

    // Outward should have Y > 0
    expect(outward[0][1]).toBeGreaterThan(0);
    expect(outward[1][1]).toBeGreaterThan(0);

    // Inward should have Y < 0 (toward center)
    expect(inward[0][1]).toBeLessThan(0);
    expect(inward[1][1]).toBeLessThan(0);
  });
});

describe("renderWallStructure", () => {
  it("renders narrow timber palisade with log top pattern and cores", () => {
    const wall = makeWallGroup({ wallMaterial: "wood", style: { widthMeters: 1.4, color: "#634327" } });
    const doc = makeDoc(wall);
    const run: Point[] = [
      [-30, 0],
      [30, 0]
    ];

    const g = renderWallStructure(doc, wall, run, createDomElement);
    expect(g.classList.contains("ce-wall-structure--wood")).toBe(true);

    const logs = g.querySelector(".ce-wall-wood-logs");
    const cores = g.querySelector(".ce-wall-wood-cores");
    expect(logs).not.toBeNull();
    expect(cores).not.toBeNull();
    // Narrow wall should not have deck
    expect(g.querySelector(".ce-wall-wood-deck")).toBeNull();
  });

  it("renders wide timber wall with walkway deck, shadow, logs, and rail", () => {
    const wall = makeWallGroup({ wallMaterial: "wood", style: { widthMeters: 3.2, color: "#634327" } });
    const doc = makeDoc(wall);
    const run: Point[] = [
      [-30, 0],
      [30, 0]
    ];

    const g = renderWallStructure(doc, wall, run, createDomElement);
    const deck = g.querySelector(".ce-wall-wood-deck");
    const planks = g.querySelector(".ce-wall-wood-planks");
    const shadow = g.querySelector(".ce-wall-wood-shadow");
    const logs = g.querySelector(".ce-wall-wood-logs");
    const rail = g.querySelector(".ce-wall-wood-rail");

    expect(deck).not.toBeNull();
    expect(planks).not.toBeNull();
    expect(shadow).not.toBeNull();
    expect(logs).not.toBeNull();
    expect(rail).not.toBeNull();
  });

  it("renders wide stone curtain wall with battlements (merlons), paved walkway, shadow, and inner rail", () => {
    const wall = makeWallGroup({ wallMaterial: "stone", style: { widthMeters: 4.5, color: "#292a26" } });
    const doc = makeDoc(wall);
    const run: Point[] = [
      [-30, 0],
      [30, 0]
    ];

    const g = renderWallStructure(doc, wall, run, createDomElement);
    expect(g.classList.contains("ce-wall-structure--stone")).toBe(true);

    const walkway = g.querySelector(".ce-wall-stone-walkway");
    const shadow = g.querySelector(".ce-wall-stone-shadow");
    const merlons = g.querySelector(".ce-wall-stone-merlons");
    const innerRail = g.querySelector(".ce-wall-stone-inner-rail");

    expect(walkway).not.toBeNull();
    expect(shadow).not.toBeNull();
    expect(merlons).not.toBeNull();
    expect(innerRail).not.toBeNull();
    // Paved walkway should be lighter stone
    expect(walkway?.getAttribute("stroke")).toBe("#beb9ab");
  });
});

describe("renderEditorSvg integration", () => {
  it("renders both base picking paths and decorative wall structures in town view", () => {
    const woodWall = makeWallGroup({
      id: "wood-palisade",
      wallMaterial: "wood",
      style: { widthMeters: 2.8, color: "#634327" }
    });
    const stoneWall = makeWallGroup({
      id: "stone-wall",
      wallMaterial: "stone",
      style: { widthMeters: 4.2, color: "#292a26" }
    });
    const doc = makeDoc(woodWall);
    doc.featureGroups.push(stoneWall);

    const svg = renderEditorSvg(doc, "select", { faceId: null, edgeId: null, vertexId: null }, "0 0 500 500", 1);

    // Base picking paths with backward-compatible strokes
    const woodPath = svg.querySelector(".ce-feature--wall-wood");
    const stonePath = svg.querySelector(".ce-feature--wall-stone");
    expect(woodPath).not.toBeNull();
    expect(stonePath).not.toBeNull();
    expect(woodPath?.getAttribute("stroke")).toBe("#634327");
    expect(stonePath?.getAttribute("stroke")).toBe("#292a26");

    // Rich decorative structures
    const woodStructures = svg.querySelectorAll(".ce-wall-structure--wood");
    const stoneStructures = svg.querySelectorAll(".ce-wall-structure--stone");
    expect(woodStructures.length).toBeGreaterThan(0);
    expect(stoneStructures.length).toBeGreaterThan(0);
  });
});

describe("renderTowerDecoration", () => {
  it("renders wood tower decoration with timber deck, log fringe, and center hatch", () => {
    const g = renderTowerDecoration([10, 20], 3.0, "wood", createDomElement);
    expect(g.classList.contains("ce-tower-decoration--wood")).toBe(true);
    expect(g.querySelector(".ce-tower-wood-deck")).not.toBeNull();
    expect(g.querySelector(".ce-tower-wood-logs")).not.toBeNull();
    expect(g.querySelector(".ce-tower-wood-cores")).not.toBeNull();
    expect(g.querySelector(".ce-tower-wood-hatch")).not.toBeNull();
  });

  it("renders stone tower decoration with flagstone floor, shadow, and merlons", () => {
    const g = renderTowerDecoration([10, 20], 3.5, "stone", createDomElement);
    expect(g.classList.contains("ce-tower-decoration--stone")).toBe(true);
    const floor = g.querySelector(".ce-tower-stone-floor");
    const shadow = g.querySelector(".ce-tower-stone-shadow");
    const merlons = g.querySelector(".ce-tower-stone-merlons");
    expect(floor).not.toBeNull();
    expect(shadow).not.toBeNull();
    expect(merlons).not.toBeNull();
    expect(floor?.getAttribute("fill")).toBe("#beb9ab");
  });
});

describe("renderGateDecoration", () => {
  it("renders wood gatehouse with timber decks, corner posts, wooden doors, and overpass", () => {
    const g = renderGateDecoration(6.4, 8.0, 4.0, "wood", false, createDomElement);
    expect(g.classList.contains("ce-gate-decoration--wood")).toBe(true);
    const decks = g.querySelectorAll(".ce-gate-wood-deck");
    const posts = g.querySelectorAll(".ce-gate-wood-post");
    const doors = g.querySelector(".ce-gate-wood-doors");
    const overpass = g.querySelector(".ce-gate-wood-overpass");

    expect(decks.length).toBe(2);
    expect(posts.length).toBe(8); // 4 corners * 2 flank towers
    expect(doors).not.toBeNull();
    expect(overpass).not.toBeNull();
  });

  it("renders stone gatehouse with paved floors, merlons, portcullis, and overpass", () => {
    const g = renderGateDecoration(6.4, 8.0, 4.0, "stone", false, createDomElement);
    expect(g.classList.contains("ce-gate-decoration--stone")).toBe(true);
    const floors = g.querySelectorAll(".ce-gate-stone-floor");
    const merlons = g.querySelectorAll(".ce-gate-stone-merlons");
    const portcullis = g.querySelector(".ce-gate-stone-portcullis");
    const overpass = g.querySelector(".ce-gate-stone-overpass");

    expect(floors.length).toBe(2);
    expect(merlons.length).toBe(2);
    expect(portcullis).not.toBeNull();
    expect(overpass).not.toBeNull();
  });
});

describe("renderEditorSvg towers and gates integration", () => {
  it("decorates towers and gates with appropriate material decorations", () => {
    const wall = makeWallGroup({
      id: "wood-wall",
      wallMaterial: "wood",
      segments: [
        { edgeId: "e1", forward: true },
        { edgeId: "e2", forward: true }
      ],
      style: { widthMeters: 3.0, color: "#634327" }
    });
    const doc: CityDocument = {
      appearance: "town",
      frame: { origin: [-100, -100], widthMeters: 200, heightMeters: 200, extentMeters: 200, blockSizeMeters: 20 },
      mesh: {
        vertices: {
          v1: { id: "v1", point: [-60, 0], locked: false },
          v2: { id: "v2", point: [0, 0], locked: false },
          v3: { id: "v3", point: [60, 0], locked: false }
        },
        edges: {
          e1: { id: "e1", a: "v1", b: "v2", leftFace: null, rightFace: null, locked: false },
          e2: { id: "e2", a: "v2", b: "v3", leftFace: null, rightFace: null, locked: false }
        },
        faces: {}
      },
      featureGroups: [wall],
      gates: [{ id: "g1", vertexId: "v2", locked: false }],
      elements: [{ id: "plz", kind: "plaza", faceIds: [], point: [0, -40], sizeMeters: 20 }]
    };

    const svg = renderEditorSvg(doc, "select", { faceId: null, edgeId: null, vertexId: null }, "0 0 500 500", 1);
    const gateWood = svg.querySelector(".ce-gate-decoration--wood");
    expect(gateWood).not.toBeNull();
  });
});

describe("closed wall offsets", () => {
  it.each([3, -3])("keeps the closing point aligned for offset %s", offset => {
    const run: Point[] = [
      [10, 10],
      [20, 10],
      [20, 20],
      [10, 20],
      [10, 10]
    ];
    const shifted = offsetPolyline(run, offset, [0, 0]);
    expect(shifted.at(-1)).toEqual(shifted[0]);
    expect(Math.hypot(shifted[0][0] - run[0][0], shifted[0][1] - run[0][1])).toBeLessThanOrEqual(
      Math.abs(offset) * 1.8
    );
  });
});

describe("wall offset direction", () => {
  it("uses the requested distance for inward rails", () => {
    expect(
      offsetPolyline(
        [
          [10, 0],
          [10, 20]
        ],
        -2,
        [0, 10]
      )
    ).toEqual([
      [8, 0],
      [8, 20]
    ]);
  });

  it.each([false, true])("offsets tower outlines toward their own interior (reversed=%s)", reversed => {
    const square: Point[] = [
      [10, 10],
      [20, 10],
      [20, 20],
      [10, 20],
      [10, 10]
    ];
    const run = reversed ? [...square].reverse() : square;
    const inset = offsetPolyline(run, -2, [0, 0]);
    for (const [x, y] of inset) {
      expect(x).toBeGreaterThan(10);
      expect(x).toBeLessThan(20);
      expect(y).toBeGreaterThan(10);
      expect(y).toBeLessThan(20);
    }
    expect(inset.at(-1)).toEqual(inset[0]);
  });
});

describe("outwork wall interior", () => {
  it("uses the court interior for the inner rail instead of the town center", () => {
    const wall = makeWallGroup({ wallMaterial: "stone" });
    const run: Point[] = [
      [10, 0],
      [10, 20]
    ];
    const structure = renderWallStructure(makeDoc(wall), wall, run, createDomElement, [20, 10]);
    const rail = structure.querySelector(".ce-wall-stone-inner-rail");
    const geom = resolveWallGeometry(4, "stone");
    const x = 10 + (4 - geom.innerWallWidth) / 2;
    expect(rail?.getAttribute("d")).toBe(`M ${x} 0 L ${x} -20`);
  });
});
