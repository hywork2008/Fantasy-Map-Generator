import { recordDeaths, useOptionsState, type WorldContext } from "../../hostCore";
import type { Burg } from "../../hostTypes";
import {
  addFrontierApplicants,
  getBanditCohorts,
  getBasicEmploymentSummary,
  getFrontierAdultCohorts,
  getMarketCellColumn,
  getMarkets,
  getMobileAdultCohorts,
  getSimulationYear,
  getUrbanLaborIntakes,
  setBanditCohorts,
  setFrontierAdultCohorts,
  setMobileAdultCohorts,
  setUrbanLaborIntakes
} from "../economyContext";
import { GROSS_FOOD_NEED } from "./foodConstants";
import type { FoodLedger } from "./marketTypes";
import type {
  BanditCohort,
  MobileAdultCohort,
  UrbanLaborIntake as UrbanLaborIntakeRecord
} from "./urbanLaborIntakeTypes";

/** Fraction of a burg's current population it can absorb as new workers in a neutral year. */
export const DEFAULT_ANNUAL_URBAN_INTAKE_RATE = 0.02;
const BUSINESS_CYCLE_MIN = 0.5;
const BUSINESS_CYCLE_RANGE = 1;
const LOCAL_VARIATION_MIN = 0.85;
const LOCAL_VARIATION_RANGE = 0.3;
const MAX_CITY_SEARCHES = 3;
const MAX_WALK_DISTANCE_FRACTION = 0.22;
/** Shortfall rate (raided / raidCapacity shortfall) that marks a raiding cohort as weakened. */
const RAID_WEAKENED_SHORTFALL = 0.05;
/** Shortfall rate severe enough to count toward the two-quarter shrinkage rule. */
const RAID_SEVERE_SHORTFALL = 0.1;
/** Consecutive severe-shortfall quarters before a cohort starts losing people. */
const RAID_SHRINK_QUARTERS = 2;
/** Fraction of the cohort (times its shortfall rate) lost per quarter once shrinking starts. */
const RAID_SHRINK_FACTOR = 0.1;
const FOOD_STOCK_AGE_KEYS = ["foodStockAge0", "foodStockAge1", "foodStockAge2"] as const;

export interface UrbanLaborRandom {
  rand(): number;
}

export interface UrbanMobilityResult {
  settledAdults: number;
  frontierApplicants: MobileAdultCohort[];
  banditAdults: number;
  deaths: number;
}

/** One quarter's outcome of raidBanditFood() across all bandit cohorts. */
export interface BanditRaidResult {
  weakenedCohorts: number;
  shrunkCohorts: number;
  totalRaided: number;
  totalShortfall: number;
}

/**
 * The deliberately small v1 urban-labour seam. It calculates new jobs yearly and
 * resolves cohorts that a later agricultural-labour system places into the queue.
 * It intentionally does not infer rural surplus from `cells.capacity`.
 */
export class UrbanLaborIntakeModule {
  /** Runs exactly once per simulation year, including the first enabled economy tick. */
  updateAnnualState(world: Readonly<WorldContext>, rng: UrbanLaborRandom): UrbanMobilityResult | null {
    const year = getSimulationYear();
    if (getUrbanLaborIntakes().some(intake => intake.year === year)) return null;
    this.generateAnnualIntakes(world, rng);
    return this.resolveMobileAdults(world, rng);
  }

  generateAnnualIntakes(world: Readonly<WorldContext>, rng: UrbanLaborRandom): UrbanLaborIntakeRecord[] {
    const year = getSimulationYear();
    const businessCycleByState = new Map<number, number>();
    const intakes: UrbanLaborIntakeRecord[] = [];

    // §5.1 decision 4 / Phase 4: total-driven employmentDemand replaces the population-self-
    // referencing formula only in "megacity" mode. In "independent" mode (the default), the
    // employmentDemand model (docs/plan/urban-employment-demand.md) is never evaluated — the
    // classic population*rate formula runs unchanged, matching the §6 invariant.
    const employmentDemandDriven = useOptionsState.getState().ruralUrbanMigration === "megacity";
    const employmentDemandByBurg = employmentDemandDriven
      ? new Map(
          getBasicEmploymentSummary().map(record => [
            record.burgId,
            record.basicEmploymentDemand + record.serviceEmploymentDemand
          ])
        )
      : null;

    for (const burg of world.pack.burgs) {
      if (!burg?.i || burg.removed || !burg.population || !burg.demographics) continue;
      const stateId = burg.state ?? 0;
      let businessCycle = businessCycleByState.get(stateId);
      if (businessCycle === undefined) {
        businessCycle = BUSINESS_CYCLE_MIN + rng.rand() * BUSINESS_CYCLE_RANGE;
        businessCycleByState.set(stateId, businessCycle);
      }

      const localVariation = LOCAL_VARIATION_MIN + rng.rand() * LOCAL_VARIATION_RANGE;
      const offeredAdults = employmentDemandByBurg
        ? calculateAnnualUrbanLaborIntakeFromEmploymentDemand(
            burg,
            employmentDemandByBurg.get(burg.i) ?? 0,
            businessCycle,
            localVariation
          )
        : calculateAnnualUrbanLaborIntake(burg, businessCycle, localVariation);
      intakes.push({
        burgId: burg.i,
        year,
        businessCycle,
        localVariation,
        offeredAdults,
        remainingAdults: offeredAdults
      });
    }

    setUrbanLaborIntakes(intakes);
    return intakes;
  }

