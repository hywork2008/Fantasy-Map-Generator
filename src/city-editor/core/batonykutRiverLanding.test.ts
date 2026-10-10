import { expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import input from "./fixtures/batonykut-20261010.json";
import { townGates } from "./fortifications";
import { generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";
import { vertexHasCrossing } from "./passages";

it("links Batonykut's gate to a river landing whose nearby vertices are all in the river", () => {
  const value = parseIncomingPayload(JSON.stringify(input))!;
  const city = generateCityOnDocument(cityEditorDocument(value), cityEditorSettings(value), input.seed)!;
  expect(city).not.toBeNull();
  const gates = townGates(city);
  expect(gates.length).toBeGreaterThan(0);
  for (const gate of gates) expect(vertexHasCrossing(city, gate.vertexId, "wall", "road"), gate.id).toBe(true);
}, 120000);
