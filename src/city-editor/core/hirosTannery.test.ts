import { expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import input from "./fixtures/hiros-20261010.json";
import { buildBlockFabric } from "./gen/blockInfill";
import { generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";
import { polygonHitsDocumentWater } from "./waterGeometry";

it("does not float Hiros's tannery in the regional sea beyond the editing mesh", () => {
  const value = parseIncomingPayload(JSON.stringify(input))!;
  const source = cityEditorDocument(value);
  const city = generateCityOnDocument(source, cityEditorSettings(value), input.seed)!;
  expect(city).not.toBeNull();
  expect(city.regionalWaterAreas?.length).toBeGreaterThan(0);
  const fabric = buildBlockFabric(city);
  const tanneries = fabric.aerialLandmarks!.tanneries;
  for (const tannery of tanneries) expect(polygonHitsDocumentWater(city, tannery.yard), tannery.id).toBe(false);
}, 120000);
