import { describe, expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import input from "./fixtures/erente-20261009.json";
import { buildBlockFabric, type DistrictFabric } from "./gen/blockInfill";
import { harborWaterField, SEA_BERTH_TURNING_RADIUS, SEA_CHANNEL_HALF_WIDTH } from "./gen/harborNavigation";
import { generateCityOnDocument } from "./generate";
import { cityEditorDocument, cityEditorSettings } from "./housingReport";

describe("Erente (FMG sea port beside a narrow cove)", () => {
  const value = parseIncomingPayload(JSON.stringify(input))!;
  const city = generateCityOnDocument(cityEditorDocument(value), cityEditorSettings(value), value.seed)!;
  const field = harborWaterField(city);
  const fabric = (city.fabric as DistrictFabric | undefined)?.harbor
    ? (city.fabric as DistrictFabric)
    : buildBlockFabric(city);

  it("builds no pier at the head of the cove, where no ship could turn or sail out", () => {
    const piers = fabric.harbor?.piers ?? [];
    expect(piers.length).toBeGreaterThan(0);
    for (const pier of piers) {
      expect(field.clearance(pier.end!)).toBeGreaterThanOrEqual(SEA_BERTH_TURNING_RADIUS);
      expect(field.navigable(pier.end!, SEA_CHANNEL_HALF_WIDTH)).toBe(true);
    }
  });

  it("moors every ship on water connected to the open sea", () => {
    const ships = city.elements.filter(e => e.kind === "ship");
    expect(ships.length).toBeGreaterThan(0);
    for (const ship of ships) expect(field.navigable(ship.point!, SEA_CHANNEL_HALF_WIDTH)).toBe(true);
  });
});
