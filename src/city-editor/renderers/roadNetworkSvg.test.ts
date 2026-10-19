import { expect, it } from "vitest";
import type { CityDocument } from "../types/document";
import { renderFeatureLayer } from "./featureLayerSvg";
import type { RenderContext } from "./renderContext";

it.each([false, true])("draws shared roadway once and selects either logical route (town: %s)", town => {
  const document: CityDocument = {
    format: "fmg-city-editor",
    version: 1,
    frame: { extentMeters: 400, cityRadiusMeters: 120, blockSizeMeters: 40 },
    mesh: {
      vertices: Object.fromEntries(
        ["A", "B", "C", "D"].map((id, i) => [id, { id, point: [(i - 1.5) * 60, 0], locked: false }])
      ),
      edges: Object.fromEntries(
        ["AB", "BC", "CD"].map(id => [id, { id, a: id[0], b: id[1], leftFace: null, rightFace: null, locked: false }])
      ),
      faces: {}
    },
    featureGroups: [
      {
        id: "long",
        kind: "road",
        name: "Long road",
        locked: false,
        segments: ["AB", "BC", "CD"].map(edgeId => ({ edgeId, forward: true })),
        style: { widthMeters: 6, color: "#735238" }
      },
      {
        id: "short",
        kind: "road",
        name: "Short road",
        locked: false,
        segments: [{ edgeId: "BC", forward: false }],
        style: { widthMeters: 4, color: "#735238" },
        sourceRoad: { index: 0, routeId: 3 }
      }
    ],
    gates: [],
    elements: []
  };
  const before = structuredClone(document);
  const ctx: RenderContext = {
    document,
    tool: "select",
    selection: { groupId: "short", faceId: null, vertexId: null, edgeId: null },
    town,
    fixedMode: false,
    fixedGeometry: null,
    zoom: 1,
    lightweight: false,
    minimal: false,
    hideBuildings: false,
    hideStreetLines: false,
    preview: false
  };
  const svg = globalThis.document.createElementNS("http://www.w3.org/2000/svg", "svg");
  renderFeatureLayer(ctx, svg);
  expect(svg.querySelectorAll(".ce-feature--road")).toHaveLength(3);
  const selected = svg.querySelectorAll(".ce-feature--road.ce-active-group");
  expect(selected).toHaveLength(1);
  expect(selected[0].getAttribute("d")).toBe("M-30 0 L30 0");
  expect(selected[0].getAttribute("stroke-width")).toBe("6");
  expect(selected[0].getAttribute("data-group")).toBe("short");
  expect(JSON.parse(decodeURIComponent(selected[0].getAttribute("data-pick")!))).toMatchObject({
    id: "short",
    name: "Short road",
    routeIds: ["long", "short"]
  });
  expect(document).toEqual(before);
});
