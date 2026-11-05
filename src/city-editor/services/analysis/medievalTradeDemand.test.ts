import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { csvParse } from "d3";
import { describe, expect, it } from "vitest";
import { medievalTradeDemand } from "../../generators/medievalTradeDemand";

const rows = csvParse(
  readFileSync(resolve("docs/plan/medieval-urban-calibration-targets/occupations.csv"), "utf8")
).map(row => ({ ...row, domain: row.domain!, pool: row.pool!, per_1000_people: row.per_1000_people! }));
describe("fixed medieval trade observation demand", () => {
  it.each([
    [1000, 46, 28, 18, 7],
    [5000, 285, 155, 130, 9],
    [20000, 1144, 620, 524, 10]
  ])(
    "reproduces the reference at population %i",
    (population, workshops, mixedWorkshops, dedicatedWorkshops, inferredHalls) => {
      expect(medievalTradeDemand(rows, population)).toMatchObject({
        workshops,
        mixedWorkshops,
        dedicatedWorkshops,
        inferredHalls
      });
    }
  );
  it("rounds each occupation before aggregating a domain", () => {
    const result = medievalTradeDemand(rows, 1000);
    expect(result.domains.find(row => row.domain === "leather")).toMatchObject({ practitioners: 43, workshops: 15 });
    expect(result.trades.find(row => row.pool === "cutlery")?.workshops).toBe(0);
  });
  it("applies port, wine, employment, period and technology conditions independently", () => {
    const plain = medievalTradeDemand(rows, 5000);
    const port = medievalTradeDemand(rows, 5000, { port: true });
    expect(port.workshops - plain.workshops).toBe(6);
    const wine = medievalTradeDemand(rows, 5000, { wine: true });
    expect(wine.trades.find(row => row.pool === "brewing")?.workshops).toBe(4);
    expect(plain.trades.find(row => row.pool === "printing")?.workshops).toBe(0);
    expect(plain.trades.find(row => row.pool === "instrumentMaking")?.workshops).toBe(0);
    const later = medievalTradeDemand(rows, 5000, {
      period: "ageOfExploration",
      technologies: ["precisionInstrumentMaking"]
    });
    expect(later.trades.find(row => row.pool === "printing")?.workshops).toBe(4);
    expect(later.trades.find(row => row.pool === "instrumentMaking")?.workshops).toBe(2);
    expect(
      medievalTradeDemand(rows, 5000, { employmentShare: 0.3 }).trades.find(row => row.pool === "tailoring")?.workshops
    ).toBe(40);
  });
});
