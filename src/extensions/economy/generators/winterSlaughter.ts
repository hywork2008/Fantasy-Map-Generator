import { pow } from "../../../simulation/deterministicMath";
import { CROP_RESIDUE_POLICY, type CropResidueForecast } from "./cropResidues";
import type { FaunaCohorts } from "./faunaPopulationTypes";
import { ANNUAL_FEED_DM_KG_PER_HEAD, HAY_STORAGE_LOSS_PER_MONTH } from "./livestockFeedPolicy";
import { commitSlaughter, type SlaughterTransactionState } from "./slaughterTransactions";
import {
  EXPERIMENTAL_CARCASS_PROFILES,
  WINTER_SLAUGHTER_POLICY,
  type WinterPreservationMethod
} from "./winterSlaughterPolicy";
import { SHEEP_ANNUAL_WOOL_KG } from "./woolProductionPolicy";

export interface WinterMeatStock {
  id: string;
  batchId: string;
  ownerId: string;
  locationId: string;
  method: WinterPreservationMethod;
  remainingKg: number;
  expiresPeriod: number;
}

export interface WinterPreservationJob {
  id: string;
  batchId: string;
  cellId: number;
  ownerId: string;
  locationId: string;
  method: WinterPreservationMethod;
  inputKg: number;
  saltIssuedKg: number;
  /** Conservative experiment: issued salt is spent, never returned or counted as meat. */
  saltRetainedKg: number;
  saltDiscardedKg: number;
  woodKg: number;
  workDays: number;
  startPeriod: number;
  readyPeriod: number;
  shelfPeriods: number;
  outputKg: number;
  lossKg: number;
  status: "processing" | "completed";
}

export interface WinterSlaughterSample {
  decisions?: {
    species: string;
    cohort: "young" | "old";
    eligibleHeads: number;
    laborHeads: number;
    handlingHeads: number;
    outletHeads: number;
    selectedHeads: number;
    freshCapacityKg: number;
    preservationCapacityKg: number;
  }[];
  cellId: number;
  period: number;
  ownerId: string;
  policyId: string;
  eligibleSeason: boolean;
  reason: "feed-preparation" | "mast-finish" | "none";
  heads: Record<string, number>;
  cohortHeads: Record<string, FaunaCohorts>;
  sourceOpeningCohorts: Record<string, FaunaCohorts>;
  sourceClosingCohorts: Record<string, FaunaCohorts>;
  foregoneAnnualWoolPotentialKg: number;
  feedNeedBeforeKg: number;
  feedNeedAfterKg: number;
  forecastUnmetBeforeKg: number;
  forecastUnmetAfterKg: number;
  pigFeedSavedKg: null;
  carcassKg: number;
  edibleRecoveredKg: number;
  nonFoodKg: number;
  preservationInputKg: number;
  completedKg: number;
  processingLossKg: number;
  freshConsumedKg: number;
  preservedConsumedKg: number;
  spoilageKg: number;
  saltKg: number;
  woodKg: number;
  spending: number;
  workDays: number;
  workCapacityDays: number;
  workBudgetBasis?: "calendar" | "legacy-average";
  workReservedDays?: number;
  careWorkDays?: number;
  hayWorkDays?: number;
  cropResidueWorkDays?: number;
  handlingCapacityKg: number;
  storageCapacityKg: number;
  dietaryKcal: number;
  dietaryProteinKg: number;
  stockEndKg: number;
  processingEndKg: number;
}

export interface WinterSlaughterState extends SlaughterTransactionState {
  schemaVersion: 1;
  jobs: Record<string, WinterPreservationJob>;
  stocks: Record<string, WinterMeatStock>;
  lastPeriodByCell: Record<number, number>;
  samples: WinterSlaughterSample[];
}

export interface WinterSlaughterInput {
  cellId: number;
  period: number;
  people: number;
  herds: Record<string, FaunaCohorts>;
  allowedSpecies: readonly string[];
  temperaturesC: readonly number[];
  /** Current month first. No uncontracted purchases or future hay harvests. */
  forageKg: readonly number[];
  hayKg: number;
  cropResidues?: CropResidueForecast;
  workDays: number;
  handlingKg: number;
  storageKg: number;
  saltKg: number;
  woodKg: number;
  saltPricePerKg: number;
  woodPricePerKg: number;
  cashBudget: number;
}

export function createWinterSlaughterState(): WinterSlaughterState {
  return {
    schemaVersion: 1,
    lots: {},
    receipts: {},
    portions: {},
    jobs: {},
    stocks: {},
    lastPeriodByCell: {},
    samples: []
  };
}

