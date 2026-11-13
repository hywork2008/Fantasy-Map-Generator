import { describe, expect, it } from "vitest";
import {
  ACADEMY_ADMIN_KNOWLEDGE_CAP_PEOPLE,
  ADMINISTRATION_EMPLOYMENT_BASE_PEOPLE,
  ADMINISTRATION_EMPLOYMENT_PEOPLE_PER_BURG,
  ADMINISTRATION_MAX_CAPITAL_ADULT_SHARE,
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

  it("scales the population term inversely with populationRate", () => {
    const atDefaultRate = getAdministrationEmploymentPeople({ rural: 0, urban: 9, burgs: 1 }, 1000);
    const atHalfRate = getAdministrationEmploymentPeople({ rural: 0, urban: 9, burgs: 1 }, 500);
    expect(atHalfRate).toBeLessThan(atDefaultRate);
  });
});

describe("getAdministrationRequiredWorkers", () => {
  it("is the authored headcount in population points", () => {
    const people = getAdministrationEmploymentPeople({ rural: 0, urban: 9, burgs: 1 }, 1000);
    expect(getAdministrationRequiredWorkers({ rural: 0, urban: 9, burgs: 1 }, 10, 1000)).toBeCloseTo(people / 1000, 9);
  });

  it("leaves most of a small capital's adults to other work under a large state", () => {
    // 2.7 million people ruled from a capital of 1,600 adults (docs/analytics/economy-start-20261102.md §4).
    const points = getAdministrationRequiredWorkers({ rural: 2700, urban: 25, burgs: 39 }, 1.6, 1000);
    expect(points).toBeCloseTo(1.6 * ADMINISTRATION_MAX_CAPITAL_ADULT_SHARE, 9);
  });
});
