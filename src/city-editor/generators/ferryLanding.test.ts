import { describe, expect, it } from "vitest";
import type { CityDocument } from "../types/document";
import { createDocument } from "./document";
import { ferryPlan } from "./ferryLanding";

type Connection = NonNullable<CityDocument["riverConnections"]>[number];
function fixture() {
  const document = createDocument("ferry-cache", 400);
  document.riverFlows = [
    {
      riverId: 1,
      points: [
        [0, -100],
        [0, 100]
      ],
      widthMeters: 20
    }
  ];
  const connection: Connection = {
    sourceIndex: 0,
    farRoad: [
      [20, 0],
      [40, 0]
    ],
    townRoad: [
      [-40, 0],
      [-20, 0]
    ],
    banks: [
      [-20, 0],
      [20, 0]
    ],
    crossing: {
      kind: "ferry",
      widthMeters: 40,
      depthMeters: 3,
      navigationRequired: true,
      clearanceMeters: 0,
      openingMeters: 0,
      reason: "tooWide"
    }
  };
  document.riverConnections = [connection];
  return { document, connection };
}

describe("ferry cache ownership and identity", () => {
  it("reuses a live document's plan without changing its saved data", () => {
    const { document, connection } = fixture();
    const before = JSON.stringify(document);
    const plan = ferryPlan(document, connection);
    expect(plan).not.toBeNull();
    expect(ferryPlan(document, connection)).toBe(plan);
    expect(JSON.stringify(document)).toBe(before);
  });
  it("recomputes when a connection is reused by another document or river flows change", () => {
    const { document, connection } = fixture();
    const first = ferryPlan(document, connection);
    const next = structuredClone(document);
    expect(ferryPlan(next, connection)).not.toBe(first);
    const second = ferryPlan(next, connection);
    next.riverFlows = [];
    expect(ferryPlan(next, connection)).toBeNull();
    expect(second).not.toBeNull();
  });
});
