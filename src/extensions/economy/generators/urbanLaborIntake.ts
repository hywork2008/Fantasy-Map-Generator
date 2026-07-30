import type { WorldContext } from "../../hostCore";
import type { Burg } from "../../hostTypes";
import {
  getBanditCohorts,
  getFrontierAdultCohorts,
  getMobileAdultCohorts,
  getSimulationYear,
  getUrbanLaborIntakes,
  setBanditCohorts,
  setFrontierAdultCohorts,
  setMobileAdultCohorts,
  setUrbanLaborIntakes
} from "../economyContext";

/** Fraction of a burg's current population it can absorb as new workers in a neutral year. */
export const DEFAULT_ANNUAL_URBAN_INTAKE_RATE = 0.02;
const BUSINESS_CYCLE_MIN = 0.5;
const BUSINESS_CYCLE_RANGE = 1;
const LOCAL_VARIATION_MIN = 0.85;
const LOCAL_VARIATION_RANGE = 0.3;
const MAX_CITY_SEARCHES = 3;
const MAX_WALK_DISTANCE_FRACTION = 0.22;

export interface UrbanLaborRandom {
  rand(): number;
}

/** A burg's new-worker capacity for a single year; it does not model incumbent jobs. */
export interface UrbanLaborIntake {
  burgId: number;
  year: number;
  businessCycle: number;
  localVariation: number;
  offeredAdults: number;
  remainingAdults: number;
}

/** Adults expelled by rural labour allocation, awaiting a city, frontier, or outlaw outcome. */
export interface MobileAdultCohort {
  originCell: number;
  originState: number;
  maleAdults: number;
  femaleAdults: number;
  yearsSearching: number;
}

/** People outside a burg or rural cell who subsist through predation until later security work resolves them. */
export interface BanditCohort {
  originCell: number;
  targetState: number;
  maleAdults: number;
  femaleAdults: number;
}

export interface UrbanMobilityResult {
  settledAdults: number;
  frontierApplicants: MobileAdultCohort[];
  banditAdults: number;
  deaths: number;
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

  generateAnnualIntakes(world: Readonly<WorldContext>, rng: UrbanLaborRandom): UrbanLaborIntake[] {
    const year = getSimulationYear();
    const businessCycleByState = new Map<number, number>();
    const intakes: UrbanLaborIntake[] = [];

    for (const burg of world.pack.burgs) {
      if (!burg?.i || burg.removed || !burg.population || !burg.demographics) continue;
      const stateId = burg.state ?? 0;
      let businessCycle = businessCycleByState.get(stateId);
      if (businessCycle === undefined) {
        businessCycle = BUSINESS_CYCLE_MIN + rng.rand() * BUSINESS_CYCLE_RANGE;
        businessCycleByState.set(stateId, businessCycle);
      }

      const localVariation = LOCAL_VARIATION_MIN + rng.rand() * LOCAL_VARIATION_RANGE;
      const offeredAdults = calculateAnnualUrbanLaborIntake(burg, businessCycle, localVariation);
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
   */
  resolveMobileAdults(world: Readonly<WorldContext>, rng: UrbanLaborRandom): UrbanMobilityResult {
    const stillSearching: MobileAdultCohort[] = [];
    const frontierApplicants = getFrontierAdultCohorts();
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
      }
    }

    setMobileAdultCohorts(stillSearching);
    setFrontierAdultCohorts(frontierApplicants);
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
      .filter((candidate): candidate is { intake: UrbanLaborIntake; burg: Burg } => {
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

export const UrbanLaborIntake = new UrbanLaborIntakeModule();