  /** Stores rural excess without deciding its outcome; Phase 2 will call this after protecting farm labour. */
  enqueueRuralDisplacement(cohort: MobileAdultCohort): void {
    if (getAdultTotal(cohort) <= 0) return;
    const cohorts = getMobileAdultCohorts();
    cohorts.push({ ...cohort, yearsSearching: Math.max(0, cohort.yearsSearching) });
    setMobileAdultCohorts(cohorts);
  }

  /**
   * First tries up to three nearby burgs. A failed first-year search remains mobile;
   * a repeated failure becomes a frontier applicant, a bandit cohort, or mortality.
   *
   * Frontier-bound cohorts are aggregated straight into the host's frontier applicant pool
   * (docs/plan/megacity-food-import-economy.md §4.1) rather than held as an ever-growing list —
   * `advanceFrontierExpansion` drains that pool directly. Older saves may still carry leftover
   * `frontierAdultCohorts` from before this change; those are swept into the pool once here so
   * that population isn't left permanently stranded.
   */
  resolveMobileAdults(world: Readonly<WorldContext>, rng: UrbanLaborRandom): UrbanMobilityResult {
    const legacyFrontierApplicants = getFrontierAdultCohorts();
    if (legacyFrontierApplicants.length) {
      for (const cohort of legacyFrontierApplicants) {
        addFrontierApplicants(cohort.originState, cohort.maleAdults, cohort.femaleAdults);
      }
      setFrontierAdultCohorts([]);
    }

    const stillSearching: MobileAdultCohort[] = [];
    const frontierApplicants: MobileAdultCohort[] = [];
    const bandits = getBanditCohorts();
    let settledAdults = 0;
    let banditAdults = 0;
    let deaths = 0;

    for (const cohort of getMobileAdultCohorts()) {
      const unresolved = this.placeInNearbyBurgs(world, cohort);
      const remainingAdults = getAdultTotal(unresolved);
      settledAdults += getAdultTotal(cohort) - remainingAdults;
      if (remainingAdults <= 0) continue;

      if (unresolved.yearsSearching < 1) {
        stillSearching.push({ ...unresolved, yearsSearching: unresolved.yearsSearching + 1 });
        continue;
      }

      const outcome = rng.rand();
      if (outcome < 0.35) {
        frontierApplicants.push(unresolved);
        addFrontierApplicants(unresolved.originState, unresolved.maleAdults, unresolved.femaleAdults);
      } else if (outcome < 0.6) {
        bandits.push({
          originCell: unresolved.originCell,
          targetState: unresolved.originState,
          maleAdults: unresolved.maleAdults,
          femaleAdults: unresolved.femaleAdults
        });
        banditAdults += remainingAdults;
      } else {
        deaths += remainingAdults;
        recordDeaths(unresolved.originState, remainingAdults * (world.populationRate || 1), "other");
      }
    }

    setMobileAdultCohorts(stillSearching);
    setBanditCohorts(bandits);
    return { settledAdults, frontierApplicants, banditAdults, deaths };
  }

  /** Converts stored outlaw cohorts into a bounded per-state risk multiplier for TradeSecurity. */
  getBanditPressureByState(): ReadonlyMap<number, number> {
    const adultsByState = new Map<number, number>();
    for (const cohort of getBanditCohorts()) {
      adultsByState.set(cohort.targetState, (adultsByState.get(cohort.targetState) ?? 0) + getAdultTotal(cohort));
    }
    return new Map([...adultsByState].map(([stateId, adults]) => [stateId, Math.min(1, adults / 20)]));
  }

