import { describe, expect, it } from "vitest";
import {
  domainShare,
  GOOD_DEMAND_CALIBRATION,
  getCalibratedMonthlyLots,
  getGoodDemandCalibration,
  laborPointsForLots
} from "./craftDemandCalibration";
import { laborPeople } from "./craftScale";
import { getOccupationalRow, referenceFixtureExpectedPeople } from "./occupationalCalibration";

describe("craftDemandCalibration", () => {
  it("authors barrel labor at 0.00106 pt/lot (share 0.50 applied)", () => {
    expect(getGoodDemandCalibration("Barrels")?.laborPointsPerLotAtDefaultRate).toBeCloseTo(0.00106, 5);
    const lots = getCalibratedMonthlyLots({ goodName: "Barrels", laborPeopleBurg: 9000, port: false });
    expect(lots).toBeCloseTo(9.36, 2);
    expect(laborPointsForLots("Barrels", 9.36, 1000)).toBeCloseTo(0.00992, 4);
    expect(laborPointsForLots("Barrels", 9.36, 1000)).not.toBeCloseTo(9.36, 1);
  });

  it("keeps Lab Glassware labor as an authored floor, not a runtime solve", () => {
    expect(getGoodDemandCalibration("Lab Glassware")?.laborPointsPerLotAtDefaultRate).toBe(0.108);
  });

  it("uses Liquor annualLotsPerPerson so 9000 people yield 0.25 lots/month", () => {
    expect(getGoodDemandCalibration("Liquor")?.annualLotsPerPerson).toBeCloseTo(0.000333, 6);
    expect(getCalibratedMonthlyLots({ goodName: "Liquor", laborPeopleBurg: 9000, port: false })).toBeCloseTo(
      0.24975,
      4
    );
  });

  it("has a numeric row for every guild-mapped good", () => {
    const names = getOccupationalRow("woodworking").goodNames.concat(
      getOccupationalRow("textiles").goodNames,
      getOccupationalRow("leather").goodNames,
      getOccupationalRow("metallurgy").goodNames,
      getOccupationalRow("masonry").goodNames,
      getOccupationalRow("glassware").goodNames,
      getOccupationalRow("printing").goodNames,
      getOccupationalRow("instruments").goodNames
    );
    for (const name of names) {
      const row = getGoodDemandCalibration(name);
      expect(row, name).toBeDefined();
      expect(row?.laborPointsPerLotAtDefaultRate, name).toBeGreaterThan(0);
      expect(row?.fixtureLotsPerMonth, name).toBeGreaterThan(0);
    }
    expect(GOOD_DEMAND_CALIBRATION).toHaveLength(names.length);
  });

  it("does not treat occupational typical as identical to lots × laborPointsPerLot", () => {
    const expectedPeople = referenceFixtureExpectedPeople("woodworking");
    const barrelLaborPeople =
      laborPointsForLots(
        "Barrels",
        getCalibratedMonthlyLots({ goodName: "Barrels", laborPeopleBurg: 9000, port: false }),
        1000
      ) * 1000;
    expect(barrelLaborPeople / expectedPeople).toBeCloseTo(0.5, 1);
  });

  it("scales laborPointsForLots inversely with populationRate", () => {
    const atDefault = laborPointsForLots("Ropes", 1, 1000);
    const at500 = laborPointsForLots("Ropes", 1, 500);
    expect(atDefault).toBeCloseTo(0.00396, 5);
    expect(at500).toBeCloseTo(0.00792, 5);
  });

  it("uses inland vs port domain shares", () => {
    expect(domainShare("Barrels", false)).toBe(0.5);
    expect(domainShare("Barrels", true)).toBe(0.3);
    expect(domainShare("Ropes", true)).toBe(0.5);
  });

  it("matches fixture labor people of 9000 from 9 points at rate 1000", () => {
    expect(laborPeople(9, 1000)).toBe(9000);
  });
});
