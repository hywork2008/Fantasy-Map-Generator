import { describe, expect, it } from "vitest";
import { createDocument } from "../core/document";
import { syncDocumentCemeteries } from "../core/gen/cemeteryLayout";
import { faceNeighbors, faceVertices, meshFromCells } from "../core/mesh";
import type { CityDocument, LandmarkAsset, Point } from "../core/types";
import {
  faceClassName,
  parsePickInfo,
  renderCemeteries,
  renderEditorSvg,
  renderFaceWardLandmark,
  renderHoverOverlay,
  renderMeasureOverlay,
  renderStandaloneCitySvg,
  selectionLabelFontSize,
  serializeCitySvg,
  vertexHandleRadius
} from "./svg";

describe("generated natural ocean shore", () => {
  it("paints a land-side beach for ocean, while leaving lake shores alone", () => {
    const mesh = meshFromCells([
      {
        id: 0,
        polygon: [
          [0, 0],
          [50, 0],
          [50, 100],
          [0, 100]
        ],
        site: [25, 50],
        centroid: [25, 50],
        neighbors: [1],
        onBorder: true
      },
      {
        id: 1,
        polygon: [
          [50, 0],
          [100, 0],
          [100, 100],
          [50, 100]
        ],
        site: [75, 50],
        centroid: [75, 50],
        neighbors: [0],
        onBorder: true
      }
    ]);
    mesh.faces.f0.properties.ward = "empty";
    mesh.faces.f1.properties.water = "sea";
    const doc: CityDocument = {
      format: "fmg-city-editor",
      version: 1,
      gridKind: "evolution",
      appearance: "town",
      coastalOceanFaceIds: ["f1"],
      mesh,
      frame: { extentMeters: 100, cityRadiusMeters: 30, blockSizeMeters: 50 },
      featureGroups: [],
      gates: [],
      elements: []
    };
    const selection = { faceId: null, edgeId: null, vertexId: null, groupId: null };
    const ocean = renderEditorSvg(doc, "select", selection, "0 0 100 100", 1);
    expect(ocean.querySelectorAll('[data-shore-kind="beach"]').length).toBeGreaterThan(0);
    doc.coastalOceanFaceIds = ["f0"];
    const staleOcean = renderEditorSvg(doc, "select", selection, "0 0 100 100", 1);
    expect(staleOcean.querySelectorAll(".ce-natural-shore path")).toHaveLength(0);
    doc.coastalOceanFaceIds = ["f1"];
    mesh.faces.f0.properties.ward = "castle";
    const castle = renderEditorSvg(doc, "select", selection, "0 0 100 100", 1);
    expect(castle.querySelectorAll('[data-shore-kind="fortified"]').length).toBeGreaterThan(0);
    expect(castle.querySelectorAll('[data-shore-kind="beach"]')).toHaveLength(0);
    mesh.faces.f0.properties.ward = "merchant";
    mesh.faces.f0.properties.settlement = "core";
    const town = renderEditorSvg(doc, "select", selection, "0 0 100 100", 1);
    expect(town.querySelectorAll('[data-shore-kind="revetment"]').length).toBeGreaterThan(0);
    expect(town.querySelectorAll('[data-shore-kind="beach"]')).toHaveLength(0);
    mesh.faces.f0.properties.ward = "harbor";
    const harbor = renderEditorSvg(doc, "select", selection, "0 0 100 100", 1);
    expect(harbor.querySelectorAll(".ce-natural-shore path")).toHaveLength(0);
    doc.coastalOceanFaceIds = [];
    const lake = renderEditorSvg(doc, "select", selection, "0 0 100 100", 1);
    expect(lake.querySelectorAll(".ce-natural-shore path")).toHaveLength(0);
  });
});

describe("extramural trails", () => {
  it("shows the outer access network even before houses occupy it, without adding core centrelines", () => {
    const polygon: Point[] = [
      [0, 0],
      [120, 0],
      [120, 120],
      [0, 120]
    ];
    const mesh = meshFromCells([
      { id: 0, polygon, site: [60, 60], centroid: [60, 60], neighbors: [], onBorder: false }
    ]);
    const face = mesh.faces.f0;
    Object.assign(face.properties, { water: "land", buildable: true, ward: "empty", settlement: "outskirts" });
    const doc: CityDocument = {
      format: "fmg-city-editor",
      version: 1,
      gridKind: "evolution",
      appearance: "town",
      mesh,
      frame: { extentMeters: 200, cityRadiusMeters: 60, blockSizeMeters: 50 },
      featureGroups: [
        {
          id: "road",
          kind: "road",
          name: "Road",
          segments: [face.boundary[0]],
          style: { widthMeters: 6, color: "black" },
          locked: false
        }
      ],
      gates: [],
      elements: []
    };
    const selection = { faceId: null, edgeId: null, vertexId: null, groupId: null };
    const outer = renderEditorSvg(doc, "select", selection, "0 0 120 120", 1);
    expect(outer.querySelectorAll(".ce-building")).toHaveLength(0);
    expect(outer.querySelectorAll(".ce-infill-trail").length).toBeGreaterThan(0);
    for (const trail of outer.querySelectorAll(".ce-infill-trail")) {
      expect(trail.getAttribute("data-infill-face")).toBe("f0");
      expect(Number(trail.getAttribute("stroke-width"))).toBeLessThan(1);
    }
    face.properties.settlement = "core";
    const core = renderEditorSvg(doc, "select", selection, "0 0 120 120", 1);
    expect(core.querySelectorAll(".ce-infill-trail")).toHaveLength(0);
    expect(core.querySelectorAll(".ce-infill-lane").length).toBeGreaterThan(0);

    doc.layout = "classic";
    const classicCore = renderEditorSvg(doc, "select", selection, "0 0 120 120", 1);
    expect(classicCore.querySelectorAll(".ce-infill-trail").length).toBeGreaterThan(0);
    for (const trail of classicCore.querySelectorAll(".ce-infill-trail")) {
      expect(trail.getAttribute("data-infill-face")).toBe("f0");
      expect(Number(trail.getAttribute("stroke-width"))).toBeLessThan(1);
    }

    doc.layout = "organic";
    const organicCore = renderEditorSvg(doc, "select", selection, "0 0 120 120", 1);
    expect(organicCore.querySelectorAll(".ce-infill-trail").length).toBeGreaterThan(0);
    for (const trail of organicCore.querySelectorAll(".ce-infill-trail")) {
      expect(trail.getAttribute("data-infill-face")).toBe("f0");
      expect(Number(trail.getAttribute("stroke-width"))).toBeLessThan(1);
    }

    const concealed = renderEditorSvg(
      doc,
      "select",
      selection,
      "0 0 120 120",
      1,
      false,
      null,
      null,
      null,
      null,
      false,
      false,
      undefined,
      false,
      true
    );
    expect(concealed.querySelectorAll(".ce-infill-lane")).toHaveLength(0);
    expect(concealed.querySelectorAll(".ce-infill-trail")).toHaveLength(0);
  });
});

