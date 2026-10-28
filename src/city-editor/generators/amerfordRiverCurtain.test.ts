import { expect, it } from "vitest";
import share from "../data/fixtures/amerford-20261027.json";
import { renderStandaloneCitySvg } from "../renderers/standaloneSvg";
import { parseIncomingPayload } from "../services/io/incomingCity";
import { cityEditorDocument, cityEditorSettings } from "../services/io/shareRequest";
import { buildBlockFabric } from "./blockInfill";
import { generateCityOnDocument } from "./generation/generateCity";
import { polygonArea, polygonCentroid } from "./geom";
import { facePoints, validate } from "./mesh";
import { measureHousingCapacity } from "./residentialCapacity";
import { documentWaterTest, lineHitsDocumentWater } from "./waterGeometry";

it("centres Amerford on dry fine-grid cells and fits its imported dwellings", () => {
  const request = parseIncomingPayload(JSON.stringify(share))!;
  const city = generateCityOnDocument(cityEditorDocument(request), cityEditorSettings(request), request.seed)!;
  expect(city).not.toBeNull();
  expect(validate(city)).toEqual([]);
  expect(city.featureGroups.some(group => group.kind === "road")).toBe(true);
  const fabric = buildBlockFabric(city);
  expect(fabric.buildings.length).toBeGreaterThan(0);
  const svg = renderStandaloneCitySvg(city);
  expect(svg.querySelectorAll(".ce-buildings > .ce-building")).toHaveLength(fabric.buildings.length);

  const housing = measureHousingCapacity(city, fabric.buildings, request.descriptor!.burg.dwellings);
  expect(housing.unplacedDwellings).toBe(0);
  expect(city.frame.extentMeters).toBeLessThan(request.descriptor!.frame.extentMeters);
  const center = polygonCentroid(fabric.buildings.map(building => polygonCentroid(building.polygon)));
  expect(Math.hypot(...center)).toBeLessThan(city.frame.cityRadiusMeters);
  const plaza = city.elements.find(element => element.kind === "plaza")!;
  expect(Math.hypot(...plaza.point!)).toBeLessThan(city.frame.cityRadiusMeters);
  expect(lineHitsDocumentWater(city, [plaza.point!, plaza.point!], 0.1, true, documentWaterTest(city))).toBe(false);
  const parks = Object.values(city.mesh.faces).filter(face => face.properties.ward === "park");
  expect(
    parks.every(
      face => Math.abs(polygonArea(facePoints(city.mesh, face))) < Math.PI * city.frame.cityRadiusMeters ** 2 * 0.1
    )
  ).toBe(true);
  const recipe = city.fabric!.generation!;
  const replay = generateCityOnDocument(recipe.input, recipe.settings, recipe.seed)!;
  expect(buildBlockFabric(replay).buildings.length).toBe(fabric.buildings.length);
  expect(replay.frame).toEqual(city.frame);
});
