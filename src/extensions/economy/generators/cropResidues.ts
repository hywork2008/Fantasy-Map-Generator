import { pow } from "../../../simulation/deterministicMath";
/** Experimental cereal residues: real harvest provenance, exclusive allocations and finite stocks. */
export const CROP_RESIDUE_POLICY = {
  id: "temperate-cereal-residue-experiment-v1",
  grainDryMatterShare: 0.85,
  residueDmPerGrainDm: 1,
  soilShare: 0.5,
  otherUsesShare: 0.2,
  strawShare: 0.25,
  stubbleShare: 0.05,
  collectionDaysPerTonne: 2,
  accessDaysPerTonne: 1,
  storageLoss: 0.01,
  strawFeedEquivalent: 0.4,
  stubbleFeedEquivalent: 0.5,
  maximumRationShare: 0.2,
  reservePeriods: 3
} as const;

export interface CropResidueLot {
  id: string;
  period: number;
  standingStrawKg: number;
  storedStrawKg: number;
  stubbleKg: number;
}
export interface CropResidueReceipt {
  id: string;
  period: number;
  goodId: number;
  grainKg: number;
  generatedKg: number;
  soilReservedKg: number;
  otherUsesReservedKg: number;
  strawKg: number;
  stubbleKg: number;
}
export interface CropResidueSample {
  period: number;
  openingKg: number;
  closingKg: number;
  collectedKg: number;
  lossKg: number;
  strawConsumedKg: number;
  stubbleConsumedKg: number;
  feedEquivalentKg: number;
  workDays: number;
  workCapacityDays: number;
  stubbleAccessKg: number;
}
export interface CropResidueCell {
  lastHarvestByGood: Record<number, number>;
  lots: CropResidueLot[];
  receipts: CropResidueReceipt[];
  samples: CropResidueSample[];
  lastPeriod?: number;
}
export interface CropResidueState {
  schemaVersion: 1;
  cells: Record<number, CropResidueCell>;
}
const p = CROP_RESIDUE_POLICY;
const nonnegative = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0);
export function residueCell(state: CropResidueState, cell: number): CropResidueCell {
  state.cells[cell] ??= { lastHarvestByGood: {}, lots: [], receipts: [], samples: [] };
  return state.cells[cell];
}

/** Called only with a confirmed physical harvest, once per crop/cell/period. */
export function creditCropResidueHarvest(
  cell: CropResidueCell,
  period: number,
  goodId: number,
  grainKg: number
): boolean {
  if (!Number.isSafeInteger(period) || !Number.isSafeInteger(goodId) || !(grainKg > 0) || !Number.isFinite(grainKg))
    return false;
  if ((cell.lastHarvestByGood[goodId] ?? -Infinity) >= period) return false;
  const generatedKg = grainKg * p.grainDryMatterShare * p.residueDmPerGrainDm;
  const receipt = {
    id: `${period}:${goodId}`,
    period,
    goodId,
    grainKg,
    generatedKg,
    soilReservedKg: generatedKg * p.soilShare,
    otherUsesReservedKg: generatedKg * p.otherUsesShare,
    strawKg: generatedKg * p.strawShare,
    stubbleKg: generatedKg * p.stubbleShare
  };
  cell.lastHarvestByGood[goodId] = period;
  cell.receipts = cell.receipts.filter(row => row.period > period - 36);
  cell.receipts.push(receipt);
  cell.lots.push({
    id: receipt.id,
    period,
    standingStrawKg: receipt.strawKg,
    storedStrawKg: 0,
    stubbleKg: receipt.stubbleKg
  });
  return true;
}

/** Old stocks age even after disabling new harvests. Future receipts cannot feed earlier periods. */
export function prepareCropResidues(
  cell: CropResidueCell,
  period: number,
  needKg: number,
  workDays: number
): CropResidueSample | null {
  if ((cell.lastPeriod ?? -Infinity) >= period) return null;
  const lots = cell.lots.filter(lot => lot.period <= period);
  const total = () => lots.reduce((sum, lot) => sum + lot.standingStrawKg + lot.storedStrawKg + lot.stubbleKg, 0);
  const openingKg = total();
  let lossKg = 0;
  for (const lot of lots) {
    const elapsed = Math.max(0, period - Math.max(lot.period, cell.lastPeriod ?? lot.period));
    const loss = lot.storedStrawKg * (1 - pow(1 - p.storageLoss, elapsed));
    lot.storedStrawKg -= loss;
    lossKg += loss;
    if (period > lot.period + 1) {
      lossKg += lot.standingStrawKg;
      lot.standingStrawKg = 0;
    }
    if (period > lot.period + 2) {
      lossKg += lot.stubbleKg;
      lot.stubbleKg = 0;
    }
    if (period >= lot.period + 12) {
      lossKg += lot.storedStrawKg;
      lot.storedStrawKg = 0;
    }
  }
  const capacity = nonnegative(workDays);
  let remainingDays = capacity;
  // Opening field access uses the same herding reservation as collection and slaughter.
  const stubbleAccessKg = Math.min(
    lots.reduce((sum, lot) => sum + lot.stubbleKg, 0),
    (nonnegative(needKg) * p.maximumRationShare) / p.stubbleFeedEquivalent,
    (remainingDays * 1000) / p.accessDaysPerTonne
  );
  remainingDays -= (stubbleAccessKg * p.accessDaysPerTonne) / 1000;
  const stored = lots.reduce((sum, lot) => sum + lot.storedStrawKg, 0);
  let target = Math.max(
    0,
    (nonnegative(needKg) * p.maximumRationShare * p.reservePeriods) / p.strawFeedEquivalent - stored
  );
  let collectedKg = 0;
  for (const lot of lots.sort((a, b) => a.period - b.period || a.id.localeCompare(b.id))) {
    const collected = Math.min(lot.standingStrawKg, target, (remainingDays * 1000) / p.collectionDaysPerTonne);
    lot.standingStrawKg -= collected;
    lot.storedStrawKg += collected;
    target -= collected;
    collectedKg += collected;
    remainingDays = Math.max(0, remainingDays - (collected * p.collectionDaysPerTonne) / 1000);
  }
  cell.lots = cell.lots.filter(
    lot => lot.period > period || lot.standingStrawKg + lot.storedStrawKg + lot.stubbleKg > 1e-9
  );
  const sample: CropResidueSample = {
    period,
    openingKg,
    closingKg: total(),
    collectedKg,
    lossKg,
    strawConsumedKg: 0,
    stubbleConsumedKg: 0,
    feedEquivalentKg: 0,
    workDays: capacity - remainingDays,
    workCapacityDays: capacity,
    stubbleAccessKg
  };
  cell.lastPeriod = period;
  cell.samples = cell.samples.filter(row => row.period > period - 36);
  cell.samples.push(sample);
  return sample;
}

