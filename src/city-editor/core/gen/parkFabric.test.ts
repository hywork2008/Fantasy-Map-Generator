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

  describe("fortification clearance hybrid logic", () => {
    it("suppresses trees completely in small-to-medium park blocks adjacent to city walls (pure esplanade)", () => {
      const doc = createParkDocument();
      // Remove default faces for a controlled test
      const v0 = { id: "v_sm_0", point: [0, 0] as [number, number], locked: false };
      const v1 = { id: "v_sm_1", point: [20, 0] as [number, number], locked: false };
      const v2 = { id: "v_sm_2", point: [20, 15] as [number, number], locked: false };
      const v3 = { id: "v_sm_3", point: [0, 15] as [number, number], locked: false };
      doc.mesh.vertices[v0.id] = v0;
      doc.mesh.vertices[v1.id] = v1;
      doc.mesh.vertices[v2.id] = v2;
      doc.mesh.vertices[v3.id] = v3;

      const e0 = { id: "e_sm_0", a: v0.id, b: v1.id, leftFace: "f_small_park", rightFace: null, locked: false };
      const e1 = { id: "e_sm_1", a: v1.id, b: v2.id, leftFace: "f_small_park", rightFace: null, locked: false };
      const e2 = { id: "e_sm_2", a: v2.id, b: v3.id, leftFace: "f_small_park", rightFace: null, locked: false };
      const e3 = { id: "e_sm_3", a: v3.id, b: v0.id, leftFace: "f_small_park", rightFace: null, locked: false };
      doc.mesh.edges[e0.id] = e0;
      doc.mesh.edges[e1.id] = e1;
      doc.mesh.edges[e2.id] = e2;
      doc.mesh.edges[e3.id] = e3;

      doc.mesh.faces = {
        f_small_park: {
          id: "f_small_park",
          boundary: [
            { edgeId: e0.id, forward: true },
            { edgeId: e1.id, forward: true },
            { edgeId: e2.id, forward: true },
            { edgeId: e3.id, forward: true }
          ],
          properties: {
            water: "land",
            ward: "park",
            buildable: true
          }
        }
      };

      const outline = facePoints(doc.mesh, doc.mesh.faces["f_small_park"]);
      const area = Math.abs(polygonArea(outline));
      expect(area).toBe(300); // 20m x 15m = 300 m^2 < 650 m^2

      // Add a wall along the boundary edge (y = 0)
      doc.featureGroups.push({
        id: "wall-1",
        kind: "wall",
        name: "Town Wall",
        segments: [{ edgeId: e0.id, forward: true }],
        style: { widthMeters: 3, color: "#666" },
        locked: true
      });

      const lawns = buildParkLawns(doc);
      expect(lawns.length).toBe(1);
      // Pure lawn is still generated
      expect(lawns[0].lawnPolygons.length).toBeGreaterThan(0);
      // But trees are completely suppressed (open parade ground / esplanade)
      expect(lawns[0].trees.length).toBe(0);
    });

    it("keeps trees at least FORTIFICATION_TREE_CLEAR_ZONE away from walls in large park blocks", () => {
      // Create a large custom face (e.g. 50m x 40m = 2000 m^2)
      const doc = createParkDocument();
      // Add a large custom rectangular face
      const v0 = { id: "v_custom_0", point: [0, 0] as [number, number], locked: false };
      const v1 = { id: "v_custom_1", point: [60, 0] as [number, number], locked: false };
      const v2 = { id: "v_custom_2", point: [60, 40] as [number, number], locked: false };
      const v3 = { id: "v_custom_3", point: [0, 40] as [number, number], locked: false };
      doc.mesh.vertices[v0.id] = v0;
      doc.mesh.vertices[v1.id] = v1;
      doc.mesh.vertices[v2.id] = v2;
      doc.mesh.vertices[v3.id] = v3;

      const e0 = { id: "e_c_0", a: v0.id, b: v1.id, leftFace: "f_large_park", rightFace: null, locked: false };
      const e1 = { id: "e_c_1", a: v1.id, b: v2.id, leftFace: "f_large_park", rightFace: null, locked: false };
      const e2 = { id: "e_c_2", a: v2.id, b: v3.id, leftFace: "f_large_park", rightFace: null, locked: false };
      const e3 = { id: "e_c_3", a: v3.id, b: v0.id, leftFace: "f_large_park", rightFace: null, locked: false };
      doc.mesh.edges[e0.id] = e0;
      doc.mesh.edges[e1.id] = e1;
      doc.mesh.edges[e2.id] = e2;
      doc.mesh.edges[e3.id] = e3;

      doc.mesh.faces["f_large_park"] = {
        id: "f_large_park",
        boundary: [
          { edgeId: e0.id, forward: true },
          { edgeId: e1.id, forward: true },
          { edgeId: e2.id, forward: true },
          { edgeId: e3.id, forward: true }
        ],
        properties: {
          water: "land",
          ward: "park",
          buildable: true
        }
      };

      // Set the bottom edge (y = 0) as a city wall
      doc.featureGroups.push({
        id: "wall-curtain",
        kind: "wall",
        name: "Curtain Wall",
        segments: [{ edgeId: e0.id, forward: true }],
        style: { widthMeters: 3, color: "#555" },
        locked: true
      });

      const lawns = buildParkLawns(doc);
      const largePark = lawns.find(l => l.faceId === "f_large_park");
      expect(largePark).toBeDefined();
      expect(largePark!.trees.length).toBeGreaterThan(0);

      // Verify that every single tree maintains defensive clear zone distance (>= 11.0m from y=0 wall)
      for (const tree of largePark!.trees) {
        expect(tree.center[1]).toBeGreaterThanOrEqual(11.0);
      }
    });

    it("suppresses trees in small park blocks adjacent to castle wards", () => {
      const doc = createParkDocument();
      const v0 = { id: "v0", point: [0, 0] as [number, number], locked: false };
      const v1 = { id: "v1", point: [20, 0] as [number, number], locked: false };
      const v2 = { id: "v2", point: [20, 15] as [number, number], locked: false };
      const v3 = { id: "v3", point: [0, 15] as [number, number], locked: false };
      const v4 = { id: "v4", point: [20, -20] as [number, number], locked: false };
      const v5 = { id: "v5", point: [0, -20] as [number, number], locked: false };
      doc.mesh.vertices[v0.id] = v0;
      doc.mesh.vertices[v1.id] = v1;
      doc.mesh.vertices[v2.id] = v2;
      doc.mesh.vertices[v3.id] = v3;
      doc.mesh.vertices[v4.id] = v4;
      doc.mesh.vertices[v5.id] = v5;

      const e0 = { id: "e0", a: v0.id, b: v1.id, leftFace: "f_park", rightFace: "f_castle", locked: false };
      const e1 = { id: "e1", a: v1.id, b: v2.id, leftFace: "f_park", rightFace: null, locked: false };
      const e2 = { id: "e2", a: v2.id, b: v3.id, leftFace: "f_park", rightFace: null, locked: false };
      const e3 = { id: "e3", a: v3.id, b: v0.id, leftFace: "f_park", rightFace: null, locked: false };

      const e4 = { id: "e4", a: v1.id, b: v4.id, leftFace: "f_castle", rightFace: null, locked: false };
      const e5 = { id: "e5", a: v4.id, b: v5.id, leftFace: "f_castle", rightFace: null, locked: false };
      const e6 = { id: "e6", a: v5.id, b: v0.id, leftFace: "f_castle", rightFace: null, locked: false };

      doc.mesh.edges[e0.id] = e0;
      doc.mesh.edges[e1.id] = e1;
      doc.mesh.edges[e2.id] = e2;
      doc.mesh.edges[e3.id] = e3;
      doc.mesh.edges[e4.id] = e4;
      doc.mesh.edges[e5.id] = e5;
      doc.mesh.edges[e6.id] = e6;

      doc.mesh.faces = {
        f_park: {
          id: "f_park",
          boundary: [
            { edgeId: e0.id, forward: true },
            { edgeId: e1.id, forward: true },
            { edgeId: e2.id, forward: true },
            { edgeId: e3.id, forward: true }
          ],
          properties: { water: "land", ward: "park", buildable: true }
        },
        f_castle: {
          id: "f_castle",
          boundary: [
            { edgeId: e0.id, forward: false },
            { edgeId: e4.id, forward: true },
            { edgeId: e5.id, forward: true },
            { edgeId: e6.id, forward: true }
          ],
          properties: { water: "land", ward: "castle", buildable: false }
        }
      };

      const lawns = buildParkLawns(doc);
      expect(lawns.length).toBe(1);
      expect(lawns[0].lawnPolygons.length).toBeGreaterThan(0);
      expect(lawns[0].trees.length).toBe(0);
    });
  });
});
