import { describe, expect, it } from "vitest";
import { SHIP_CLASSES } from "./shipClasses";
import {
  getShipyardMaterialObservations,
  STRATEGIC_MATERIAL_TARGET_RESERVE_DAYS
} from "./strategicMaterialObservations";

describe("strategicMaterialObservations", () => {
  it("reports local stock alongside the central annual demand and 365-day reserve target", () => {
    const observations = getShipyardMaterialObservations(
      SHIP_CLASSES[0],
      [
        { i: 1, name: "Wood" },
        { i: 2, name: "Sails" },
        { i: 3, name: "Ropes" },
        { i: 4, name: "Tar" }
      ],
      {
        1: { stock: 1.5 },
        2: { stock: 2 },
        3: { stock: 0.75 },
        4: { stock: 0.25 }
      }
    );

    expect(STRATEGIC_MATERIAL_TARGET_RESERVE_DAYS).toBe(365);
    expect(observations).toEqual([
      { material: "Wood", stock: 1.5, annualDemand: 0.4, targetReserve: 0.4, inTransit: 0, sourceStateId: null },
      { material: "Sails", stock: 2, annualDemand: 0.4, targetReserve: 0.4, inTransit: 0, sourceStateId: null },
      { material: "Ropes", stock: 0.75, annualDemand: 0.4, targetReserve: 0.4, inTransit: 0, sourceStateId: null },
      { material: "Tar", stock: 0.25, annualDemand: 0.2, targetReserve: 0.2, inTransit: 0, sourceStateId: null }
    ]);
  });

  it("keeps a missing strategic Good distinct from an empty local stock row", () => {
    const observations = getShipyardMaterialObservations(SHIP_CLASSES[0], [{ i: 1, name: "Wood" }], {
      1: { stock: 0 }
    });

    expect(observations).toMatchObject([
      { material: "Wood", stock: 0 },
      { material: "Sails", stock: null },
      { material: "Ropes", stock: null },
      { material: "Tar", stock: null }
    ]);
  });
});
