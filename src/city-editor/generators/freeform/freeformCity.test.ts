import { describe, expect, it, vi } from "vitest";
import { createTownWater } from "../../../city3d/three/waterMeshes";
import { renderEditorSvg } from "../../renderers/editorSvg";
import { exportCityMap, readCityMap } from "../../services/io/cityEditorFile";
import { createGridDocument } from "../document";
import { cityTerrain } from "../terrainElevation";
import { terrainFieldForDocument } from "../terrainField/build";
import { FIELD_MODE_MAX_EXTENT_METERS } from "../terrainField/constants";
import { sampleField } from "../terrainField/sample";
import { commitRiver, commitZone } from "./commitLedger";
import { commitPlacement } from "./commitPlacement";
import { commitWay } from "./commitWay";
import {
  convertDocumentToFreeform,
  createFreeformCity,
  materializeFreeform,
  parseFreeformCity,
  serializeFreeform
} from "./freeformCity";

const footprint = { halfX: 4, halfZ: 6, centerX: 0, centerZ: 0, groundY: 0 };
const selection = { faceId: null, edgeId: null, vertexId: null, groupId: null };

function domeView(extent = 96) {
  return materializeFreeform(createFreeformCity(extent, 3, 16));
}

describe("freeform city ledger", () => {
  it("preserves bridge policy on reload and checks rivers drawn after ways", () => {
    const view = domeView();
    view.historicalPeriod = "highMedieval";
    view.maxBridgeSkewDegrees = 20;
    const restored = materializeFreeform(parseFreeformCity(serializeFreeform(view))!);
    expect(restored.historicalPeriod).toBe("highMedieval");
    expect(restored.maxBridgeSkewDegrees).toBe(20);
    const road = commitWay(restored, {
      id: "road",
      centerline: [
        [-30, 0],
        [30, 0]
      ],
      widthMeters: 3,
      profile: "slope",
      surface: "paved"
    }).document;
    expect(
      commitRiver(
        road,
        "diagonal",
        [
          [-30, -30],
          [30, 30]
        ],
        8
      ).reason
    ).toBe("bridge");
    expect(
      commitRiver(
        road,
        "square",
        [
          [0, -30],
          [0, 30]
        ],
        8
      ).reason
    ).toBeUndefined();
  });

  it("materializes a dome ledger with an empty mesh", () => {
    expect(createFreeformCity(2400).frame.extentMeters).toBe(FIELD_MODE_MAX_EXTENT_METERS);
    const view = domeView();
    expect(view.freeform?.format).toBe("fmg-freeform-city");
    expect(view.freeform?.ground.template).toBe("dome");
    expect(Object.keys(view.mesh.vertices)).toHaveLength(0);
    expect(Object.keys(view.mesh.faces)).toHaveLength(0);
    expect(view.terrain?.field?.template).toBe("dome");
    expect(Number.isFinite(cityTerrain(view).heightAt([0, 0]))).toBe(true);
  });

  it("saves the ledger without a mesh and reads it back", async () => {
    const view = domeView();
    const text = serializeFreeform(view);
    const saved = JSON.parse(text) as { format?: string; mesh?: unknown };
    expect(saved.format).toBe("fmg-freeform-city");
    expect(saved.mesh).toBeUndefined();
    expect(parseFreeformCity(text)?.frame.extentMeters).toBe(view.frame.extentMeters);
    const read = await readCityMap(new File([text], "ce-freeform-test.json", { type: "application/json" }));
    expect(read?.source).toBe("city-editor");
    expect(read?.document.freeform?.format).toBe("fmg-freeform-city");
    expect(Object.keys(read?.document.mesh.vertices ?? { stale: 1 })).toHaveLength(0);

    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:freeform");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    let filename = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      filename = this.download;
    });
    try {
      exportCityMap(view);
      expect(filename).toMatch(/^ce-freeform-\d{8}-\d{6}\.json$/);
    } finally {
      createUrl.mockRestore();
      revokeUrl.mockRestore();
      click.mockRestore();
    }
  });

  it("lifts roads, a surveyed river, a park, a plot, and a way, then drops the mesh", () => {
    const document = createGridDocument({ size: "micro", seed: "freeform-f3", grid: "hex" });
    const edge = Object.values(document.mesh.edges)[0];
    document.featureGroups.push(
      {
        id: "street-1",
        kind: "road",
        name: "Street",
        segments: [{ edgeId: edge.id, forward: true }],
        style: { widthMeters: 5, color: "black" },
        locked: false
      },
      {
        id: "wall-1",
        kind: "wall",
        name: "Wall",
        segments: [{ edgeId: edge.id, forward: true }],
        style: { widthMeters: 2, color: "black" },
        locked: false
      }
    );
    const face =
      Object.values(document.mesh.faces).find(item => item.properties.water === "land") ??
      Object.values(document.mesh.faces)[0];
    face.properties.ward = "park";
    document.riverFlows = [
      {
        riverId: 7,
        name: "Test",
        points: [
          [-40, 50],
          [40, 50]
        ],
        widthMeters: 8,
        dropMeters: 1,
        basis: "descriptor"
      }
    ];
    document.terrain = {
      version: 1,
      features: [],
      field: createFreeformCity(document.frame.extentMeters, 3, 16).ground,
      ways: [
        {
          id: "way-drawn",
          centerline: [
            [-30, -60],
            [30, -60]
          ],
          widthMeters: 4,
          profile: "slope",
          surface: "dirt",
          grade: "cart"
        }
      ]
    };
    const placed = commitPlacement(document, {
      id: "house-1",
      modelId: "house:mediterranean",
      position: [0, 0],
      facingDegrees: 90,
      footprint
    });
    expect(placed.preview.ok).toBe(true);
    const converted = convertDocumentToFreeform(placed.document);
    expect(converted?.freeform?.format).toBe("fmg-freeform-city");
    expect(Object.keys(converted?.mesh.faces ?? { stale: 1 })).toHaveLength(0);
    expect(converted?.featureGroups).toEqual([]);
    expect(converted?.freeform?.plots.map(plot => plot.id)).toEqual(["plot:house-1"]);
    expect(converted?.freeform?.placements[0]?.facingDegrees).toBeCloseTo(90, 5);
    expect(converted?.freeform?.ways.map(way => way.id).sort()).toEqual(["way-drawn", "way:street-1"]);
    expect(converted?.freeform?.rivers.map(river => river.sourceId)).toEqual(["flow:7"]);
    const river = converted?.freeform?.rivers[0];
    expect(river?.bedMeters[1]).toBeLessThanOrEqual(river?.bedMeters[0] ?? 0);
    expect(converted?.freeform?.zones.some(zone => zone.kind === "park" && zone.id === `zone:${face.id}`)).toBe(true);
    const again = convertDocumentToFreeform(converted!);
    expect(again?.freeform?.ways).toHaveLength(converted?.freeform?.ways.length ?? 0);
  });

  it("samples cell elevations when the map has no height-field recipe", () => {
    const document = createGridDocument({ size: "micro", seed: "freeform-cells", grid: "hex" });
    const edge = Object.values(document.mesh.edges)[0];
    document.featureGroups.push({
      id: "street-1",
      kind: "road",
      name: "Street",
      segments: [{ edgeId: edge.id, forward: true }],
      style: { widthMeters: 4, color: "black" },
      locked: false
    });
    const converted = convertDocumentToFreeform(document);
    expect(converted?.freeform?.ground.template).toBe("cells");
    expect(converted?.freeform?.ways.some(way => way.id === "way:street-1")).toBe(true);
    expect(Object.keys(converted?.mesh.edges ?? { stale: 1 })).toHaveLength(0);
  });

  it("rejects a river across a plot and keeps a falling bed", () => {
    const placed = commitPlacement(domeView(), {
      id: "house-1",
      modelId: "house:mediterranean",
      position: [0, 0],
      facingDegrees: 0,
      footprint
    });
    expect(placed.preview.ok).toBe(true);
    expect(
      commitRiver(
        placed.document,
        "river-blocked",
        [
          [-15, 0],
          [15, 0]
        ],
        8
      ).reason
    ).toBe("plot");
    const open = commitRiver(
      placed.document,
      "river-open",
      [
        [-20, 30],
        [20, 30]
      ],
      8
    );
    expect(open.reason).toBeUndefined();
    const river = open.document.terrain?.features.find(feature => feature.id === "river-open");
    expect(river?.kind).toBe("riverCorridor");
    if (river?.kind !== "riverCorridor") return;
    const field = terrainFieldForDocument(open.document);
    expect(field).not.toBeNull();
    for (let index = 0; index < river.bedMeters.length; index++) {
      if (index) expect(river.bedMeters[index]).toBeLessThanOrEqual(river.bedMeters[index - 1]);
      expect(river.bedMeters[index]).toBeLessThanOrEqual(
        sampleField(field!, river.centerline[index]) - river.depthMeters + 1e-6
      );
    }
    expect(river.bedMeters[1]).toBeLessThan(river.bedMeters[0]);
  });

  it("commits a land zone and draws the city without cells", () => {
    const city = domeView();
    expect(
      commitZone(city, "zone-short", "farm", [
        [0, 0],
        [1, 0],
        [1, 1]
      ]).reason
    ).toBe("short");
    const zoned = commitZone(city, "zone-1", "park", [
      [-10, -10],
      [10, -10],
      [10, 10]
    ]);
    expect(zoned.reason).toBeUndefined();
    expect(zoned.document.freeform?.zones.map(zone => zone.kind)).toEqual(["park"]);
    const withRiver = commitRiver(
      zoned.document,
      "river-1",
      [
        [-20, 30],
        [20, 30]
      ],
      8
    ).document;
    const svg = renderEditorSvg(withRiver, "select", selection, "-48 -48 96 96", 1);
    expect(svg.querySelector(".ce-cells")).toBeNull();
    expect(svg.querySelector(".ce-terrain-field")).not.toBeNull();
    expect(svg.querySelector(".ce-freeform-river")).not.toBeNull();
    expect(svg.querySelector(".ce-freeform-zone--park")).not.toBeNull();
    const water = createTownWater(withRiver);
    expect(water.parent.getObjectByName("ce-freeform-river")).toBeTruthy();
    expect(water.parent.getObjectByName("ce-freeform-zone-park")).toBeTruthy();
    water.dispose();
  });
});
