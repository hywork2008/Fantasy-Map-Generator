import { describe, expect, it, vi } from "vitest";
import autruyles from "../data/fixtures/autruyles-20261003.json";
import { cityEditorDocument, cityEditorSettings } from "../services/analysis/housingReport";
import { parseIncomingPayload } from "../services/io/incomingCity";
import { generateCityOnDocument } from "./generation/generateCity";
import {
  CLEAN_JUNCTION_DEGREES,
  frameRoadApproachBend,
  frameRoadJunction,
  frameRoadJunctionIssue
} from "./generation/routing/frameRoadConnection";
import * as meshOperations from "./mesh";
import { validate } from "./mesh";

function generate() {
  const share = parseIncomingPayload(JSON.stringify(autruyles))!;
  const city = generateCityOnDocument(cityEditorDocument(share), cityEditorSettings(share), share.seed)!;
  return { city, descriptor: share.descriptor };
}

describe("exterior road junction", () => {
  it("meets its town street in one straight line, without a sideways link", () => {
    const { city, descriptor } = generate();
    expect(city.frameRoads?.length).toBeGreaterThan(0);
    for (const leg of city.frameRoads!) {
      const junction = frameRoadJunction(city, leg, descriptor)!;
      expect(junction).not.toBeNull();
      expect(junction.stubLength).toBeLessThan(0.5);
      expect(frameRoadApproachBend(city, leg, descriptor)).toBeLessThanOrEqual(CLEAN_JUNCTION_DEGREES);
      expect(frameRoadJunctionIssue(city, leg, descriptor)).toBe("straight");
    }
  });

  it("keeps the mesh valid after splitting cells and moving vertices", () => {
    const { city } = generate();
    expect(validate(city)).toEqual([]);
  });

  it("shares the exterior start point with the street's last vertex", () => {
    const { city } = generate();
    for (const leg of city.frameRoads!) {
      const start = leg.pieces[0].points[0];
      const owned = Object.values(city.mesh.vertices).filter(v => v.point === start);
      expect(owned).toHaveLength(1);
    }
  });
});

it("preserves the complete generated city when local move rejection is enabled", () => {
  const indexed = generate().city;
  const spy = vi.spyOn(meshOperations, "createVertexMovePreflight").mockReturnValue(() => true);
  try {
    expect(generate().city).toEqual(indexed);
  } finally {
    spy.mockRestore();
  }
});
