import { describe, expect, it } from "vitest";
import { createDocument } from "../core/document";
import { faceNeighbors, faceVertices } from "../core/mesh";
import { renderEditorSvg, selectionLabelFontSize, vertexHandleRadius } from "./svg";

describe("vertexHandleRadius", () => {
  it("keeps r=2 at every zoom level", () => {
    expect(vertexHandleRadius(1)).toBe(2);
    expect(vertexHandleRadius(20)).toBe(2);
    expect(vertexHandleRadius(10.5)).toBe(2);
    expect(vertexHandleRadius(100)).toBe(2);
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
