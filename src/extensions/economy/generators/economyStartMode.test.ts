import { describe, expect, it } from "vitest";
import { getEconomyStartProfile } from "./economyStartMode";

describe("economy start profiles", () => {
  it("keeps legacy maps provisioned when the saved option is absent", () => {
    expect(getEconomyStartProfile({}).burgTreasuryPerPopulation).toBe(20);
  });

  it("makes balanced and subsistence starts progressively less capitalized", () => {
    const provisioned = getEconomyStartProfile({ economyStartMode: "provisioned" });
    const balanced = getEconomyStartProfile({ economyStartMode: "balanced" });
    const subsistence = getEconomyStartProfile({ economyStartMode: "subsistence" });

    expect(balanced.burgTreasuryPerPopulation).toBeLessThan(provisioned.burgTreasuryPerPopulation);
    expect(subsistence.burgTreasuryPerPopulation).toBeLessThan(balanced.burgTreasuryPerPopulation);
    expect(balanced.stateTreasuryPerPopulation).toBeGreaterThan(0);
    expect(balanced.stateAdministrativeUpkeepShare).toBeGreaterThan(0);
    expect(subsistence.stateRemittanceShare).toBeLessThan(balanced.stateRemittanceShare);
  });
});
