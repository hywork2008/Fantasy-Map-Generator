import { describe, expect, it } from "vitest";
import type { RosterOrganization } from "../roster/types";
import { groupOrganizations, organizationPath } from "./organizationRosterNavigation";

const organization = (id: string, name: string, parentId?: string): RosterOrganization => ({
  id,
  name,
  parentId,
  stateId: 1,
  notes: "",
  simulate: false,
  generateSuccessors: false
});

describe("organization roster navigation", () => {
  it("separates institutions from alphabetically sorted settlements even when names resemble cities", () => {
    const court = { ...organization("state:1:court", "York Court", "state:1"), burgId: 2 };
    const groups = groupOrganizations(
      [
        organization("state:1", "Country"),
        organization("burg:2", "York", "state:1"),
        court,
        organization("holding:1", "York", "state:1"),
        organization("burg:3", "Bath", "state:1"),
        { ...organization("burg:4", "Archived", "state:1"), archived: true },
        organization("burg:5", "Elsewhere", "state:2")
      ],
      "state:1"
    );
    expect(groups.map(group => [group.kind, group.organizations.map(item => item.name)])).toEqual([
      ["institutions", ["York Court"]],
      ["territories", ["York"]],
      ["settlements", ["Bath", "York"]]
    ]);
  });

  it("returns every ancestor through the current organization in root order", () => {
    const country = organization("state:1", "Country");
    const court = organization("state:1:court", "Court", country.id);
    const household = organization("state:1:household", "Household", court.id);
    expect(organizationPath([household, country, court], household.id)).toEqual([country, court, household]);
    expect(organizationPath([country], undefined)).toEqual([]);
    expect(organizationPath([country], "missing")).toEqual([]);
  });

  it("terminates for cyclic parent links", () => {
    expect(organizationPath([organization("a", "A", "b"), organization("b", "B", "a")], "a")).toHaveLength(2);
  });
});
