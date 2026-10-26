import { describe, expect, it } from "vitest";
import {
  aggregateProductionDiagnostics,
  type ProductionCycleDiagnostic,
  recordProductionDiagnostic
} from "./productionDiagnostics";

describe("production observation rollup", () => {
  it("counts one rejected evaluation with overlapping guards and retains paid work separately", () => {
    const diagnostic: ProductionCycleDiagnostic = { rows: [], steps: 2, maxSteps: 4 };
    recordProductionDiagnostic(diagnostic, "planning", 3, ["materials", "labor", "materials"]);
    recordProductionDiagnostic(diagnostic, "planning", 3, ["materials", "labor"]);
    recordProductionDiagnostic(diagnostic, "execution", 4, [], {
      outputLots: 2,
      wagesPaid: 7,
      laborPoints: 1,
      materialCost: 3
    });
    const input = {
      marketId: 1,
      workforcePoints: 3,
      chargedPoints: 1,
      unusedPoints: 2,
      productionDiagnostics: diagnostic
    };
    const before = structuredClone(input);
    const result = aggregateProductionDiagnostics([input, input]);
    expect(result[0].rows).toEqual([
      { stage: "planning", goodId: 3, primary: "materials", constraints: ["materials", "labor"], count: 4 },
      {
        stage: "execution",
        goodId: 4,
        primary: null,
        constraints: [],
        count: 2,
        outputLots: 4,
        wagesPaid: 14,
        laborPoints: 2,
        materialCost: 6
      }
    ]);
    expect(result[0]).toMatchObject({ steps: 4, maxSteps: 8, unusedPoints: 4 });
    expect(input).toEqual(before);
  });
});