describe("river bridge deck", () => {
  it("draws a butt-capped deck as long as the river and stops the road at the bank", () => {
    const document: CityDocument = {
      format: "fmg-city-editor",
      version: 1,
      appearance: "town",
      frame: { extentMeters: 200, cityRadiusMeters: 80, blockSizeMeters: 20 },
      mesh: {
        vertices: {
          s: { id: "s", point: [0, -30], locked: false },
          m: { id: "m", point: [0, 0], locked: false },
          n: { id: "n", point: [0, 30], locked: false },
          a: { id: "a", point: [-40, 0], locked: false },
          b: { id: "b", point: [40, 0], locked: false }
        },
        edges: {
          r1: { id: "r1", a: "s", b: "m", leftFace: null, rightFace: null, locked: false },
          r2: { id: "r2", a: "m", b: "n", leftFace: null, rightFace: null, locked: false },
          e1: { id: "e1", a: "a", b: "m", leftFace: null, rightFace: null, locked: false },
          e2: { id: "e2", a: "m", b: "b", leftFace: null, rightFace: null, locked: false }
        },
        faces: {}
      },
      featureGroups: [
        {
          id: "river",
          kind: "river",
          name: "River",
          locked: false,
          style: { widthMeters: 10, color: "#85857d" },
          vertices: ["s", "m", "n"],
          source: null,
          mouth: null
        },
        {
          id: "road",
          kind: "road",
          name: "Road",
          locked: false,
          style: { widthMeters: 6, color: "#735238" },
          segments: [
            { edgeId: "e1", forward: true },
            { edgeId: "e2", forward: true }
          ]
        }
      ],
      gates: [],
      elements: []
    };
    const svg = renderEditorSvg(
      document,
      "select",
      { faceId: null, edgeId: null, vertexId: null, groupId: null },
      "-50 -50 100 100",
      1
    );
    const deck = svg.querySelector(".ce-bridge-deck");
    const outline = svg.querySelector(".ce-bridge-outline");
    expect(deck?.getAttribute("stroke-linecap")).toBe("butt");
    expect(outline?.getAttribute("stroke-linecap")).toBe("butt");
    expect(deck?.getAttribute("stroke")).toBe("#d5cfbf");
    expect(Number(outline?.getAttribute("stroke-width"))).toBeGreaterThan(Number(deck?.getAttribute("stroke-width")));
    const deckLength = pathLength(deck?.getAttribute("d") ?? "");
    expect(deckLength).toBeGreaterThan(10);
    expect(deckLength).toBeLessThan(14);
    const roads = [...svg.querySelectorAll(".ce-feature--road")].map(node => pathPoints(node.getAttribute("d") ?? ""));
    expect(roads.length).toBeGreaterThan(0);
    for (const points of roads) {
      const xs = points.map(point => point[0]);
      const crosses = Math.min(...xs) < -1 && Math.max(...xs) > 1;
      expect(crosses).toBe(false);
    }
    expect(svg.querySelectorAll(".ce-bridge-deck")).toHaveLength(1);
  });
});

function pathPoints(d: string): Point[] {
  const nums = d.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
  const points: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) points.push([nums[i], nums[i + 1]]);
  return points;
}

function pathLength(d: string): number {
  const points = pathPoints(d);
  let length = 0;
  for (let i = 1; i < points.length; i++)
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  return length;
}

describe("vertexHandleRadius", () => {
  it("keeps r=2 at every zoom level", () => {
    expect(vertexHandleRadius(1)).toBe(2);
    expect(vertexHandleRadius(20)).toBe(2);
    expect(vertexHandleRadius(10.5)).toBe(2);
    expect(vertexHandleRadius(100)).toBe(2);
  });
});

describe("dragging vertex handles", () => {
  it("keeps both the dragged vertex and its merge candidate visible", () => {
    const document = createDocument("drag-handles", 400);
    const face = Object.values(document.mesh.faces)[0];
    const [draggedVertexId, candidateVertexId] = face.boundary.map(ref =>
      ref.forward ? document.mesh.edges[ref.edgeId].a : document.mesh.edges[ref.edgeId].b
    );
    const selection = {
      faceId: null,
      edgeId: null,
      vertexId: draggedVertexId,
      groupId: null,
      hoverVertexId: candidateVertexId
    };

    const svg = renderEditorSvg(document, "select", selection, "-200 -200 400 400", 1);
    // Hover marks render into the dedicated overlay layer, as they do live.
    svg.querySelector(".ce-hover-layer")?.append(...renderHoverOverlay(document, selection, 1));

    expect(svg.querySelectorAll(".ce-vertex")).toHaveLength(2);
    expect(svg.querySelector(`[data-vertex="${draggedVertexId}"]`)?.classList.contains("ce-selected")).toBe(true);
    expect(svg.querySelector(`[data-vertex="${candidateVertexId}"]`)?.classList.contains("ce-hover-vertex")).toBe(true);
  });
});

