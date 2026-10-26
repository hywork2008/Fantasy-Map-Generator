import { describe, expect, it } from "vitest";
import {
  type CropResidueState,
  consumeCropResidues,
  creditCropResidueHarvest,
  getCropResidueForecast,
  observeCropResidues,
  prepareCropResidues,
  residueCell
} from "./cropResidues";
import { forecastWinterFeedGap } from "./winterSlaughter";

const fixture = () => residueCell({ schemaVersion: 1, cells: {} } satisfies CropResidueState, 2);

describe("physical cereal residue reserves", () => {
  it("partitions a confirmed harvest once, preserving other uses and refusing rewound receipts", () => {
    const cell = fixture();
    expect(creditCropResidueHarvest(cell, 15608, 1, 1000)).toBe(true);
    const r = cell.receipts[0];
    expect(r.generatedKg).toBeCloseTo(r.soilReservedKg + r.otherUsesReservedKg + r.strawKg + r.stubbleKg);
    expect(r.generatedKg).toBe(850);
    expect(creditCropResidueHarvest(cell, 15608, 1, 1000)).toBe(false);
    expect(creditCropResidueHarvest(cell, 15607, 1, 1000)).toBe(false);
    expect(cell.lots).toHaveLength(1);
    expect(creditCropResidueHarvest(cell, 15608, 2, NaN)).toBe(false);
  });

  it("cannot collect without reserved work or draw on future harvests", () => {
    const cell = fixture();
    creditCropResidueHarvest(cell, 10, 1, 1000);
    const early = prepareCropResidues(cell, 9, 100, 100)!;
    expect(early.openingKg).toBe(0);
    expect(early.collectedKg).toBe(0);
    expect(consumeCropResidues(cell, 9, 100, 100)).toBe(0);
    const idle = prepareCropResidues(cell, 10, 100, 0)!;
    expect(idle.collectedKg).toBe(0);
    expect(idle.stubbleAccessKg).toBe(0);
    expect(consumeCropResidues(cell, 10, 100, 100)).toBe(0);
  });

  it("limits collection and field access to one work budget and balances physical stock", () => {
    const cell = fixture();
    creditCropResidueHarvest(cell, 10, 1, 1000);
    const sample = prepareCropResidues(cell, 10, 100, 0.1)!;
    expect(sample.workDays).toBeCloseTo(0.1);
    expect(sample.collectedKg).toBeCloseTo(30);
    const fed = consumeCropResidues(cell, 10, 100, 100);
    expect(fed).toBeCloseTo(20);
    expect(sample.strawConsumedKg + sample.stubbleConsumedKg).toBeGreaterThan(fed);
    expect(sample.openingKg).toBeCloseTo(
      sample.closingKg + sample.lossKg + sample.strawConsumedKg + sample.stubbleConsumedKg
    );
    expect(consumeCropResidues(cell, 10, 100, 100)).toBe(0);
    expect(prepareCropResidues(cell, 10, 100, 100)).toBeNull();
  });

  it("expires uncollected straw and stubble and applies elapsed storage losses without replay", () => {
    const cell = fixture();
    creditCropResidueHarvest(cell, 10, 1, 1000);
    prepareCropResidues(cell, 10, 100, 0.1);
    const sample = prepareCropResidues(cell, 13, 100, 0)!;
    expect(cell.lots[0].standingStrawKg).toBe(0);
    expect(cell.lots[0].stubbleKg).toBe(0);
    expect(cell.lots[0].storedStrawKg).toBeCloseTo(30 * 0.99 ** 3);
    expect(sample.openingKg).toBeCloseTo(sample.closingKg + sample.lossKg);
    const expired = prepareCropResidues(cell, 22, 100, 0)!;
    expect(expired.closingKg).toBe(0);
    expect(cell.lots).toHaveLength(0);
  });

  it("caps reserves and uses physical shortage rather than replacing an already sufficient ration", () => {
    const cell = fixture();
    creditCropResidueHarvest(cell, 10, 1, 100000);
    const s = prepareCropResidues(cell, 10, 100, 100)!;
    expect(s.collectedKg).toBeCloseTo(150);
    expect(consumeCropResidues(cell, 10, 100, 0)).toBe(0);
    expect(consumeCropResidues(cell, 10, 100, 7)).toBeCloseTo(7);
    expect(consumeCropResidues(cell, 10, 100, 100)).toBeCloseTo(13);
  });

  it("forecasts only stored residues and current funded access, with ration caps and expiry", () => {
    const cell = fixture();
    creditCropResidueHarvest(cell, 10, 1, 1000);
    prepareCropResidues(cell, 10, 100, 10);
    const forecast = getCropResidueForecast(cell, 10);
    const before = structuredClone(cell);
    expect(forecastWinterFeedGap(100, [0, 0, 0], 0, forecast)).toBeCloseTo(240);
    expect(cell).toEqual(before);
    expect(forecastWinterFeedGap(100, [100, 100, 100], 0, forecast)).toBe(0);
    expect(
      forecastWinterFeedGap(100, [0, 0], 0, {
        period: 21,
        storedLots: [{ expiresPeriod: 22, feedKg: 1000 }],
        currentStubbleFeedKg: 0
      })
    ).toBe(180);
    expect(forecastWinterFeedGap(10, [0], 0, forecast)).toBe(8);
  });
  it("reports material/work violations without treating an absent ledger as measured zero", () => {
    expect(observeCropResidues(null)).toBeNull();
    const state: CropResidueState = { schemaVersion: 1, cells: {} };
    const cell = residueCell(state, 0);
    creditCropResidueHarvest(cell, 10, 1, 1000);
    prepareCropResidues(cell, 10, 100, 0.1);
    consumeCropResidues(cell, 10, 100, 100);
    expect(observeCropResidues(state)?.maximumStockBalanceErrorKg).toBeLessThan(1e-8);
    expect(observeCropResidues(state)?.maximumAllocationErrorKg).toBeLessThan(1e-8);
    cell.samples[0].workDays += 1;
    cell.samples[0].closingKg += 2;
    cell.receipts[0].soilReservedKg += 3;
    const observed = observeCropResidues(state)!;
    expect(observed.workOverdraftSamples).toBe(1);
    expect(observed.maximumStockBalanceErrorKg).toBeCloseTo(2);
    expect(observed.maximumAllocationErrorKg).toBeCloseTo(3);
  });
  it("uses accessible stubble before older stored straw, matching the slaughter forecast", () => {
    const cell = fixture();
    cell.lots.push(
      { id: "old", period: 8, standingStrawKg: 0, storedStrawKg: 100, stubbleKg: 0 },
      { id: "new", period: 10, standingStrawKg: 0, storedStrawKg: 0, stubbleKg: 40 }
    );
    const sample = prepareCropResidues(cell, 10, 100, 1)!;
    expect(consumeCropResidues(cell, 10, 100, 100)).toBe(20);
    expect(sample.stubbleConsumedKg).toBe(40);
    expect(sample.strawConsumedKg).toBe(0);
    expect(cell.lots[0].storedStrawKg).toBeCloseTo(100 * 0.99 ** 2);
  });
});
