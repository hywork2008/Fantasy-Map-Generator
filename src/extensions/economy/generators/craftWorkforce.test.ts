import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A mine's crew of 10 required workers stands for 8,000 people (8 points at the default rate).
vi.mock("./mineOperations", () => ({ getMineRequiredWorkers: () => 10, getMineEmploymentPeople: () => 8000 }));

import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI } from "../../hostTypes";
import {
  clearEconomyContext,
  initEconomyContext,
  setAdministrationEmployment,
  setMineOperations,
  setMineralDeposits
} from "../economyContext";
import { getBasicWorkersByBurg, getCraftWorkforce } from "./craftWorkforce";
import type { MineOperation, MineralDeposit } from "./mineralResourcesTypes";

describe("craft workforce (docs/plan/child-labour-history.md §5)", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.populationRate = 1000;
  });
  afterEach(() => clearEconomyContext());

  const burg = (i: number, market: number, adults: number, children = 0, elders = 0) =>
    ({
      i,
      market,
      population: adults + children + elders,
      demographics: { capacity: 100, maleAdults: adults / 2, femaleAdults: adults / 2, children, elders }
    }) as unknown as Burg;

  it("counts adults and the children's share of work, not the elders", () => {
    expect(getCraftWorkforce(burg(1, 1, 4.7, 4, 1.3), 0, 0.13)).toBeCloseTo(4.7 + 4 * 0.13, 6);
  });

  it("shares a market's mine crews by the adults each Burg has left after its own industries", () => {
    const burgs = [undefined, burg(1, 1, 10), burg(2, 1, 10)];
    setAdministrationEmployment([{ burgId: 1, stateId: 1, workers: 4 }]);
    setMineralDeposits([{ i: 1 } as MineralDeposit]);
    setMineOperations([{ active: true, burgId: 2, marketId: 1, depositId: 1, workers: 10 } as MineOperation]);

    const basic = getBasicWorkersByBurg(burgs);

    // Burg 1 has 6 adults left, Burg 2 has 10: the 8 miners come 3 and 5 from them.
    expect(basic.get(1)).toBeCloseTo(4 + 3, 6);
    expect(basic.get(2)).toBeCloseTo(5, 6);
    expect(getCraftWorkforce(burgs[1]!, basic.get(1)!, 0)).toBeCloseTo(3, 6);
  });
});
