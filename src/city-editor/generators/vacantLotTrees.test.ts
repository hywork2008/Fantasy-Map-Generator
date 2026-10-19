import { describe, expect, it } from "vitest";
import { renderEditorSvg } from "../renderers/editorSvg";
import { serializeCitySvg } from "../renderers/standaloneSvg";
import { parseDocument, serializeDocument } from "../services/io/documentCodec";
import { orientedRectCorners, templeRectForElement } from "./civicPlacement";
import { createDocument } from "./document";
import { nearestOnPolyline, pointInPolygon } from "./geom";
import { meshFromCells } from "./mesh";
import { buildVacantLotTrees, treeCanopyRadius } from "./vacantLotTrees";

function vacantCity() {
  const doc = createDocument("vacant-tree-test", 400);
  doc.mesh = meshFromCells(
    Array.from({ length: 4 }, (_, id) => {
      const x = id * 100;
      return {
        id,
        polygon: [
          [x, 0],
          [x + 100, 0],
          [x + 100, 100],
          [x, 100]
        ] as [number, number][],
        site: [x + 50, 50] as [number, number],
        centroid: [x + 50, 50] as [number, number],
        neighbors: [],
        onBorder: false
      };
    })
  );
  for (const face of Object.values(doc.mesh.faces)) {
    face.properties.ward = "empty";
    face.properties.settlement = "core";
  }
  doc.appearance = "town";
  doc.featureGroups = [];
  doc.elements = [];
  return doc;
}

