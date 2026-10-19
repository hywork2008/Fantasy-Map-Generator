import { expect, it } from "vitest";
import input from "../data/fixtures/thin-road-cells-1hw6oxu.json";
import { parseIncomingPayload } from "../services/io/incomingCity";
import { cityEditorDocument, cityEditorSettings } from "../services/io/shareRequest";
import { generateCityOnDocument } from "./generation/generateCity";
import { validate } from "./mesh";
import { roadPathVertices } from "./roadNetwork";

it("consolidates the two bent slivers between road-4 and road-8 in the shared city", () => {
  const share = parseIncomingPayload(JSON.stringify(input))!;
  const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed)!;
  expect(city).toBeTruthy();
  expect(validate(city)).toEqual([]);
  // These two cells used to enclose an empty, bent strip on either side of e72.
  expect(city.mesh.faces.f91).toBeUndefined();
  expect(city.mesh.faces.f15).toBeUndefined();
  expect(city.elements.some(e => e.kind === "temple" && e.faceIds.every(id => !!city.mesh.faces[id]))).toBe(true);
  expect(Object.values(city.mesh.faces).some(f => f.properties.ward === "cemetery")).toBe(true);
  const road4 = city.featureGroups.find(g => g.id === "gc:road-4")!;
  expect(road4.kind).toBe("road");
  if (road4.kind !== "road") return;
  const main = new Set(roadPathVertices(city.mesh, road4.segments));
  // Protected temple/cemetery boundaries can stay in the mesh, but not as parallel roads.
  const upper = ["e111", "e344", "e71", "e70", "e56", "e48"];
  const lower = ["e201", "e103", "e144", "e73", "e16"];
  const occupied = new Set(city.featureGroups.flatMap(g => (g.kind === "road" ? g.segments.map(r => r.edgeId) : [])));
  expect([upper, lower].some(side => side.every(id => !occupied.has(id)))).toBe(true);
  // The short bypass rejoins road-5 without serving another junction.
  expect(["e456", "e217", "e99", "e100", "e195"].every(id => !occupied.has(id))).toBe(true);
  expect(occupied.has("e323")).toBe(true);
  const road5 = city.featureGroups.find(g => g.id === "gc:road-5")!;
  expect(road5.kind).toBe("road");
  if (road5.kind !== "road") return;
  const trunk = new Set(road5.segments.map(r => r.edgeId));
  expect(["e457", "e458", "e459", "e282", "e283"].every(id => trunk.has(id))).toBe(true);
  const owners = new Set<string>();
  for (const group of city.featureGroups) {
    if (group.kind !== "road") continue;
    for (const ref of group.segments) {
      expect(city.mesh.edges[ref.edgeId]).toBeDefined();
      if (group.id.startsWith("gc:road-8") && roadPathVertices(city.mesh, group.segments).some(id => main.has(id)))
        owners.add(group.id);
    }
  }
  expect(owners.size).toBeGreaterThan(0);
});