export function forecastWinterFeedGap(
  monthlyNeedKg: number,
  forageKg: readonly number[],
  hayKg: number,
  residues?: CropResidueForecast
): number {
  let hay = Math.max(0, hayKg);
  let gap = 0;
  const straw = residues?.storedLots.map(lot => ({ ...lot })) ?? [];
  for (const [index, grown] of forageKg.entries()) {
    if (index > 0) hay *= 1 - HAY_STORAGE_LOSS_PER_MONTH;
    const need = Math.max(0, monthlyNeedKg - grown);
    const fed = Math.min(hay, need);
    hay -= fed;
    let remaining = need - fed;
    let allowance = monthlyNeedKg * CROP_RESIDUE_POLICY.maximumRationShare;
    const stubble = index === 0 ? Math.min(remaining, allowance, residues?.currentStubbleFeedKg ?? 0) : 0;
    remaining -= stubble;
    allowance -= stubble;
    for (const lot of straw) {
      if (index > 0) lot.feedKg *= 1 - CROP_RESIDUE_POLICY.storageLoss;
      if ((residues?.period ?? 0) + index >= lot.expiresPeriod) continue;
      const used = Math.min(remaining, allowance, lot.feedKg);
      lot.feedKg -= used;
      allowance -= used;
      remaining -= used;
    }
    gap += remaining;
  }
  return gap;
}

function feedNeed(herds: Record<string, FaunaCohorts>): number {
  return Object.entries(herds).reduce(
    (sum, [name, herd]) =>
      sum + ((herd.young + herd.breeding + herd.old) * (ANNUAL_FEED_DM_KG_PER_HEAD[name] ?? 0)) / 12,
    0
  );
}

/** Climate-relative season, with no fixed northern calendar month or constant-climate winter. */
export function isWinterPreparationSeason(temperaturesC: readonly number[], month: number): boolean {
  if (temperaturesC.length !== 12 || !temperaturesC.every(Number.isFinite)) return false;
  const p = WINTER_SLAUGHTER_POLICY;
  const mean = temperaturesC.reduce((sum, value) => sum + value, 0) / 12;
  // This experiment explicitly excludes polar and hot/arid annual regimes.
  if (mean < 0 || mean > 18 || Math.max(...temperaturesC) < 15 || Math.max(...temperaturesC) > 30) return false;
  if (Math.max(...temperaturesC) - Math.min(...temperaturesC) < p.minimumSeasonalRangeC) return false;
  const current = temperaturesC[month];
  const next = temperaturesC[(month + 1) % 12];
  return current <= p.preparationMaxC && (next < current || current <= p.coldSeasonC);
}

/** Planned work is an allocation request, never an extra worker or guaranteed material supply. */
export function getWinterSlaughterWorkPlan(
  herds: Readonly<Record<string, FaunaCohorts>>,
  temperaturesC: readonly number[],
  people: number
): { annualDays: number; monthlyWeights: number[] } {
  const months = Array.from({ length: 12 }, (_, month) => isWinterPreparationSeason(temperaturesC, month));
  const count = months.filter(Boolean).length;
  if (!count || !(people > 0)) return { annualDays: 0, monthlyWeights: Array(12).fill(0) };
  let carcass = 0;
  let edible = 0;
  for (const [species, profile] of Object.entries(EXPERIMENTAL_CARCASS_PROFILES)) {
    const herd = herds[species];
    if (!herd) continue;
    const heads =
      Math.floor(Math.max(0, herd.old)) +
      Math.floor(Math.max(0, herd.young - herd.breeding * WINTER_SLAUGHTER_POLICY.youngRetainedPerBreeder)) *
        WINTER_SLAUGHTER_POLICY.youngYieldFactor;
    carcass += heads * profile.carcassKgPerHead;
    edible += heads * (profile.leanKgPerHead + profile.edibleFatKgPerHead);
  }
  const outlet =
    people * (WINTER_SLAUGHTER_POLICY.reserveKgPerPerson + count * WINTER_SLAUGHTER_POLICY.freshKgPerPersonMonth);
  return {
    annualDays: carcass * WINTER_SLAUGHTER_POLICY.workDaysPerKg * Math.min(1, edible > 0 ? outlet / edible : 0),
    monthlyWeights: months.map(eligible => (eligible ? 1 / count : 0))
  };
}

