import { expect, it } from "vitest";
import share from "../data/fixtures/amerford-20261027.json";
import { renderStandaloneCitySvg } from "../renderers/standaloneSvg";
import { parseIncomingPayload } from "../services/io/incomingCity";
import { cityEditorDocument, cityEditorSettings } from "../services/io/shareRequest";
import { buildBlockFabric } from "./blockInfill";
import { generateCityOnDocument } from "./generation/generateCity";
import { nearestOnPolyline } from "./geom";
import { validate } from "./mesh";

it("keeps Amerford's streets and buildings while extending its outer curtain to the river", () => {
  const request = parseIncomingPayload(JSON.stringify(share))!;
  const city = generateCityOnDocument(cityEditorDocument(request), cityEditorSettings(request), request.seed)!;
  expect(city).not.toBeNull();
  expect(validate(city)).toEqual([]);
  expect(city.featureGroups.some(group => group.kind === "road")).toBe(true);
  const fabric = buildBlockFabric(city);
  expect(fabric.buildings.length).toBeGreaterThan(0);
  const svg = renderStandaloneCitySvg(city);
  expect(svg.querySelectorAll(".ce-buildings > .ce-building")).toHaveLength(fabric.buildings.length);

  const degree = new Map<string, number>();
  for (const group of city.featureGroups) {
    if (group.kind !== "wall" || !group.id.startsWith("gc:wall-")) continue;
    for (const ref of group.segments) {
      const edge = city.mesh.edges[ref.edgeId];
      const faces = [edge.leftFace, edge.rightFace].flatMap(id => (id ? [city.mesh.faces[id]] : []));
      // A new curtain must stay outside the town's internal street network.
      expect(faces.length === 2 && faces.every(face => face.properties.settlement === "core")).toBe(false);
      for (const id of [edge.a, edge.b]) degree.set(id, (degree.get(id) ?? 0) + 1);
    }
  }
  const ends = [...degree].filter(([, n]) => n === 1).map(([id]) => city.mesh.vertices[id].point);
  expect(ends).toHaveLength(2);
  for (const point of ends) {
    const gap = Math.min(
      ...city.waterAreas!.map(area => nearestOnPolyline(point, [...area.polygon, area.polygon[0]]).dist)
    );
    expect(gap).toBeLessThan(0.01);
  }
});