describe("renderHoverOverlay", () => {
  it("keeps hover marks out of the base render so pointermove can repaint just the overlay", () => {
    const document = createDocument("hover-overlay", 400);
    const vertexId = Object.keys(document.mesh.vertices)[0];
    const selection = { faceId: null, edgeId: null, vertexId: null, groupId: null, hoverVertexId: vertexId };

    const base = renderEditorSvg(document, "select", selection, "-200 -200 400 400", 1);
    expect(base.querySelector(".ce-hover-vertex")).toBeNull();
    expect(base.querySelector(".ce-hover-layer")).toBeTruthy();

    const [circle] = renderHoverOverlay(document, selection, 1);
    expect(circle?.tagName).toBe("circle");
    expect(circle?.getAttribute("data-vertex")).toBe(vertexId);
    expect(circle?.classList.contains("ce-hover-vertex")).toBe(true);
  });

  it("emits nothing when no hover target is set", () => {
    const document = createDocument("hover-overlay-empty", 400);
    const selection = { faceId: null, edgeId: null, vertexId: null, groupId: null };
    expect(renderHoverOverlay(document, selection, 1)).toHaveLength(0);
  });
});

describe("Ward landmarks", () => {
  it("renders a Ward landmark as centred SVG geometry instead of a font glyph", () => {
    const document = createDocument("ward-marker", 400);
    const face = Object.values(document.mesh.faces)[0];
    face.properties.ward = "harbor";

    const svg = renderEditorSvg(
      document,
      "select",
      { faceId: null, edgeId: null, vertexId: null, groupId: null },
      "-200 -200 400 400",
      1
    );
    const harbor = svg.querySelector<SVGGElement>(".ce-ward-landmarks .ce-element--harbor");

    expect(harbor).toBeTruthy();
    expect(harbor?.getAttribute("transform")).toMatch(/^translate\(/);
    expect(harbor?.querySelector("text")).toBeNull();
    expect(harbor?.querySelectorAll("path, circle").length).toBeGreaterThan(1);
  });

  it("hides gc:harbor mark in town view when showBlockMesh is OFF, but displays it when showBlockMesh is ON", () => {
    const document = createDocument("town-harbor", 400);
    document.appearance = "town";
    document.elements.push({
      id: "gc:harbor",
      kind: "harbor",
      faceIds: [],
      point: [0, 0],
      locked: false
    });
    document.elements.push({
      id: "gc:ship-0",
      kind: "ship",
      faceIds: [],
      point: [10, 10],
      sizeMeters: 25,
      shipType: "medium",
      locked: false
    });

    const emptySel = { faceId: null, edgeId: null, vertexId: null, groupId: null };

    // 1. 街区の編集表示がOFF (showBlockMesh = false) の場合:
    // town === true となり、gc:harbor の港マークは非表示、船は表示されること
    const svgTown = renderEditorSvg(
      document,
      "select",
      emptySel,
      "-200 -200 400 400",
      1,
      null,
      null,
      null,
      null,
      false // showBlockMesh = false
    );
    expect(svgTown.querySelectorAll(".ce-element--harbor").length).toBe(0);
    expect(svgTown.querySelectorAll(".ce-ship").length).toBe(1);

    // 2. 街区の編集表示がON (showBlockMesh = true) の場合:
    // town === false となり、gc:harbor の港マークが表示され、船も表示されること
    const svgMesh = renderEditorSvg(
      document,
      "select",
      emptySel,
      "-200 -200 400 400",
      1,
      null,
      null,
      null,
      null,
      true // showBlockMesh = true
    );
    expect(svgMesh.querySelectorAll(".ce-element--harbor").length).toBe(1);
    expect(svgMesh.querySelectorAll(".ce-ship").length).toBe(1);
  });
});

describe("faceClassName / renderFaceWardLandmark", () => {
  // CityEditorPage patches a single painted face's <path>/landmark with these
  // two helpers instead of a full renderEditorSvg() pass (see
  // patchFaceRender). They must keep producing exactly what the bulk render
  // would have, or a Large-mesh ward paint would silently drift from a full
  // redraw's output.
  it("matches the class renderEditorSvg assigns each face's <path>", () => {
    const document = createDocument("face-class-name", 400);
    const [a, b] = Object.values(document.mesh.faces);
    a.properties.ward = "market";
    b.properties.water = "sea";
    b.properties.elevation = 0;

    const svg = renderEditorSvg(
      document,
      "select",
      { faceId: b.id, edgeId: null, vertexId: null, groupId: null },
      "-200 -200 400 400",
      1
    );
    const pathA = svg.querySelector(`.ce-face[data-face="${a.id}"]`);
    const pathB = svg.querySelector(`.ce-face[data-face="${b.id}"]`);

    expect(pathA?.getAttribute("class")).toBe(faceClassName(a, false));
    expect(pathB?.getAttribute("class")).toBe(faceClassName(b, true));
  });

  it("matches the marker renderEditorSvg builds for a landmark Ward, keyed by ward-<faceId>", () => {
    const document = createDocument("face-landmark-match", 400);
    const face = Object.values(document.mesh.faces)[0];
    face.properties.ward = "park";

    const svg = renderEditorSvg(
      document,
      "select",
      { faceId: null, edgeId: null, vertexId: null, groupId: null },
      "-200 -200 400 400",
      1
    );
    const bulkMarker = svg.querySelector(`.ce-ward-landmarks [data-element="ward-${face.id}"]`);
    const patched = renderFaceWardLandmark(document.mesh, face);

    expect(bulkMarker).toBeTruthy();
    expect(patched).toBeTruthy();
    expect(patched?.getAttribute("class")).toBe(bulkMarker?.getAttribute("class"));
    expect(patched?.getAttribute("transform")).toBe(bulkMarker?.getAttribute("transform"));
  });

  it("omits a landmark for a non-landmark Ward or a non-land cell", () => {
    const document = createDocument("face-landmark-omit", 400);
    const [plain, submerged] = Object.values(document.mesh.faces);
    plain.properties.ward = "empty";
    submerged.properties.ward = "market";
    submerged.properties.water = "sea";

    expect(renderFaceWardLandmark(document.mesh, plain)).toBeNull();
    expect(renderFaceWardLandmark(document.mesh, submerged)).toBeNull();
  });

  it("uses r=7.5 halo for all city element markers (half of the original r=15)", () => {
    const document = createDocument("all-markers-half-size", 400);
    const [facePark, faceMarket] = Object.values(document.mesh.faces);
    facePark.properties.ward = "park";
    faceMarket.properties.ward = "market";
    const vertex = Object.values(document.mesh.vertices)[0];
    document.gates.push({ id: 99, vertexId: vertex.id });

    const svg = renderEditorSvg(
      document,
      "select",
      { faceId: null, edgeId: null, vertexId: null, groupId: null },
      "-200 -200 400 400",
      1
    );

    const parkHalo = svg.querySelector(`.ce-ward-landmarks [data-element="ward-${facePark.id}"] .ce-element-halo`);
    expect(parkHalo?.getAttribute("r")).toBe("7.5");

    const gateHalo = svg.querySelector(`.ce-gates [data-element="99"] .ce-element-halo`);
    expect(gateHalo?.getAttribute("r")).toBe("7.5");

    const marketHalo = svg.querySelector(`.ce-ward-landmarks [data-element="ward-${faceMarket.id}"] .ce-element-halo`);
    expect(marketHalo?.getAttribute("r")).toBe("7.5");
  });
});

describe("town gatehouse", () => {
  it("draws square flank towers and a semicircular plaza on both sides of the gate", () => {
    const document: CityDocument = {
      format: "fmg-city-editor",
      version: 1,
      appearance: "town",
      frame: { extentMeters: 200, cityRadiusMeters: 80, blockSizeMeters: 20 },
      mesh: {
        vertices: {
          w1: { id: "w1", point: [-40, 0], locked: false },
          g: { id: "g", point: [0, 0], locked: false },
          w2: { id: "w2", point: [40, 0], locked: false }
        },
        edges: {
          wallA: { id: "wallA", a: "w1", b: "g", leftFace: null, rightFace: null, locked: false },
          wallB: { id: "wallB", a: "g", b: "w2", leftFace: null, rightFace: null, locked: false }
        },
        faces: {}
      },
      featureGroups: [
        {
          id: "wall-1",
          kind: "wall",
          name: "Wall",
          segments: [
            { edgeId: "wallA", forward: true },
            { edgeId: "wallB", forward: true }
          ],
          style: { widthMeters: 10, color: "#342a22" },
          locked: false
        }
      ],
      gates: [{ id: "gate-1", vertexId: "g", locked: false }],
      elements: [{ id: "plaza", kind: "plaza", faceIds: [], point: [0, 50], locked: false }]
    };
    const svg = renderEditorSvg(
      document,
      "select",
      { faceId: null, edgeId: null, vertexId: null, groupId: null },
      "-100 -100 200 200",
      1
    );
    const towers = [...svg.querySelectorAll(".ce-gate-tower")];
    expect(towers).toHaveLength(2);
    for (const tower of towers) {
      expect(tower.getAttribute("width")).toBe(tower.getAttribute("height"));
      expect(Number(tower.getAttribute("width"))).toBeCloseTo(16);
    }
    const plazas = [...svg.querySelectorAll(".ce-gate-plaza")].map(plaza => plaza.getAttribute("d"));
    expect(plazas).toHaveLength(2);
    expect(plazas.some(d => d?.includes(" 0 0 1 "))).toBe(true);
    expect(plazas.some(d => d?.includes(" 0 0 0 "))).toBe(true);
    const transform = svg.querySelector(".ce-town-gate")?.getAttribute("transform") ?? "";
    // Local +Y is townward. With the curtain along +X and the town at +Y, the
    // screen matrix sends local +Y to math +Y (screen −Y).
    expect(transform.startsWith("matrix(")).toBe(true);
    const parts = transform
      .slice("matrix(".length, -1)
      .split(/[\s,]+/)
      .map(Number);
    expect(parts[2]).toBeCloseTo(0);
    expect(parts[3]).toBeCloseTo(-1);
  });
});

describe("face selection labels", () => {
  it("keeps labels at the small-map display size when an imported map has a larger extent", () => {
    expect(selectionLabelFontSize(1200, 1)).toBe(14);
    expect(selectionLabelFontSize(3030, 1)).toBe(35.35);
    expect(selectionLabelFontSize(3030, 2)).toBe(17.675);
  });

  it("labels the selected cell's vertices and its surrounding cells", () => {
    const document = createDocument("selection-labels", 400);
    const selectedFace = Object.values(document.mesh.faces).find(
      face => faceNeighbors(document.mesh, face.id).length > 0
    );
    expect(selectedFace).toBeDefined();
    if (!selectedFace) return;

    const svg = renderEditorSvg(
      document,
      "select",
      { faceId: selectedFace.id, edgeId: null, vertexId: null, groupId: null },
      "-200 -200 400 400",
      1,
      true
    );
    const vertexLabels = [...svg.querySelectorAll(".ce-selection-vertex-label")].map(label => label.textContent);
    const faceLabels = [...svg.querySelectorAll(".ce-selection-face-label")].map(label => label.textContent);

    expect(vertexLabels.sort()).toEqual(faceVertices(document.mesh, selectedFace).sort());
    expect(faceLabels.sort()).toEqual([selectedFace.id, ...faceNeighbors(document.mesh, selectedFace.id)].sort());
  });

  it("hides selection labels until the display option is enabled", () => {
    const document = createDocument("selection-labels-hidden", 400);
    const face = Object.values(document.mesh.faces)[0];
    const svg = renderEditorSvg(
      document,
      "select",
      { faceId: face.id, edgeId: null, vertexId: null, groupId: null },
      "-200 -200 400 400",
      1
    );

    expect(svg.querySelectorAll(".ce-selection-label")).toHaveLength(0);
  });

  it("moves a vertex label away from a nearby vertex", () => {
    const document = createDocument("nearby-vertex-label", 400);
    const face = Object.values(document.mesh.faces)[0];
    const [vertexId, nearbyVertexId] = faceVertices(document.mesh, face);
    document.mesh.vertices[nearbyVertexId].point = [
      document.mesh.vertices[vertexId].point[0] + 1,
      document.mesh.vertices[vertexId].point[1]
    ];

    const svg = renderEditorSvg(
      document,
      "select",
      { faceId: face.id, edgeId: null, vertexId: null, groupId: null },
      "-200 -200 400 400",
      1,
      true
    );
    const label = [...svg.querySelectorAll<SVGTextElement>(".ce-selection-vertex-label")].find(
      candidate => candidate.textContent === vertexId
    );

    expect(label).toBeDefined();
    expect(Number(label?.getAttribute("x"))).not.toBe(document.mesh.vertices[vertexId].point[0]);
  });
});

describe("generated temple footprint", () => {
  it("draws a Tiny church larger than a house plot, and a Large church larger still", () => {
    const selection = { faceId: null, edgeId: null, vertexId: null, groupId: null };
    const tiny = createDocument("temple-tiny", 600);
    tiny.appearance = "town";
    tiny.elements.push({
      id: "gc:temple",
      kind: "temple",
      faceIds: [],
      point: [0, 0],
      locked: false
    });
    const tinyRect = renderEditorSvg(tiny, "select", selection, "-200 -200 400 400", 1).querySelector(
      '[data-element="gc:temple"]'
    );
    expect(tinyRect).not.toBeNull();
    expect(Number(tinyRect?.getAttribute("width"))).toBe(28);
    expect(Number(tinyRect?.getAttribute("height"))).toBe(16);

    const large = createDocument("temple-large", 4800);
    large.appearance = "town";
    large.elements.push({
      id: "gc:temple",
      kind: "temple",
      faceIds: [],
      point: [0, 0],
      sizeMeters: 68,
      locked: false
    });
    const largeRect = renderEditorSvg(large, "select", selection, "-200 -200 400 400", 1).querySelector(
      '[data-element="gc:temple"]'
    );
    expect(Number(largeRect?.getAttribute("width"))).toBe(68);
    expect(Number(largeRect?.getAttribute("height"))).toBe(36);
  });

  it("rotates the church to match the stored long-axis angle", () => {
    const selection = { faceId: null, edgeId: null, vertexId: null, groupId: null };
    const document = createDocument("temple-rotated", 600);
    document.appearance = "town";
    document.elements.push({
      id: "gc:temple",
      kind: "temple",
      faceIds: [],
      point: [10, 5],
      rotation: Math.PI / 4,
      locked: false
    });
    const rect = renderEditorSvg(document, "select", selection, "-200 -200 400 400", 1).querySelector(
      '[data-element="gc:temple"]'
    );
    expect(rect?.getAttribute("transform")).toBe("translate(10 -5) rotate(-45)");
  });
});

describe("cemetery precinct rendering", () => {
  it("updates the cemetery layer after a ward is painted and erased", () => {
    const document = createDocument("cemetery-layer", 600);
    document.mesh = meshFromCells([
      {
        id: 0,
        polygon: [
          [0, 0],
          [60, 0],
          [60, 60],
          [0, 60]
        ],
        site: [30, 30],
        centroid: [30, 30],
        neighbors: [],
        onBorder: false
      }
    ]);
    const face = Object.values(document.mesh.faces)[0];
    face.properties.ward = "cemetery";
    syncDocumentCemeteries(document, [face.id]);
    const painted = renderCemeteries(document);
    expect(painted.children).toHaveLength(1);
    face.properties.ward = "empty";
    syncDocumentCemeteries(document, [face.id]);
    const erased = renderCemeteries(document);
    expect(erased.children).toHaveLength(0);
  });

  it("renders cemetery precinct with stone walls, courtyards, paths, parts, and yew trees", () => {
    const selection = { faceId: null, edgeId: null, vertexId: null, groupId: null };
    const document = createDocument("cemetery-render-test", 600);
    document.appearance = "town";

    // Set face 0 to cemetery ward
    const f0 = Object.values(document.mesh.faces)[0];
    f0.properties.ward = "cemetery";

    const svg = renderEditorSvg(document, "select", selection, "-200 -200 400 400", 1);
    const cemeteryGroup = svg.querySelector<SVGGElement>(".ce-cemeteries");
    expect(cemeteryGroup).not.toBeNull();

    // Verify precinct components are rendered
    expect(cemeteryGroup?.querySelectorAll("path").length).toBeGreaterThan(0);
    expect(cemeteryGroup?.querySelectorAll("circle").length).toBeGreaterThan(0);
  });

  it("renders suburban pre-industrial burial fields with headstones and grave slabs on narrow parcels", () => {
    const selection = { faceId: null, edgeId: null, vertexId: null, groupId: null };
    const document = createDocument("cemetery-suburban-test", 600);
    document.appearance = "town";
    document.historicalPeriod = "preIndustrialEra";

    // Narrow parcel: 12m wide x 35m long (too narrow for cathedral frame, perfect for burial field)
    document.mesh = meshFromCells([
      {
        id: 0,
        polygon: [
          [10, 10],
          [22, 10],
          [22, 45],
          [10, 45]
        ],
        site: [16, 27],
        centroid: [16, 27],
        neighbors: [],
        onBorder: false
      }
    ]);
    const f0 = Object.values(document.mesh.faces)[0];
    f0.properties.ward = "cemetery";
    syncDocumentCemeteries(document, [f0.id]);

    const svg = renderEditorSvg(document, "select", selection, "-50 -50 150 150", 1);
    const cemeteryGroup = svg.querySelector<SVGGElement>(".ce-cemeteries");
    expect(cemeteryGroup).not.toBeNull();

    // Verify headstones (rect elements with stroke #49453c) and slabs are rendered
    const rects = cemeteryGroup?.querySelectorAll("rect") ?? [];
    expect(rects.length).toBeGreaterThanOrEqual(4);

    // Verify burial field form was assigned
    expect(document.cemeteries?.[0].form).toBe("field");
    expect(document.cemeteries?.[0].parts.some(p => p.role === "graves")).toBe(true);
  });
});

describe("renderEditorSvg data-pick metadata", () => {
  it("attaches parseable metadata to cells, edges, and features in select mode", () => {
    const document = createDocument("pick-metadata", 400);
    const selection = { faceId: null, edgeId: null, vertexId: null, groupId: null };
    const svg = renderEditorSvg(document, "select", selection, "-200 -200 400 400", 1);

    const cell = svg.querySelector<SVGPathElement>(".ce-cells path[data-pick]");
    expect(cell).not.toBeNull();
    const cellInfo = parsePickInfo(cell?.getAttribute("data-pick") ?? null);
    expect(cellInfo?.kind).toBe("cell");
    expect(cellInfo?.layer).toBe("cells");
    expect(cellInfo?.id).toBe(cell?.getAttribute("data-face"));

    const edge = svg.querySelector<SVGPathElement>(".ce-edges path[data-pick]");
    expect(edge).not.toBeNull();
    const edgeInfo = parsePickInfo(edge?.getAttribute("data-pick") ?? null);
    expect(edgeInfo?.kind).toBe("edge");
    expect(edgeInfo?.layer).toBe("edges");
    expect(edgeInfo?.id).toBe(edge?.getAttribute("data-edge"));
  });

  it("handles invalid or null raw data-pick cleanly", () => {
    expect(parsePickInfo(null)).toBeNull();
    expect(parsePickInfo("")).toBeNull();
    expect(parsePickInfo("not-json")).toBeNull();
  });
});

describe("renderMeasureOverlay", () => {
  it("returns empty array when from is null", () => {
    expect(renderMeasureOverlay(null, null, 1)).toEqual([]);
  });

  it("renders a start point circle when from is set but to is null", () => {
    const nodes = renderMeasureOverlay([10, 20], null, 1);
    expect(nodes).toHaveLength(1);
    const circle = nodes[0] as SVGCircleElement;
    expect(circle.getAttribute("class")).toContain("ce-measure-point--start");
    expect(circle.getAttribute("cx")).toBe("10");
    expect(circle.getAttribute("cy")).toBe("-20");
  });

  it("renders a line, two point circles, and distance label when from and to are set", () => {
    const nodes = renderMeasureOverlay([0, 0], [100, 200], 1, "223.6 m");
    expect(nodes).toHaveLength(4);

    const line = nodes[0] as SVGLineElement;
    expect(line.getAttribute("class")).toBe("ce-measure-line");
    expect(line.getAttribute("x1")).toBe("0");
    expect(line.getAttribute("y1")).toBe("0");
    expect(line.getAttribute("x2")).toBe("100");
    expect(line.getAttribute("y2")).toBe("-200");

    const p1 = nodes[1] as SVGCircleElement;
    expect(p1.getAttribute("class")).toBe("ce-measure-point");
    expect(p1.getAttribute("cx")).toBe("0");
    expect(p1.getAttribute("cy")).toBe("0");

    const p2 = nodes[2] as SVGCircleElement;
    expect(p2.getAttribute("class")).toBe("ce-measure-point");
    expect(p2.getAttribute("cx")).toBe("100");
    expect(p2.getAttribute("cy")).toBe("-200");

    const text = nodes[3] as SVGTextElement;
    expect(text.getAttribute("class")).toBe("ce-measure-label");
    expect(text.getAttribute("x")).toBe("50");
    expect(text.getAttribute("y")).toBe("-100");
    expect(text.textContent).toBe("223.6 m");
  });
});

describe("renderEditorSvg showGridLines", () => {
  it("applies ce-svg--show-grid class when showGridLines is true", () => {
    const document = createDocument("grid-lines", 400);
    const selection = { faceId: null, edgeId: null, vertexId: null, groupId: null };

    const svgNormal = renderEditorSvg(document, "select", selection, "-200 -200 400 400", 1);
    expect(svgNormal.classList.contains("ce-svg--show-grid")).toBe(false);

    const svgGrid = renderEditorSvg(
      document,
      "select",
      selection,
      "-200 -200 400 400",
      1,
      false,
      null,
      null,
      null,
      null,
      false,
      true
    );
    expect(svgGrid.classList.contains("ce-svg--show-grid")).toBe(true);
  });
});

describe("renderStandaloneCitySvg / serializeCitySvg", () => {
  it("embeds normalized landmark art without source links or scripts", () => {
    const document = createDocument("landmark-svg", 400);
    const asset: LandmarkAsset = {
      id: "plan",
      revision: "1",
      name: "Plan",
      historicalPhase: "test",
      referenceSizeMeters: [10, 10],
      dimensionSource: "test",
      provenanceId: "test",
      footprint: [
        {
          outer: [
            [-5, -5],
            [5, -5],
            [5, 5],
            [-5, 5]
          ],
          holes: []
        }
      ],
      minimumSite: [
        {
          outer: [
            [-6, -6],
            [6, -6],
            [6, 6],
            [-6, 6]
          ],
          holes: []
        }
      ],
      entrances: [],
      renderSvg:
        '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L5 0L5 5Z" fill="#123456"/><script>alert(1)</script><image href="https://example.com/x.png"/></svg>'
    };
    document.version = 3;
    document.landmarkAssets = [asset];
    document.landmarks = [
      {
        id: "one",
        assetId: "plan",
        assetRevision: "1",
        position: [20, 30],
        rotation: 0,
        scale: 1,
        site: asset.minimumSite,
        accesses: [],
        locked: false
      }
    ];
    const svg = renderStandaloneCitySvg(document);
    expect(svg.querySelector(".ce-landmark-art path")?.getAttribute("fill")).toBe("#123456");
    expect(svg.querySelector("[data-landmark]")?.getAttribute("data-pick")).toBeNull();
    const editor = renderEditorSvg(
      document,
      "select",
      { faceId: null, edgeId: null, vertexId: null, groupId: null },
      "-200 -200 400 400",
      1
    );
    expect(parsePickInfo(editor.querySelector("[data-landmark]")?.getAttribute("data-pick") ?? null)?.id).toBe("one");
    expect(svg.querySelector(".ce-landmark-art")?.getAttribute("transform")).toContain("20 -30");
    expect(svg.querySelector(".ce-landmark-art script, .ce-landmark-art image")).toBeNull();
  });
  it("creates a standalone SVG with appropriate attributes, background, and embedded style", () => {
    const document = createDocument("standalone-test", 600);
    const svg = renderStandaloneCitySvg(document);

    expect(svg.getAttribute("xmlns")).toBe("http://www.w3.org/2000/svg");
    expect(svg.getAttribute("xmlns:xlink")).toBe("http://www.w3.org/1999/xlink");
    expect(svg.getAttribute("version")).toBe("1.1");
    expect(svg.getAttribute("width")).toBe("600");
    expect(svg.getAttribute("height")).toBe("600");
    expect(svg.getAttribute("viewBox")).toBe("-300 -300 600 600");

    // Defs and style
    const style = svg.querySelector("defs > style");
    expect(style).not.toBeNull();
    expect(style?.textContent).toContain(".ce-building");
    expect(style?.textContent).toContain(".ce-face--land");

    // Background rect
    const bg = svg.querySelector("rect.ce-background");
    expect(bg).not.toBeNull();
    expect(bg?.getAttribute("fill")).toBe("#e1dfd4");
    expect(bg?.getAttribute("width")).toBe("600");
    expect(bg?.getAttribute("height")).toBe("600");

    // Cleaned up layers and data-pick
    expect(svg.querySelectorAll(".ce-hover-layer, .ce-measure-layer, .ce-route-preview-layer")).toHaveLength(0);
    expect(svg.querySelectorAll("[data-pick]")).toHaveLength(0);
  });

  it("applies town background and classes when appearance is town", () => {
    const document = createDocument("town-test", 800);
    document.appearance = "town";
    const svg = renderStandaloneCitySvg(document);

    expect(svg.classList.contains("ce-svg--town")).toBe(true);
    const bg = svg.querySelector("rect.ce-background");
    expect(bg?.getAttribute("fill")).toBe("#d5cfbf");
  });

  it("serializeCitySvg produces a valid XML document string with xml declaration", () => {
    const document = createDocument("xml-test", 500);
    const xml = serializeCitySvg(document);

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n')).toBe(true);
    expect(xml).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(xml).toContain("</svg>");
    expect(xml).toContain('class="ce-background"');
  });

  it("includes xlink:href on image elements for reference images", () => {
    const document = createDocument("ref-test", 400);
    document.referenceImage = {
      href: "data:image/png;base64,fake",
      width: 200,
      height: 200
    };
    const svg = renderStandaloneCitySvg(document);
    const img = svg.querySelector("image");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("href")).toBe("data:image/png;base64,fake");
    expect(img?.getAttribute("xlink:href")).toBe("data:image/png;base64,fake");
  });
});