/** Low-quality roughage is capped and discounted; never claim one kg replaces one kg hay. */
export function consumeCropResidues(cell: CropResidueCell, period: number, needKg: number, shortageKg: number): number {
  const sample = cell.samples.find(row => row.period === period);
  if (!sample) return 0;
  let remaining = Math.min(
    nonnegative(shortageKg),
    Math.max(0, nonnegative(needKg) * p.maximumRationShare - sample.feedEquivalentKg)
  );
  const before = remaining;
  let access = Math.max(0, sample.stubbleAccessKg - sample.stubbleConsumedKg);
  const lots = cell.lots
    .filter(lot => lot.period <= period)
    .sort((a, b) => a.period - b.period || a.id.localeCompare(b.id));
  for (const lot of lots) {
    const stubble = Math.min(lot.stubbleKg, access, remaining / p.stubbleFeedEquivalent);
    lot.stubbleKg -= stubble;
    sample.stubbleConsumedKg += stubble;
    access -= stubble;
    remaining = Math.max(0, remaining - stubble * p.stubbleFeedEquivalent);
  }
  // Match the slaughter forecast: perishables first, then oldest stored straw.
  for (const lot of lots) {
    const straw = Math.min(lot.storedStrawKg, remaining / p.strawFeedEquivalent);
    lot.storedStrawKg -= straw;
    sample.strawConsumedKg += straw;
    remaining = Math.max(0, remaining - straw * p.strawFeedEquivalent);
  }
  const fed = before - remaining;
  sample.feedEquivalentKg += fed;
  sample.closingKg = cell.lots
    .filter(lot => lot.period <= period)
    .reduce((sum, lot) => sum + lot.standingStrawKg + lot.storedStrawKg + lot.stubbleKg, 0);
  return fed;
}

export interface CropResidueForecast {
  period: number;
  storedLots: { expiresPeriod: number; feedKg: number }[];
  currentStubbleFeedKg: number;
}
export function getCropResidueForecast(cell: CropResidueCell | undefined, period: number): CropResidueForecast {
  const sample = cell?.samples.find(row => row.period === period);
  return {
    period,
    storedLots: (cell?.lots ?? [])
      .filter(lot => lot.period <= period && period < lot.period + 12)
      .map(lot => ({ expiresPeriod: lot.period + 12, feedKg: lot.storedStrawKg * p.strawFeedEquivalent })),
    currentStubbleFeedKg: sample
      ? Math.max(0, sample.stubbleAccessKg - sample.stubbleConsumedKg) * p.stubbleFeedEquivalent
      : 0
  };
}

/** Read-only audit of the retained 36-period window; raw DM and feed equivalent stay separate. */
export function observeCropResidues(state: CropResidueState | null) {
  if (!state) return null;
  const cells = Object.values(state.cells);
  const receipts = cells.flatMap(cell => cell.receipts);
  const samples = cells.flatMap(cell => cell.samples);
  const sum = <T>(rows: T[], value: (row: T) => number) => rows.reduce((total, row) => total + value(row), 0);
  return {
    schemaVersion: 1,
    policyId: p.id,
    receiptCount: receipts.length,
    sampleCount: samples.length,
    generatedKg: sum(receipts, row => row.generatedKg),
    soilReservedKg: sum(receipts, row => row.soilReservedKg),
    otherUsesReservedKg: sum(receipts, row => row.otherUsesReservedKg),
    collectedKg: sum(samples, row => row.collectedKg),
    lossKg: sum(samples, row => row.lossKg),
    strawConsumedKg: sum(samples, row => row.strawConsumedKg),
    stubbleConsumedKg: sum(samples, row => row.stubbleConsumedKg),
    feedEquivalentKg: sum(samples, row => row.feedEquivalentKg),
    workDays: sum(samples, row => row.workDays),
    remainingKg: sum(
      cells.flatMap(cell => cell.lots),
      lot => lot.standingStrawKg + lot.storedStrawKg + lot.stubbleKg
    ),
    maximumAllocationErrorKg: receipts.reduce(
      (maximum, row) =>
        Math.max(
          maximum,
          Math.abs(row.generatedKg - row.soilReservedKg - row.otherUsesReservedKg - row.strawKg - row.stubbleKg)
        ),
      0
    ),
    maximumStockBalanceErrorKg: samples.reduce(
      (maximum, row) =>
        Math.max(
          maximum,
          Math.abs(row.openingKg - row.closingKg - row.lossKg - row.strawConsumedKg - row.stubbleConsumedKg)
        ),
      0
    ),
    workOverdraftSamples: samples.filter(row => row.workDays > row.workCapacityDays + 1e-8).length
  };
}
