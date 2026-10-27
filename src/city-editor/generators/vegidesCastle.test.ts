import { expect, it } from "vitest";
import input from "../data/fixtures/vegides-20261026.json";
import { parseIncomingPayload } from "../services/io/incomingCity";
import { cityEditorDocument, cityEditorSettings } from "../services/io/shareRequest";
import { castleRoadEdgeAllowed } from "./castles";
import { generateCityOnDocument } from "./generation/generateCity";
import { validate } from "./mesh";

// Four approach roads block every adjacent castle site in this 112-person hamlet.
it("generates Vegides with an outer castle while preserving road clearances", () => {
  const share = parseIncomingPayload(JSON.stringify(input))!;
  const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed);
  expect(city).not.toBeNull();
  expect(city!.castles).toHaveLength(1);
  expect(city!.castles![0].relationship).toBe("detached");
  expect(validate(city!)).toEqual([]);
  for (const group of city!.featureGroups) {
    if (group.kind !== "road") continue;
    for (const ref of group.segments)
      expect(castleRoadEdgeAllowed(city!, ref.edgeId, group.style.widthMeters), `${group.id}/${ref.edgeId}`).toBe(true);
  }
});
