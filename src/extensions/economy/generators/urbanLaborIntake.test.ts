import { afterEach, describe, expect, it } from "vitest";
import type { ExtensionAPI } from "../../hostTypes";
import { clearEconomyContext, getBanditCohorts, getMobileAdultCohorts, initEconomyContext } from "../economyContext";
import { calculateAnnualUrbanLaborIntake, UrbanLaborIntakeModule } from "./urbanLaborIntake";

afterEach(() => clearEconomyContext());

describe("annual urban labour intake", () => {
  it("uses population growth capacity but never exceeds food-supported remaining capacity", () => {
    const burg = {
      population: 100,
      demographics: { capacity: 110, effectiveCapacity: 101, children: 0, maleAdults: 0, femaleAdults: 0, elders: 0 }
    };

    expect(calculateAnnualUrbanLaborIntake(burg, 1.5, 1.15)).toBeCloseTo(1);
  });

  it("uses the base capacity when imported-food capacity is absent", () => {
    const burg = {
      population: 100,
      demographics: { capacity: 110, children: 0, maleAdults: 0, femaleAdults: 0, elders: 0 }
    };

    expect(calculateAnnualUrbanLaborIntake(burg, 0.5, 1)).toBeCloseTo(1);
  });

  it("settles only adults covered by nearby yearly intake and turns repeat failures into bandits", () => {
    const world = {
      graphWidth: 100,
      graphHeight: 100,
      pack: {
        cells: { p: [[0, 0]] },
        burgs: [
          { cell: 0 },
          {
            i: 1,
            cell: 0,
            state: 1,
            x: 10,
            y: 0,
            population: 100,
            demographics: {
              capacity: 101,
              effectiveCapacity: 101,
              children: 0,
              maleAdults: 50,
              femaleAdults: 50,
              elders: 0
            }
          }
        ]
      }
    };
    initEconomyContext({
      worldContext: world,
      simulationContext: { currentYear: 100, extensions: {} }
    } as unknown as ExtensionAPI);
    const module = new UrbanLaborIntakeModule();
    const neutralRandom = { rand: () => 0.5 };

    module.generateAnnualIntakes(world as never, neutralRandom);
    module.enqueueRuralDisplacement({
      originCell: 0,
      originState: 1,
      maleAdults: 1,
      femaleAdults: 1,
      yearsSearching: 0
    });
    const firstYear = module.resolveMobileAdults(world as never, neutralRandom);

    expect(firstYear.settledAdults).toBeCloseTo(1);
    expect(getMobileAdultCohorts()).toHaveLength(1);

    module.generateAnnualIntakes(world as never, neutralRandom);
    module.resolveMobileAdults(world as never, { rand: () => 0.4 });

    expect(getMobileAdultCohorts()).toHaveLength(0);
    expect(getBanditCohorts()).toHaveLength(1);
  });
});
