import { describe, expect, it } from "vitest";
import {
  DEFAULT_PEOPLE_PER_POPULATION_POINT,
  displayPeople,
  GUILD_SATURATION_PEOPLE,
  guildSaturationPoints,
  laborPeople,
  peopleToPoints,
  pointsToPeople,
  REFERENCE_FIXTURE_LABOR_PEOPLE
} from "./craftScale";

describe("craftScale", () => {
  it("maps the 9000-person fixture at rate 1000 to 9 population points", () => {
    expect(DEFAULT_PEOPLE_PER_POPULATION_POINT).toBe(1000);
    expect(REFERENCE_FIXTURE_LABOR_PEOPLE).toBe(9000);
    expect(peopleToPoints(9000, 1000)).toBe(9);
    expect(pointsToPeople(9, 1000)).toBe(9000);
    expect(laborPeople(9, 1000)).toBe(9000);
    expect(displayPeople(9, 1000, 1)).toBe(9000);
  });

  it("does not apply urbanization to occupational labor people", () => {
    expect(laborPeople(9, 1000)).toBe(9000);
    expect(displayPeople(9, 1000, 2)).toBe(18000);
  });

  it("guards a zero populationRate as 1", () => {
    expect(peopleToPoints(12, 0)).toBe(12);
    expect(pointsToPeople(12, 0)).toBe(12);
    expect(laborPeople(9, 0)).toBe(9);
  });

  it("converts 12-person guild saturation to 0.012 points at rate 1000", () => {
    expect(GUILD_SATURATION_PEOPLE).toBe(12);
    expect(guildSaturationPoints(1000)).toBeCloseTo(0.012, 9);
  });
});
