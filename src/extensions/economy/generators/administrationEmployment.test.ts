import { describe, expect, it } from "vitest";
import {
  ACADEMY_ADMIN_KNOWLEDGE_CAP_PEOPLE,
  ADMINISTRATION_EMPLOYMENT_BASE_PEOPLE,
  ADMINISTRATION_EMPLOYMENT_PEOPLE_PER_BURG,
  getAdministrationEmploymentPeople,
  getAdministrationRequiredWorkers
} from "./administrationEmployment";

describe("getAdministrationEmploymentPeople (docs/plan/craft-demand-calibration.md §2.0 P5)", () => {
  it("returns BASE + burgs*2 + pointsToPeople(statePop*0.005) at the default rate", () => {
    // Reference fixture: 1-burg capital, population 9 points, rate 1000.
    const people = getAdministrationEmploymentPeople({ rural: 0, urban: 9, burgs: 1 }, 1000);
    expect(people).toBeCloseTo(
      ADMINISTRATION_EMPLOYMENT_BASE_PEOPLE + 1 * ADMINISTRATION_EMPLOYMENT_PEOPLE_PER_BURG + 45,
      6
    );
  });

  it("exceeds ACADEMY_ADMIN_KNOWLEDGE_CAP_PEOPLE for any burg with at least one Burg, so the academy cap always binds", () => {
    const people = getAdministrationEmploymentPeople({ rural: 0, urban: 0, burgs: 1 }, 1000);
    expect(people).toBeGreaterThan(ACADEMY_ADMIN_KNOWLEDGE_CAP_PEOPLE);
  });

  it("is independent of getAdministrationRequiredWorkers() — the two units diverge deliberately", () => {
    const points = getAdministrationRequiredWorkers({ rural: 0, urban: 9, burgs: 1 });
    const people = getAdministrationEmploymentPeople({ rural: 0, urban: 9, burgs: 1 }, 1000);
    // The legacy points formula's BASE (4) scaled to people (×1000) would be 4000 — nowhere near
    // this authored people figure (~55). They must not be derived from one another.
    expect(people).toBeLessThan(points * 1000);
    expect(people).toBeGreaterThan(0);
  });

  it("scales the population term inversely with populationRate", () => {
    const atDefaultRate = getAdministrationEmploymentPeople({ rural: 0, urban: 9, burgs: 1 }, 1000);
    const atHalfRate = getAdministrationEmploymentPeople({ rural: 0, urban: 9, burgs: 1 }, 500);
    expect(atHalfRate).toBeLessThan(atDefaultRate);
  });
});