function validateInput(input: WinterSlaughterInput): void {
  const nonnegative = [
    input.people,
    input.hayKg,
    input.workDays,
    input.handlingKg,
    input.storageKg,
    input.saltKg,
    input.woodKg,
    input.saltPricePerKg,
    input.woodPricePerKg,
    input.cashBudget,
    ...input.forageKg,
    ...Object.values(input.herds).flatMap(herd => Object.values(herd))
  ];
  if (
    !Number.isSafeInteger(input.cellId) ||
    input.cellId < 0 ||
    !Number.isSafeInteger(input.period) ||
    input.forageKg.length !== WINTER_SLAUGHTER_POLICY.forecastMonths ||
    nonnegative.some(value => !Number.isFinite(value) || value < 0)
  )
    throw new Error("Invalid winter slaughter resources");
}

/** Runs against caller-owned work copies; the host publishes inputs, money and this ledger together. */
export function settleWinterSlaughterCell(
  state: WinterSlaughterState,
  input: WinterSlaughterInput
): WinterSlaughterSample | null {
  validateInput(input);
  if ((state.lastPeriodByCell[input.cellId] ?? -Infinity) >= input.period) return null;
  const p = WINTER_SLAUGHTER_POLICY;
  const ownerId = `rural-cell:${input.cellId}`;
  const locationId = `cell:${input.cellId}`;
  const month = ((input.period % 12) + 12) % 12;
  const sample: WinterSlaughterSample = {
    cellId: input.cellId,
    period: input.period,
    ownerId,
    policyId: p.id,
    eligibleSeason: isWinterPreparationSeason(input.temperaturesC, month),
    reason: "none",
    decisions: [],
    heads: {},
    cohortHeads: {},
    sourceOpeningCohorts: structuredClone(input.herds),
    sourceClosingCohorts: {},
    foregoneAnnualWoolPotentialKg: 0,
    feedNeedBeforeKg: feedNeed(input.herds),
    feedNeedAfterKg: 0,
    forecastUnmetBeforeKg: 0,
    forecastUnmetAfterKg: 0,
    pigFeedSavedKg: null,
    carcassKg: 0,
    edibleRecoveredKg: 0,
    nonFoodKg: 0,
    preservationInputKg: 0,
    completedKg: 0,
    processingLossKg: 0,
    freshConsumedKg: 0,
    preservedConsumedKg: 0,
    spoilageKg: 0,
    saltKg: 0,
    woodKg: 0,
    spending: 0,
    workDays: 0,
    workCapacityDays: input.workDays,
    handlingCapacityKg: input.handlingKg,
    storageCapacityKg: input.storageKg,
    dietaryKcal: 0,
    dietaryProteinKg: 0,
    stockEndKg: 0,
    processingEndKg: 0
  };
  sample.forecastUnmetBeforeKg = forecastWinterFeedGap(
    sample.feedNeedBeforeKg,
    input.forageKg,
    input.hayKg,
    input.cropResidues
  );
  // Age only previously completed stocks. Jobs complete into new stocks AFTER this pass.
  const previousPeriod = state.lastPeriodByCell[input.cellId];
  for (const stock of Object.values(state.stocks)) {
    if (stock.ownerId !== ownerId || stock.locationId !== locationId) continue;
    const elapsed = previousPeriod === undefined ? 0 : input.period - previousPeriod;
    const remaining =
      input.period >= stock.expiresPeriod ? 0 : stock.remainingKg * pow(1 - p.preservedStorageLoss, elapsed);
    sample.spoilageKg += stock.remainingKg - remaining;
    stock.remainingKg = remaining;
  }
  for (const job of Object.values(state.jobs)) {
    if (job.cellId !== input.cellId || job.status !== "processing" || job.readyPeriod > input.period) continue;
    job.status = "completed";
    const expiresPeriod = job.readyPeriod + job.shelfPeriods;
    const elapsed = Math.max(0, input.period - job.readyPeriod);
    const remaining = input.period >= expiresPeriod ? 0 : job.outputKg * pow(1 - p.preservedStorageLoss, elapsed);
    state.stocks[job.id] = {
      id: job.id,
      batchId: job.batchId,
      ownerId: job.ownerId,
      locationId: job.locationId,
      method: job.method,
      remainingKg: remaining,
      expiresPeriod
    };
    sample.completedKg += job.outputKg;
    sample.processingLossKg += job.lossKg;
    sample.spoilageKg += job.outputKg - remaining;
  }
  let foodNeed = input.people * p.freshKgPerPersonMonth;
  const ownStocks = Object.values(state.stocks)
    .filter(stock => stock.ownerId === ownerId && stock.locationId === locationId)
    .sort((a, b) => a.expiresPeriod - b.expiresPeriod || a.id.localeCompare(b.id));
  for (const stock of ownStocks) {
    const used = Math.min(foodNeed, stock.remainingKg);
    stock.remainingKg -= used;
    foodNeed -= used;
    sample.preservedConsumedKg += used;
  }
  const occupiedKg = () =>
    ownStocks.reduce((sum, stock) => sum + stock.remainingKg, 0) +
    Object.values(state.jobs).reduce(
      (sum, job) => sum + (job.cellId === input.cellId && job.status === "processing" ? job.inputKg : 0),
      0
    );
  let storageLeft = Math.max(0, Math.min(input.storageKg, input.people * p.reserveKgPerPerson) - occupiedKg());
  let workLeft = input.workDays;
  let handlingLeft = input.handlingKg;
  let saltLeft = input.saltKg;
  let woodLeft = input.woodKg;
  let cashLeft = input.cashBudget;
  let monthlyNeed = sample.feedNeedBeforeKg;
  // Old stock first; renewal young are protected. Breeding and draft animals are never candidates.
  if (sample.eligibleSeason)
    for (const cohort of ["old", "young"] as const) {
      for (const species of ["Pig", "Cattle", "Sheep"]) {
        const herd = input.herds[species];
        const adult = EXPERIMENTAL_CARCASS_PROFILES[species];
        if (!herd || !adult || !input.allowedSpecies.includes(species)) continue;
        const gap = forecastWinterFeedGap(monthlyNeed, input.forageKg, input.hayKg, input.cropResidues);
        const perHeadFeed = (ANNUAL_FEED_DM_KG_PER_HEAD[species] ?? 0) / 12;
        // Pig season is an authored mast-finish scenario, NOT a saving of the grazing ledger.
        if (species !== "Pig" && !(gap > 0)) continue;
        const factor = cohort === "young" ? p.youngYieldFactor : 1;
        const profile = {
          ...adult,
          id: `${adult.id}-${cohort}`,
          carcassKgPerHead: adult.carcassKgPerHead * factor,
          leanKgPerHead: adult.leanKgPerHead * factor,
          edibleFatKgPerHead: adult.edibleFatKgPerHead * factor,
          otherCarcassKgPerHead: adult.otherCarcassKgPerHead * factor
        };
        const eligible = Math.floor(
          Math.max(0, herd[cohort] - (cohort === "young" ? herd.breeding * p.youngRetainedPerBreeder : 0))
        );
        const ediblePerHead = profile.leanKgPerHead + profile.edibleFatKgPerHead;
        // Select smoking only when real fuel is present. Salt curing remains a distinct process.
        const safeWaitingClimate = (periods: number) =>
          Array.from({ length: periods + 1 }, (_, ahead) => input.temperaturesC[(month + ahead) % 12]).every(
            value => value <= p.preparationMaxC
          );
        const method: WinterPreservationMethod =
          woodLeft >= ediblePerHead * p.smokingWoodKgPerInputKg && safeWaitingClimate(p.smokingPeriods)
            ? "smoked"
            : "salted";
        const fuelPerKg = method === "smoked" ? p.smokingWoodKgPerInputKg : 0;
        const costPerKg = input.saltPricePerKg * p.saltKgPerInputKg + input.woodPricePerKg * fuelPerKg;
        const preserveCap = !safeWaitingClimate(method === "smoked" ? p.smokingPeriods : p.curingPeriods)
          ? 0
          : Math.min(
              storageLeft,
              saltLeft / p.saltKgPerInputKg,
              fuelPerKg > 0 ? woodLeft / fuelPerKg : Infinity,
              costPerKg > 0 ? cashLeft / costPerKg : 0
            );
        const decision = {
          species,
          cohort,
          eligibleHeads: eligible,
          handlingHeads: Math.floor(handlingLeft / profile.carcassKgPerHead),
          laborHeads: Math.floor(workLeft / (profile.carcassKgPerHead * p.workDaysPerKg)),
          outletHeads: Math.floor((foodNeed + preserveCap + 1e-9) / ediblePerHead),
          selectedHeads: 0,
          freshCapacityKg: foodNeed,
          preservationCapacityKg: preserveCap
        };
        sample.decisions!.push(decision);
        let heads = Math.min(eligible, decision.handlingHeads, decision.laborHeads, decision.outletHeads);
        if (heads <= 0) continue;
        if (perHeadFeed > 0) {
          let low = 1,
            high = heads;
          while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if (
              forecastWinterFeedGap(
                Math.max(0, monthlyNeed - mid * perHeadFeed),
                input.forageKg,
                input.hayKg,
                input.cropResidues
              ) <= 1e-8
            )
              high = mid;
            else low = mid + 1;
          }
          heads = low;
        }
        decision.selectedHeads = heads;
        const id = `winter:${input.period}:${input.cellId}:${species}:${cohort}`;
        if (state.receipts[id] || state.jobs[id] || state.lots[id] || state.stocks[id]) {
          throw new Error("Conflicting winter slaughter batch");
        }
        const cohorts = { young: 0, breeding: 0, old: 0, [cohort]: heads };
        state.lots[id] = {
          id,
          shipmentId: `rural:${input.cellId}:${species}:${input.period}`,
          species,
          ownerId,
          locationId,
          heads,
          cohortProvenance: "aggregate",
          cohortHeads: cohorts
        };
        const receipt = commitSlaughter(
          state,
          { id, lotId: id, ownerId, locationId, period: input.period, heads },
          profile,
          { allowExperimental: true }
        );
        delete state.lots[id];
        herd[cohort] -= heads;
        monthlyNeed = Math.max(0, monthlyNeed - heads * perHeadFeed);
        sample.reason = perHeadFeed > 0 ? "feed-preparation" : sample.reason === "none" ? "mast-finish" : sample.reason;
        sample.heads[species] = (sample.heads[species] ?? 0) + heads;
        sample.cohortHeads[species] ??= { young: 0, breeding: 0, old: 0 };
        sample.cohortHeads[species][cohort] += heads;
        if (species === "Sheep") sample.foregoneAnnualWoolPotentialKg += heads * SHEEP_ANNUAL_WOOL_KG[cohort];
        const carcassKg = heads * profile.carcassKgPerHead;
        const edibleKg = receipt.portionsKg.lean + receipt.portionsKg.edibleFat;
        const fresh = Math.min(foodNeed, edibleKg);
        const preserve = edibleKg - fresh;
        const work = carcassKg * p.workDaysPerKg;
        foodNeed -= fresh;
        sample.freshConsumedKg += fresh;
        sample.carcassKg += carcassKg;
        sample.edibleRecoveredKg += edibleKg;
        sample.nonFoodKg += receipt.portionsKg.otherCarcass;
        sample.workDays += work;
        workLeft = Math.max(0, workLeft - work);
        handlingLeft = Math.max(0, handlingLeft - carcassKg);
        // Every compartment has exactly one terminal use; no legacy hide/tallow/rennet is credited.
        for (const kind of ["lean", "edibleFat", "otherCarcass"] as const)
          state.portions[`${id}:${kind}`].remainingKg = 0;
        if (preserve > 1e-9) {
          const salt = preserve * p.saltKgPerInputKg;
          const wood = preserve * fuelPerKg;
          const bill = Math.ceil(preserve * costPerKg * 100 - 1e-9) / 100;
          const output = preserve * (method === "smoked" ? p.smokedMeatRetention : p.saltedMeatRetention);
          state.jobs[id] = {
            id,
            batchId: id,
            cellId: input.cellId,
            ownerId,
            locationId,
            method,
            inputKg: preserve,
            saltIssuedKg: salt,
            saltRetainedKg: 0,
            saltDiscardedKg: salt,
            woodKg: wood,
            workDays: work * (preserve / edibleKg),
            startPeriod: input.period,
            readyPeriod: input.period + (method === "smoked" ? p.smokingPeriods : p.curingPeriods),
            shelfPeriods: p.preservedShelfPeriods,
            outputKg: output,
            lossKg: preserve - output,
            status: "processing"
          };
          storageLeft -= preserve;
          saltLeft -= salt;
          woodLeft -= wood;
          cashLeft -= bill;
          sample.preservationInputKg += preserve;
          sample.saltKg += salt;
          sample.woodKg += wood;
          sample.spending += bill;
        }
      }
    }
  sample.feedNeedAfterKg = feedNeed(input.herds);
  sample.sourceClosingCohorts = structuredClone(input.herds);
  sample.forecastUnmetAfterKg = forecastWinterFeedGap(
    sample.feedNeedAfterKg,
    input.forageKg,
    input.hayKg,
    input.cropResidues
  );
  sample.stockEndKg = ownStocks.reduce((sum, stock) => sum + stock.remainingKg, 0);
  sample.processingEndKg = Object.values(state.jobs).reduce(
    (sum, job) => sum + (job.cellId === input.cellId && job.status === "processing" ? job.inputKg : 0),
    0
  );
  const consumed = sample.freshConsumedKg + sample.preservedConsumedKg;
  sample.dietaryKcal = consumed * p.dietaryKcalPerKg;
  sample.dietaryProteinKg = consumed * p.dietaryProteinKgPerKg;
  state.lastPeriodByCell[input.cellId] = input.period;
  state.samples = state.samples.filter(row => row.period > input.period - 36);
  state.samples.push(sample);
  return sample;
}
