import { describe, expect, it } from "vitest";
import { createDocument } from "../core/document";
import { faceNeighbors, faceVertices } from "../core/mesh";
import {
  faceClassName,
  renderEditorSvg,
  renderFaceWardLandmark,
  renderHoverOverlay,
  selectionLabelFontSize,
  vertexHandleRadius
} from "./svg";

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