  /**
   * Quarterly: each bandit cohort raids its origin cell's Market for its basic food need,
   * taken from a randomly chosen non-empty age bucket rather than the normal oldest-first
   * FIFO order (docs/plan/megacity-food-import-economy.md §4.1 — raiding deliberately
   * disrupts, rather than follows, ordinary consumption/export). Bandits never return to
   * rural or urban population; a cohort that keeps missing its raid target shrinks instead.
   */
  raidBanditFood(world: Readonly<WorldContext>, rng: UrbanLaborRandom): BanditRaidResult {
    const populationRate = world.populationRate || 1;
    const marketCellColumn = getMarketCellColumn();
    const marketById = new Map(getMarkets().map(market => [market.i, market]));
    const survivors: BanditCohort[] = [];
    let weakenedCohorts = 0;
    let shrunkCohorts = 0;
    let totalRaided = 0;
    let totalShortfall = 0;

    for (const cohort of getBanditCohorts()) {
      const adults = getAdultTotal(cohort);
      if (adults <= 0) continue;

      const marketId = marketCellColumn[cohort.originCell];
      const ledger = marketId ? marketById.get(marketId)?.foodLedger : undefined;
      const raidCapacity = (adults * GROSS_FOOD_NEED) / 4;
      const raided = ledger ? raidRandomFoodStockBucket(ledger, raidCapacity, rng) : 0;
      const shortfallRate = raidCapacity > 0 ? Math.max(0, 1 - raided / raidCapacity) : 0;

      totalRaided += raided;
      totalShortfall += Math.max(0, raidCapacity - raided);
      if (shortfallRate >= RAID_WEAKENED_SHORTFALL) weakenedCohorts++;

      const consecutiveShortfallQuarters =
        shortfallRate >= RAID_SEVERE_SHORTFALL ? (cohort.consecutiveShortfallQuarters ?? 0) + 1 : 0;

      let { maleAdults, femaleAdults } = cohort;
      if (consecutiveShortfallQuarters >= RAID_SHRINK_QUARTERS) {
        const survivingRatio = Math.max(0, 1 - shortfallRate * RAID_SHRINK_FACTOR);
        const lost = (maleAdults + femaleAdults) * (1 - survivingRatio);
        maleAdults *= survivingRatio;
        femaleAdults *= survivingRatio;
        shrunkCohorts++;
        recordDeaths(cohort.targetState, lost * populationRate, "other");
      }

      if (maleAdults + femaleAdults > 0.001) {
        survivors.push({ ...cohort, maleAdults, femaleAdults, consecutiveShortfallQuarters });
      }
    }

    setBanditCohorts(survivors);
    return { weakenedCohorts, shrunkCohorts, totalRaided, totalShortfall };
  }

  clear(): void {
    setUrbanLaborIntakes([]);
    setMobileAdultCohorts([]);
    setFrontierAdultCohorts([]);
    setBanditCohorts([]);
  }

  private placeInNearbyBurgs(world: Readonly<WorldContext>, cohort: MobileAdultCohort): MobileAdultCohort {
    const origin = world.pack.cells.p[cohort.originCell];
    if (!origin) return cohort;

    const maximumDistance = Math.hypot(world.graphWidth, world.graphHeight) * MAX_WALK_DISTANCE_FRACTION;
    const candidates = getUrbanLaborIntakes()
      .filter(intake => intake.remainingAdults > 0)
      .map(intake => ({ intake, burg: world.pack.burgs[intake.burgId] }))
      .filter((candidate): candidate is { intake: UrbanLaborIntakeRecord; burg: Burg } => {
        const burg = candidate.burg;
        if (!burg?.i || burg.removed || burg.state !== cohort.originState) return false;
        return Math.hypot(burg.x - origin[0], burg.y - origin[1]) <= maximumDistance;
      })
      .sort((a, b) => distanceTo(origin, a.burg) - distanceTo(origin, b.burg))
      .slice(0, MAX_CITY_SEARCHES);

    const unresolved = { ...cohort };
    for (const { intake, burg } of candidates) {
      const accepted = Math.min(getAdultTotal(unresolved), intake.remainingAdults);
      if (accepted <= 0) continue;
      const [acceptedMale, acceptedFemale] = splitAdults(unresolved, accepted);
      addAdultsToBurg(burg, acceptedMale, acceptedFemale);
      unresolved.maleAdults -= acceptedMale;
      unresolved.femaleAdults -= acceptedFemale;
      intake.remainingAdults -= accepted;
      if (getAdultTotal(unresolved) <= 0) break;
    }
    setUrbanLaborIntakes(getUrbanLaborIntakes());
    return unresolved;
  }
}

