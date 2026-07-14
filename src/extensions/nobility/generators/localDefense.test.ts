import { describe, expect, it } from "vitest";
import type { Burg } from "../../../types/models";
import { burgPopulationPeople, canOccupyBurg } from "./localDefense";

const burg = { population: 20 } as Burg;

describe("local burg defense", () => {
  it("converts a burg's population points to inhabitants", () => {
    expect(burgPopulationPeople(burg, 1000, 1.5)).toBe(30_000);
  });

  it("requires an occupying force based on inhabitants, not raw population points", () => {
    expect(canOccupyBurg(burg, 999, 1000, 1)).toBe(false);
    expect(canOccupyBurg(burg, 1000, 1000, 1)).toBe(true);
  });
});
