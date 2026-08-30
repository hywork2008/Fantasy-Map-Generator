import { describe, expect, it } from "vitest";
import { validate } from "../core/mesh";
import { importMfcgJson, importMfcgSvg } from "./mfcgImport";

describe("MFCG imports", () => {
  it("converts MFCG GeoJSON layers into editable faces and feature groups", () => {
    const document = importMfcgJson({
      type: "FeatureCollection",
      features: [
        { type: "Feature", id: "values", generator: "mfcg", roadWidth: 6, wallThickness: 4, riverWidth: 12 },
        {
          type: "Polygon",
          id: "earth",
          coordinates: [
            [
              [0, 0],
              [100, 0],
              [100, 100],
              [0, 100],
              [0, 0]
            ]
          ]
        },
        {
          type: "MultiPolygon",
          id: "water",
          coordinates: [
            [
              [
                [20, 20],
                [80, 20],
                [80, 0],
                [20, 0],
                [20, 20]
              ]
            ]
          ]
        },
        {
          type: "MultiPolygon",
          id: "fields",
          coordinates: [
            [
              [
                [70, 70],
                [95, 70],
                [95, 95],
                [70, 95],
                [70, 70]
              ]
            ]
          ]
        },
        {
          type: "MultiPolygon",
          id: "squares",
          coordinates: [
            [
              [
                [35, 35],
                [55, 35],
                [55, 55],
                [35, 55],
                [35, 35]
              ]
            ]
          ]
        },
        {
          type: "MultiPolygon",
          id: "buildings",
          coordinates: [
            [
              [
                [60, 35],
                [80, 35],
                [80, 55],
                [60, 55],
                [60, 35]
              ]
            ]
          ]
        },
        {
          type: "GeometryCollection",
          id: "roads",
          geometries: [
            {
              type: "LineString",
              coordinates: [
                [0, 50],
                [100, 50]
              ]
            }
          ]
        },
        {
          type: "GeometryCollection",
          id: "walls",
          geometries: [
            {
              type: "Polygon",
              coordinates: [
                [
                  [20, 20],
                  [80, 20],
                  [80, 80],
                  [20, 80]
                ]
              ]
            }
          ]
        },
        {
          type: "GeometryCollection",
          id: "rivers",
          geometries: [
            {
              type: "LineString",
              coordinates: [
                [50, 0],
                [50, 100]
              ]
            }
          ]
        },
        {
          type: "GeometryCollection",
          id: "planks",
          geometries: [
            {
              type: "LineString",
              coordinates: [
                [30, 10],
                [30, -10]
              ]
            }
          ]
        },
        {
          type: "MultiPoint",
          id: "trees",
          coordinates: [
            [10, 15],
            [90, 85]
          ]
        }
      ]
    });

    expect(document).not.toBeNull();
    expect(validate(document!)).toEqual([]);
    expect(Object.keys(document!.mesh.faces)).toHaveLength(4);
    expect(document!.featureGroups.map(group => group.kind)).toEqual(["road", "wall", "river", "plank"]);
    expect(document!.featureGroups.at(-1)).toMatchObject({
      name: "plank-3",
      style: { widthMeters: 3, color: "#d8d0c0" }
    });
    const wall = document!.featureGroups.find(group => group.kind === "wall");
    expect(wall?.kind === "wall" ? wall.segments : []).toHaveLength(3);
    expect(document!.elements).toHaveLength(3);
    expect(document!.elements.filter(element => element.kind === "tree")).toEqual([
      expect.objectContaining({ point: [-40, -35], sizeMeters: 8 }),
      expect.objectContaining({ point: [40, 35], sizeMeters: 8 })
    ]);
    // The source's north-positive Y coordinates must remain north-positive in
    // the editor; renderEditorSvg performs the SVG-axis inversion itself.
    expect(document!.mesh.vertices.v0.point[1]).toBeLessThan(0);
  });

  it("imports an SVG as a non-editable reference image", () => {
    const document = importMfcgSvg(
      '<svg width="640" height="480" xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'
    );

    expect(document?.referenceImage).toMatchObject({ width: 640, height: 480 });
    expect(document?.referenceImage?.href).toMatch(/^data:image\/svg\+xml/);
  });
});
