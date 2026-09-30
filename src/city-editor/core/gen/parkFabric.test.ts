import { describe, expect, it } from "vitest";
import { renderEditorSvg } from "../../render/svg";
import { createDocument } from "../document";
import { facePoints } from "../mesh";
import type { CityDocument } from "../types";
import { pointInPolygon, polygonArea } from "./geom";
import { buildParkLawns } from "./parkFabric";

function createParkDocument(): CityDocument {
  const doc = createDocument("park-test", 400);
  const face = Object.values(doc.mesh.faces)[0];
  face.properties.water = "land";
  face.properties.ward = "park";
  face.properties.buildable = true;
  return doc;
}

describe("parkFabric", () => {
  it("builds lawn polygons for park faces with an inset perimeter", () => {
    const doc = createParkDocument();
    const face = Object.values(doc.mesh.faces)[0];
    const outline = facePoints(doc.mesh, face);
    const outlineArea = Math.abs(polygonArea(outline));

    const lawns = buildParkLawns(doc);
    expect(lawns.length).toBe(1);
    expect(lawns[0].faceId).toBe(face.id);
    expect(lawns[0].lawnPolygons.length).toBeGreaterThan(0);

    for (const lawn of lawns[0].lawnPolygons) {
      const lawnArea = Math.abs(polygonArea(lawn));
      expect(lawnArea).toBeLessThan(outlineArea);
      expect(lawnArea).toBeGreaterThan(10);
      for (const pt of lawn) {
        expect(pointInPolygon(pt, outline)).toBe(true);
      }
    }
  });

  it("builds top-down green foliage clusters (bushes) inside park without polluting document.elements", () => {
    const doc = createParkDocument();
    const face = Object.values(doc.mesh.faces)[0];
    const outline = facePoints(doc.mesh, face);

    const initialElementCount = doc.elements.length;
    const lawns = buildParkLawns(doc);

    // document.elements must NOT be modified or polluted
    expect(doc.elements.length).toBe(initialElementCount);

    expect(lawns[0].trees.length).toBeGreaterThanOrEqual(1);
    for (const canopy of lawns[0].trees) {
      expect(pointInPolygon(canopy.center, outline)).toBe(true);
      expect(canopy.radius).toBeGreaterThan(2);
      expect(canopy.subCircles.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("renders park lawn, paths, and top-down green foliage in SVG under town appearance with trees layered above features", () => {
    const doc = createParkDocument();
    doc.appearance = "town";

    const svg = renderEditorSvg(
      doc,
      "select",
      { faceId: null, vertexId: null, edgeId: null, featureGroupId: null, gateId: null, elementId: null },
      "-200 -200 400 400",
      1
    );
    const parkLayer = svg.querySelector<SVGGElement>(".ce-parks");
    expect(parkLayer).not.toBeNull();

    const lawns = parkLayer!.querySelectorAll(".ce-park-lawn");
    expect(lawns.length).toBeGreaterThan(0);

    // Top-down foliage clusters (canopy main and lobes, no trunks) in ce-park-trees layer
    const treeLayer = svg.querySelector<SVGGElement>(".ce-park-trees");
    expect(treeLayer).not.toBeNull();
    expect(treeLayer?.getAttribute("style")).toContain("z-index: 5");

    const treeGroups = treeLayer!.querySelectorAll(".ce-park-tree");
    expect(treeGroups.length).toBeGreaterThanOrEqual(1);
    expect(treeLayer!.querySelector(".ce-park-canopy-main")).not.toBeNull();
    expect(treeLayer!.querySelector(".ce-park-canopy-highlight")).not.toBeNull();

    // No trunk elements should exist inside park foliage
    expect(treeLayer!.querySelector(".ce-tree-trunk")).toBeNull();

    // Features layer (roads, rivers) has z-index 2 and appears before tree layer in DOM
    const featuresLayer = svg.querySelector<SVGGElement>(".ce-features");
    expect(featuresLayer).not.toBeNull();
    expect(featuresLayer?.getAttribute("style")).toContain("z-index: 2");

    const children = Array.from(svg.children);
    const featuresIndex = children.indexOf(featuresLayer!);
    const treesIndex = children.indexOf(treeLayer!);
    expect(featuresIndex).toBeGreaterThan(-1);
    expect(treesIndex).toBeGreaterThan(featuresIndex);
  });

  it("renders only the ward icon landmark when showBlockMesh (街区の編集表示) is ON, with no tree objects", () => {
    const doc = createParkDocument();
    doc.appearance = "town";

    // When showBlockMesh is true, town presentation is OFF
    const svg = renderEditorSvg(
      doc,
      "select",
      { faceId: null, vertexId: null, edgeId: null, featureGroupId: null, gateId: null, elementId: null },
      "-200 -200 400 400",
      1,
      null,
      null,
      null,
      null,
      true // showBlockMesh = true ("街区の編集表示" is ON)
    );

    // ce-parks and ce-park-trees layers must NOT be rendered
    expect(svg.querySelector(".ce-parks")).toBeNull();
    expect(svg.querySelector(".ce-park-trees")).toBeNull();

    // No tree objects in elements
    expect(doc.elements.some(e => e.kind === "tree")).toBe(false);

    // The original ward landmark icon should be rendered
    const landmark = svg.querySelector(".ce-ward-landmarks");
    expect(landmark).not.toBeNull();
    const face = Object.values(doc.mesh.faces)[0];
    const parkMarker = landmark!.querySelector(`[data-element="ward-${face.id}"]`);
    expect(parkMarker).not.toBeNull();
  });
});
