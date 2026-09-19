import { describe, expect, it } from "vitest";
import { createDocument } from "../core/document";
import { faceNeighbors, faceVertices, meshFromCells } from "../core/mesh";
import type { CityDocument, Point } from "../core/types";
import {
  faceClassName,
  parsePickInfo,
  renderEditorSvg,
  renderFaceWardLandmark,
  renderHoverOverlay,
  selectionLabelFontSize,
  vertexHandleRadius
} from "./svg";

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
  });
});

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
    const tinyRect = renderEditorSvg(tiny, "select", selection, "-200 -200 400 400", 1).querySelector("rect");
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
    const largeRect = renderEditorSvg(large, "select", selection, "-200 -200 400 400", 1).querySelector("rect");
    expect(Number(largeRect?.getAttribute("width"))).toBe(68);
    expect(Number(largeRect?.getAttribute("height"))).toBe(36);
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