export function calculateAnnualUrbanLaborIntake(
  burg: Pick<Burg, "population" | "demographics">,
  businessCycle: number,
  localVariation: number,
  intakeRate = DEFAULT_ANNUAL_URBAN_INTAKE_RATE
): number {
  const population = Math.max(0, burg.population ?? 0);
  const capacity = Math.max(0, burg.demographics?.effectiveCapacity ?? burg.demographics?.capacity ?? 0);
  const remainingCapacity = Math.max(0, capacity - population);
  return Math.min(
    remainingCapacity,
    population * Math.max(0, intakeRate) * Math.max(0, businessCycle) * Math.max(0, localVariation)
  );
}

/**
 * Total-driven replacement for `calculateAnnualUrbanLaborIntake()` (§5.1 decision 4,
 * docs/plan/urban-employment-demand.md §3.6): a Burg only draws new adults while its
 * `employmentDemand` (basic + service, `basicEmploymentSummary`) exceeds the adults it
 * already has — an unfilled-jobs gap, not a self-referencing share of current population.
 * `businessCycle`/`localVariation` remain as job-filling-speed friction; neither
 * `employmentDemand` nor its inputs (Phases 1-3) carry their own randomness, so this does not
 * double-count variability.
 */
export function calculateAnnualUrbanLaborIntakeFromEmploymentDemand(
  burg: Pick<Burg, "population" | "demographics">,
  employmentDemand: number,
  businessCycle: number,
  localVariation: number
): number {
  const population = Math.max(0, burg.population ?? 0);
  const capacity = Math.max(0, burg.demographics?.effectiveCapacity ?? burg.demographics?.capacity ?? 0);
  const remainingCapacity = Math.max(0, capacity - population);
  const currentAdultPopulation = Math.max(
    0,
    (burg.demographics?.maleAdults ?? 0) + (burg.demographics?.femaleAdults ?? 0)
  );
  const unfilledDemand = Math.max(0, employmentDemand - currentAdultPopulation);
  return Math.min(remainingCapacity, unfilledDemand * Math.max(0, businessCycle) * Math.max(0, localVariation));
}

function getAdultTotal(cohort: Pick<MobileAdultCohort, "maleAdults" | "femaleAdults">): number {
  return Math.max(0, cohort.maleAdults) + Math.max(0, cohort.femaleAdults);
}

function splitAdults(cohort: MobileAdultCohort, accepted: number): [number, number] {
  const total = getAdultTotal(cohort);
  if (total <= 0) return [0, 0];
  const male = Math.min(Math.max(0, cohort.maleAdults), accepted * (Math.max(0, cohort.maleAdults) / total));
  return [male, Math.min(Math.max(0, cohort.femaleAdults), accepted - male)];
}

function addAdultsToBurg(burg: Burg, maleAdults: number, femaleAdults: number): void {
  if (!burg.demographics) return;
  burg.demographics.maleAdults += maleAdults;
  burg.demographics.femaleAdults += femaleAdults;
  burg.population = Math.max(0, burg.population ?? 0) + maleAdults + femaleAdults;
}

function distanceTo(origin: readonly [number, number], burg: Pick<Burg, "x" | "y">): number {
  return Math.hypot(burg.x - origin[0], burg.y - origin[1]);
}

/** Deducts up to `amount` from one randomly chosen non-empty age bucket; returns the amount taken. */
function raidRandomFoodStockBucket(ledger: FoodLedger, amount: number, rng: UrbanLaborRandom): number {
  if (amount <= 0) return 0;
  const nonEmptyKeys = FOOD_STOCK_AGE_KEYS.filter(key => ledger[key] > 0);
  if (!nonEmptyKeys.length) return 0;
  const key = nonEmptyKeys[Math.floor(rng.rand() * nonEmptyKeys.length)] ?? nonEmptyKeys[0];
  const raided = Math.min(amount, ledger[key]);
  ledger[key] -= raided;
  return raided;
}

export const UrbanLaborIntake = new UrbanLaborIntakeModule();
