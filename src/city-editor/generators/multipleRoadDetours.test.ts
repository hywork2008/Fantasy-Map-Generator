import { expect, it } from "vitest";
import input from "../data/fixtures/road-loop-multiple-groups.json";
import { parseIncomingPayload } from "../services/io/incomingCity";
import { cityEditorDocument, cityEditorSettings } from "../services/io/shareRequest";
import { generateCityOnDocument } from "./generation/generateCity";
import { validate } from "./mesh";

it("removes a bypass spanning multiple road groups", () => {
  const share = parseIncomingPayload(JSON.stringify(input))!;
  const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed)!;
  expect(validate(city)).toEqual([]);
  const occupied = new Set(city.featureGroups.flatMap(g => (g.kind === "road" ? g.segments.map(r => r.edgeId) : [])));
  expect(occupied.has("e505")).toBe(false);
  expect(occupied.has("e350")).toBe(false);
  const main = city.featureGroups.find(g => g.id === "gc:road-9")!;
  expect(main.kind === "road" && main.segments.map(r => r.edgeId)).toEqual([
    "e355",
    "e506",
    "e271",
    "e504",
    "e508",
    "e507",
    "e316"
  ]);
});