describe("harbor piers", () => {
  function harborMap(depth?: number): CityDocument {
    const polygons: Point[][] = [
      [
        [0, 0],
        [50, 0],
        [50, 50],
        [0, 50]
      ],
      [
        [50, 0],
        [100, 0],
        [100, 50],
        [50, 50]
      ],
      [
        [0, 50],
        [50, 50],
        [50, 100],
        [0, 100]
      ],
      [
        [50, 50],
        [100, 50],
        [100, 100],
        [50, 100]
      ]
    ];
    const mesh = meshFromCells(
      polygons.map((polygon, id) => ({
        id,
        polygon,
        site: polygon[0],
        centroid: polygon[0],
        neighbors: [],
        onBorder: false
      }))
    );
    for (const id of ["f0", "f2"]) mesh.faces[id].properties.ward = "harbor";
    for (const id of ["f1", "f3"])
      Object.assign(mesh.faces[id].properties, {
        water: "sea",
        elevation: 0,
        depth,
        buildable: false
      });
    return {
      format: "fmg-city-editor",
      version: 2,
      appearance: "town",
      mesh,
      frame: { extentMeters: 200, cityRadiusMeters: 50, blockSizeMeters: 50 },
      featureGroups: [],
      gates: [],
      elements: []
    };
  }

  it("draws rectangular piers per adjacent sea cell without a harbor element", () => {
    const svg = renderStandaloneCitySvg(harborMap());
    const piers = svg.querySelectorAll(".ce-pier");
    expect(piers).toHaveLength(4);
    for (const pier of piers) {
      expect(pier.getAttribute("d")).toMatch(/ Z$/);
      expect(pier.getAttribute("data-depth-m")).toBe("3");
      const numbers = pier
        .getAttribute("d")!
        .match(/-?\d+(?:\.\d+)?/g)!
        .map(Number);
      expect(Math.max(...numbers.filter((_, i) => i % 2 === 0))).toBeLessThan(100);
    }
  });

  it("respects shallow water and draws neither lake piers nor piers beside other wards", () => {
    expect(renderStandaloneCitySvg(harborMap(2.9)).querySelectorAll(".ce-pier")).toHaveLength(0);
    const doc = harborMap(6);
    doc.mesh.faces.f1.properties.water = "lake";
    doc.mesh.faces.f2.properties.ward = "merchant";
    expect(renderStandaloneCitySvg(doc).querySelectorAll(".ce-pier")).toHaveLength(0);
  });

  it("renders harbor cranes, cargo piles, and wide loading yards for ageOfExploration town harbors", async () => {
    const { buildBlockFabric } = await import("../core/gen/blockInfill");
    const rect = (x: number, w: number): Point[] => [
      [x, 0],
      [x + w, 0],
      [x + w, 160],
      [x, 160]
    ];
    const mesh = meshFromCells(
      [rect(-80, 80), rect(0, 160), rect(160, 160)].map((polygon, id) => ({
        id,
        polygon,
        site: polygon[0],
        centroid: polygon[0],
        neighbors: [],
        onBorder: false
      }))
    );
    for (const [i, f] of Object.values(mesh.faces).entries())
      Object.assign(f.properties, {
        ward: i === 0 ? null : i === 1 ? "harbor" : "patriciate",
        water: i === 0 ? "sea" : "land",
        buildable: i !== 0,
        settlement: "core",
        depth: 8
      });
    const roadEdges = Object.values(mesh.edges).filter(e => {
      const a = mesh.vertices[e.a].point,
        b = mesh.vertices[e.b].point;
      return (a[1] === 0 && b[1] === 0 && Math.min(a[0], b[0]) >= 0) || (a[0] === 160 && b[0] === 160);
    });
    const doc: CityDocument = {
      format: "fmg-city-editor",
      version: 2,
      gridKind: "evolution",
      buildingPattern: "medieval",
      appearance: "town",
      historicalPeriod: "ageOfExploration",
      layout: "organic",
      frame: { extentMeters: 1000, cityRadiusMeters: 400, blockSizeMeters: 50 },
      mesh,
      featureGroups: [
        {
          id: "road-entry",
          kind: "road",
          name: "Port road",
          segments: roadEdges.map(e => ({ edgeId: e.id, forward: true })),
          style: { widthMeters: 6, color: "#d5cfbf" },
          locked: false
        }
      ],
      gates: [],
      elements: []
    };
    const fabric = buildBlockFabric(doc);
    expect(fabric.harbor?.cranes?.length).toBeGreaterThan(0);
    expect(fabric.harbor?.cargoPiles?.length).toBeGreaterThan(0);
    const svg = renderStandaloneCitySvg(doc);
    expect(svg.querySelectorAll(".ce-crane").length).toBeGreaterThan(0);
    expect(svg.querySelectorAll(".ce-cargo-pile").length).toBeGreaterThan(0);
  });

  describe("ship element rendering", () => {
    it("renders small, medium, and large ships with scale variations", () => {
      const doc: CityDocument = {
        format: "fmg-city-editor",
        version: 2,
        frame: { extentMeters: 1000, cityRadiusMeters: 400, blockSizeMeters: 50 },
        mesh: { vertices: {}, edges: {}, faces: {} },
        featureGroups: [],
        gates: [],
        elements: [
          {
            id: "ship-sloop-1",
            kind: "ship",
            shipType: "small",
            faceIds: [],
            point: [100, 150],
            sizeMeters: 18, // 18m (base 16m -> scale ~1.125)
            rotation: 0,
            locked: false
          },
          {
            id: "ship-caravel-1",
            kind: "ship",
            shipType: "medium",
            faceIds: [],
            point: [200, 250],
            sizeMeters: 28, // 28m (base 25m -> scale 1.12)
            rotation: Math.PI / 4,
            locked: false
          },
          {
            id: "ship-galleon-1",
            kind: "ship",
            shipType: "large",
            faceIds: [],
            point: [300, 350],
            sizeMeters: 48, // 48m (base 42m -> scale ~1.143)
            rotation: Math.PI / 2,
            locked: false
          }
        ]
      };

      const emptySel: RenderSelection = {
        faceId: null,
        edgeId: null,
        vertexId: null,
        groupId: null,
        inspectedId: null
      };
      const svg = renderEditorSvg(doc, "select", emptySel, "-500 -500 1000 1000", 1);
      const smallShip = svg.querySelector(".ce-ship--small");
      const mediumShip = svg.querySelector(".ce-ship--medium");
      const largeShip = svg.querySelector(".ce-ship--large");

      expect(smallShip).not.toBeNull();
      expect(mediumShip).not.toBeNull();
      expect(largeShip).not.toBeNull();

      expect(smallShip?.getAttribute("transform")).toContain("scale(1.1250 1.1250)");
      expect(mediumShip?.getAttribute("transform")).toContain("scale(1.1200 1.1200)");
      expect(largeShip?.getAttribute("transform")).toContain("scale(1.1429 1.1429)");

      // Test standalone SVG export includes ship styles
      const standalone = renderStandaloneCitySvg(doc);
      expect(standalone.querySelector(".ce-ship--small")).not.toBeNull();
      expect(standalone.querySelector("style")?.textContent).toContain(".ce-ship");
    });
  });
});