describe("vacant-lot decoration", () => {
  it("leaves irregular gaps, repeats the same seed, and avoids buildings while overhanging roadside lanes", () => {
    const doc = vacantCity();
    const polygon: [number, number][] = [
      [0, 0],
      [45, 0],
      [45, 100],
      [0, 100]
    ];
    const lots = [{ faceId: "f0", polygon, landmark: false }];
    const fabric = {
      buildings: lots,
      lanes: [
        {
          faceId: "f0",
          points: [
            [70, 0],
            [70, 100]
          ] as [number, number][],
          widthMeters: 6
        }
      ],
      farms: [],
      entrances: new Map()
    };
    const trees = buildVacantLotTrees(doc, lots, fabric, "trees");
    expect(trees.length).toBeGreaterThan(40);
    expect(trees.length).toBeLessThan(300);
    expect(buildVacantLotTrees(doc, lots, fabric, "trees")).toEqual(trees);
    expect(buildVacantLotTrees(doc, lots, fabric, "other")).not.toEqual(trees);
    for (const tree of trees.filter(tree => tree.center[0] < 100)) {
      expect(tree.center[0] - treeCanopyRadius(tree)).toBeGreaterThan(45);
      expect(nearestOnPolyline(tree.center, fabric.lanes[0].points).dist).toBeGreaterThanOrEqual(3.4);
    }
    expect(
      trees.some(
        tree =>
          tree.center[0] < 100 &&
          nearestOnPolyline(tree.center, fabric.lanes[0].points).dist < treeCanopyRadius(tree) + 3
      )
    ).toBe(true);
    // Occupying the full city removes every decorative tree.
    expect(
      buildVacantLotTrees(
        doc,
        [
          {
            faceId: "f0",
            landmark: false,
            polygon: [
              [-10, -10],
              [410, -10],
              [410, 110],
              [-10, 110]
            ]
          }
        ],
        null,
        "trees"
      )
    ).toEqual([]);
    expect(doc.vacantLotTrees).toBeUndefined();
  });

  it("keeps stems outside a wide main road and its casing while allowing canopy overhang", () => {
    const doc = vacantCity();
    const edge = Object.values(doc.mesh.edges).find(edge => {
      const a = doc.mesh.vertices[edge.a].point;
      const b = doc.mesh.vertices[edge.b].point;
      return a[0] === 100 && b[0] === 100;
    })!;
    doc.featureGroups.push({
      id: "main-road",
      kind: "road",
      name: "Main road",
      locked: false,
      segments: [{ edgeId: edge.id, forward: true }],
      style: { widthMeters: 20, color: "#ccc" }
    });
    const trees = buildVacantLotTrees(doc, [], null, "trees");
    const road = [doc.mesh.vertices[edge.a].point, doc.mesh.vertices[edge.b].point];
    const pavementHalfWidth = (20 + 1.4) / 2;
    expect(trees.length).toBeGreaterThan(0);
    for (const tree of trees) {
      expect(nearestOnPolyline(tree.center, road).dist).toBeGreaterThanOrEqual(pavementHalfWidth + 0.4);
    }
    expect(
      trees.some(tree => nearestOnPolyline(tree.center, road).dist < pavementHalfWidth + treeCanopyRadius(tree))
    ).toBe(true);
  });

  it("keeps canopies off water and skips parks, farms, cemeteries and nonurban land", () => {
    const doc = vacantCity();
    doc.waterAreas = [
      {
        kind: "river",
        polygon: [
          [-10, -10],
          [45, -10],
          [45, 110],
          [-10, 110]
        ]
      }
    ];
    for (const tree of buildVacantLotTrees(doc, [], null, "trees"))
      expect(tree.center[0] - treeCanopyRadius(tree)).toBeGreaterThan(45);
    doc.mesh.faces.f0.properties.ward = "park";
    doc.mesh.faces.f1.properties.ward = "farm";
    doc.mesh.faces.f2.properties.ward = "cemetery";
    doc.mesh.faces.f3.properties.settlement = undefined;
    expect(buildVacantLotTrees(doc, [], null, "trees")).toEqual([]);
  });

  it("finds narrow roadside gaps even when most of each block is occupied", () => {
    const doc = vacantCity();
    const lots = Object.keys(doc.mesh.faces).map((faceId, i) => ({
      faceId,
      landmark: false,
      polygon: [
        [i * 100 + 14, 0],
        [i * 100 + 100, 0],
        [i * 100 + 100, 100],
        [i * 100 + 14, 100]
      ] as [number, number][]
    }));
    const trees = buildVacantLotTrees(doc, lots, null, "trees");
    expect(trees.length).toBeGreaterThan(8);
    expect(trees.some(tree => tree.center[0] - treeCanopyRadius(tree) < 0)).toBe(true);
    for (const tree of trees) {
      const block = Math.floor(tree.center[0] / 100);
      expect(tree.center[0] + treeCanopyRadius(tree)).toBeLessThan(block * 100 + 14);
    }
  });

  it("reserves a rotated temple footprint even when it is absent from building lots", () => {
    const doc = vacantCity();
    const baseline = buildVacantLotTrees(doc, [], null, "trees");
    const point: [number, number] = [50, 50];
    doc.elements.push({
      id: "gc:temple",
      kind: "temple",
      faceIds: ["f0"],
      point,
      sizeMeters: 45,
      rotation: Math.PI / 4,
      locked: false
    });
    const rect = templeRectForElement(point, 45, Math.PI / 4, doc.frame.extentMeters);
    const corners = orientedRectCorners(rect);
    expect(baseline.some(tree => pointInPolygon(tree.center, corners))).toBe(true);
    const trees = buildVacantLotTrees(doc, [], null, "trees");
    expect(trees.length).toBeGreaterThan(0);
    for (const tree of trees) {
      expect(pointInPolygon(tree.center, corners)).toBe(false);
      expect(nearestOnPolyline(tree.center, [...corners, corners[0]]).dist).toBeGreaterThan(treeCanopyRadius(tree));
    }
  });

  it("saves the arrangement and toggles only the decoration in town and exported rendering", () => {
    const doc = vacantCity();
    doc.vacantLotTrees = { seed: "trees", visible: true };
    const selection = { faceId: null, edgeId: null, vertexId: null, groupId: null };
    const render = () => renderEditorSvg(doc, "select", selection, "0 -100 400 100", 1);
    const before = render();
    const trees = before.querySelector(".ce-vacant-lot-trees")!.outerHTML;
    expect(before.querySelectorAll(".ce-vacant-lot-trees .ce-park-tree").length).toBeGreaterThan(0);
    const loaded = parseDocument(serializeDocument(doc))!;
    expect(loaded.vacantLotTrees).toEqual(doc.vacantLotTrees);
    expect(buildVacantLotTrees(loaded, [], null, loaded.vacantLotTrees!.seed)).toEqual(
      buildVacantLotTrees(doc, [], null, "trees")
    );
    expect(serializeCitySvg(doc)).toContain('class="ce-vacant-lot-trees"');
    doc.vacantLotTrees.visible = false;
    const hidden = render();
    expect(hidden.querySelector(".ce-vacant-lot-trees")).toBeNull();
    expect(hidden.querySelectorAll(".ce-building").length).toBe(before.querySelectorAll(".ce-building").length);
    doc.vacantLotTrees.visible = true;
    expect(render().querySelector(".ce-vacant-lot-trees")!.outerHTML).toBe(trees);
  });
});
