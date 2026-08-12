import { describe, expect, it } from "vitest";
import { generateAnnualPrecipitation, type PrecipitationModelInput } from "./precipitationModel";

const CONSTANT_RANDOM_INTEGER = (minimum: number, maximum: number) => Math.floor((minimum + maximum) / 2);

function generate(precipitationPercent: number, winds: readonly number[] = [90, 90, 90, 90, 90, 90]) {
  const cellsX = 6;
  const cellsY = 6;
  const cellCount = cellsX * cellsY;
  const input: PrecipitationModelInput = {
    cellsX,
    cellsY,
    elevations: new Uint8Array(cellCount).fill(30),
    temperatures: new Int8Array(cellCount).fill(22),
    latN: 5,
    latS: -5,
    latT: 10,
    winds,
    resolutionModifier: 1,
    precipitationPercent,
    randomInteger: CONSTANT_RANDOM_INTEGER
  };
  return generateAnnualPrecipitation(input);
}

describe("generateAnnualPrecipitation", () => {
  it("makes every identical land cell at least as wet when global moisture increases", () => {
    const standard = generate(100).precipitation;
    const veryWet = generate(450).precipitation;

    for (let cellId = 0; cellId < standard.length; cellId++) {
      expect(veryWet[cellId]).toBeGreaterThanOrEqual(standard[cellId]);
    }
  });

  it("saturates converging high-moisture paths instead of wrapping them into dry values", () => {
    const veryWet = generate(500, [120, 120, 120, 120, 120, 120]).precipitation;

    expect(Array.from(veryWet).every(value => value >= 0 && value <= 255)).toBe(true);
    expect(Array.from(veryWet)).toContain(255);
    expect(Array.from(veryWet).filter(value => value < 20)).toHaveLength(0);
  });

  it("preserves rain-shadow variation while retaining the requested wind annotations", () => {
    const cellsX = 7;
    const cellsY = 5;
    const elevations = new Uint8Array(cellsX * cellsY).fill(30);
    for (let row = 0; row < cellsY; row++) elevations[row * cellsX + 3] = 90;
    const result = generateAnnualPrecipitation({
      cellsX,
      cellsY,
      elevations,
      temperatures: new Int8Array(cellsX * cellsY).fill(20),
      latN: 5,
      latS: -5,
      latT: 10,
      winds: [90, 90, 90, 90, 90, 90],
      resolutionModifier: 1,
      precipitationPercent: 100,
      randomInteger: CONSTANT_RANDOM_INTEGER
    });

    expect(result.windDirections.westerly).toHaveLength(cellsY);
    expect(result.windDirections.easterly).toHaveLength(0);
    expect(result.precipitation[2]).toBeGreaterThan(result.precipitation[5]);
  });
});
